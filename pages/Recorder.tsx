
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { LogEntry, Message, Sender, Project, LinkedRecord } from '../types';
import { getLogById, saveLog, getProjectById, getConcreteRecordById } from '../services/storageService';
import { sendMessageToGemini, transcribeAudio } from '../services/geminiService';
import { fetchRealWeather } from '../services/weatherService';
import { WavRecorder, blobToBase64 } from '../services/audioRecorder';

// WeChat Colors
const COLORS = {
  bg: 'bg-[#EDEDED]',
  toolbar: 'bg-[#F7F7F7]',
  userBubble: 'bg-[#95EC69]',
  aiBubble: 'bg-white',
  textInput: 'bg-white',
  voiceBtn: 'bg-white',
  voiceBtnActive: 'bg-red-50 text-red-600 border-red-200',
};

const Recorder: React.FC = () => {
  const { projectId, id } = useParams<{ projectId: string, id: string }>();
  const navigate = useNavigate();
  
  // Data State
  const [log, setLog] = useState<LogEntry | null>(null);
  const [project, setProject] = useState<Project | undefined>(undefined);
  
  // UI State
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('voice'); 
  const [showPlusPanel, setShowPlusPanel] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  
  // New State for Finish Action
  const [isFinishing, setIsFinishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Track background saves
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Suggested Actions State
  const [linkedRecordStatus, setLinkedRecordStatus] = useState<Record<string, 'draft' | 'completed'>>({});
  const linkedRecordStatusRef = useRef<Record<string, 'draft' | 'completed'>>({});

  useEffect(() => {
      linkedRecordStatusRef.current = linkedRecordStatus;
  }, [linkedRecordStatus]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
        let currentProject = project;
        if (projectId && !currentProject) {
            currentProject = await getProjectById(projectId);
            if (currentProject) {
                setProject(currentProject);
            }
        }

        if (id === 'new') {
            if (initRef.current) return;
            initRef.current = true;

            const now = new Date();
            const todayISO = now.toISOString().split('T')[0];
            const initialLocation = currentProject?.location || '';

            const newLog: LogEntry = {
                id: Date.now().toString(),
                projectId: projectId || 'default', 
                date: todayISO,
                weather: '正在定位并获取天气...', 
                location: initialLocation, 
                messages: [{
                    id: 'welcome',
                    sender: Sender.AI,
                    text: '你好！我是你的智能监理助手。点击下方麦克风开始说话。',
                    timestamp: Date.now()
                }],
                report: null,
                status: 'draft',
                lastModified: Date.now(),
                linkedRecords: []
            };
            
            try {
                const realId = await saveLog(newLog);
                navigate(`/project/${projectId}/record/${realId}`, { replace: true });
            } catch (e) {
                console.error("Failed to create log", e);
            }

        } else if (id) {
            const existing = await getLogById(id);
            if (existing) {
                setLog(existing);
                if (existing.linkedRecords && existing.linkedRecords.length > 0) {
                    const statuses: Record<string, any> = {};
                    for (const rec of existing.linkedRecords) {
                        if (rec.type === 'concrete') {
                            const rData = await getConcreteRecordById(rec.id);
                            if (rData) {
                                statuses[rec.id] = rData.status;
                            }
                        }
                    }
                    setLinkedRecordStatus(statuses);
                }

                if (existing.weather === '正在定位并获取天气...') {
                    setIsWeatherLoading(true);
                    fetchRealWeather().then((result) => {
                        setLog(prev => {
                            if (!prev) return null;
                            const updated = { 
                                ...prev, 
                                weather: result.weather,
                                lastModified: Date.now()
                            };
                            // Optimistic update for weather without blocking
                            safeSaveLog(updated); 
                            return updated;
                        });
                        setIsWeatherLoading(false);
                    });
                }
            } else {
                navigate(`/project/${projectId}/logs`);
            }
        }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projectId, navigate]); 

  useEffect(() => {
    scrollToBottom();
  }, [log?.messages, log?.linkedRecords, isLoading, showPlusPanel, inputMode]);

  useEffect(() => {
      if (isRecording) {
          timerRef.current = setInterval(() => {
              setRecordingDuration(prev => prev + 1);
          }, 1000);
      } else {
          if (timerRef.current) clearInterval(timerRef.current);
          setRecordingDuration(0);
      }
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, [isRecording]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    } catch (e) {
        return dateStr;
    }
  };

  const handleRefreshWeather = async () => {
      setIsWeatherLoading(true);
      setLog(prev => prev ? ({ ...prev, weather: '正在更新定位...' }) : null);
      try {
          const result = await fetchRealWeather();
          setLog(prev => {
              if (!prev) return null;
              const updated = { 
                  ...prev, 
                  weather: result.weather, 
                  lastModified: Date.now() 
              };
              safeSaveLog(updated);
              return updated;
          });
      } catch (e) {
      } finally {
          setIsWeatherLoading(false);
      }
  };

  // Helper to save safely (swallows errors for auto-saves)
  // This is crucial for Dev Mode where storage might be full
  const safeSaveLog = async (logToSave: LogEntry) => {
      setIsSaving(true);
      try {
          await saveLog(logToSave);
      } catch (e) {
          console.warn("Auto-save failed (likely storage quota). Ignored to keep flow.", e);
      } finally {
          setIsSaving(false);
      }
  };

  const checkAndCreateLinkedRecord = async (text: string) => {
      const isConcreteTask = (text.includes('混凝土') || text.includes('浇筑')) && text.includes('旁站');
      if (!isConcreteTask) return;

      setLog(prevLog => {
           if (!prevLog) return null;
           const hasPending = prevLog.linkedRecords?.some(r => {
                if (r.type !== 'concrete') return false;
                const currentStatus = linkedRecordStatusRef.current[r.id] || r.status;
                return currentStatus !== 'completed';
           });

           if (hasPending) {
               return prevLog;
           }

           const newRecordId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(); 
           const newLink: LinkedRecord = {
               id: newRecordId,
               type: 'concrete',
               status: 'draft', 
               title: '混凝土浇筑旁站'
           };
           
           linkedRecordStatusRef.current = { ...linkedRecordStatusRef.current, [newRecordId]: 'draft' };
           
           setTimeout(() => {
                setLinkedRecordStatus(prev => ({ ...prev, [newRecordId]: 'draft' }));
           }, 0);

           const updatedRecords = [...(prevLog.linkedRecords || []), newLink];
           const updatedLog = { ...prevLog, linkedRecords: updatedRecords, lastModified: Date.now() };
           
           safeSaveLog(updatedLog);

           return updatedLog;
      });
  };

  const handleSendMessage = async (text: string, imageUrl?: string) => {
    if (!log) return;
    if (!text.trim() && !imageUrl) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: Sender.USER,
      text: text,
      imageUrl: imageUrl,
      timestamp: Date.now()
    };

    // Update State & DB
    const updatedLog = await updateLogWithNewMessage(newMessage);
    
    checkAndCreateLinkedRecord(text);

    setInputText('');
    setShowPlusPanel(false); 
    setIsLoading(true);

    const aiResponseText = await sendMessageToGemini(updatedLog.messages, text, imageUrl?.split(',')[1]);
    await addAiResponse(aiResponseText);
  };

  const handleAudioMessage = async (audioBase64: string) => {
      if (!log) return;

      const userMsgId = Date.now().toString();
      const userMessage: Message = {
          id: userMsgId,
          sender: Sender.USER,
          text: '正在转写...', 
          audioUrl: audioBase64,
          timestamp: Date.now()
      };

      // 1. Optimistic Update
      await new Promise<void>(resolve => {
        setLog(prev => {
            if (!prev) return null;
            const updated = { ...prev, messages: [...prev.messages, userMessage], lastModified: Date.now() };
            // Try to save, but don't crash if it fails (e.g. storage full)
            safeSaveLog(updated); 
            resolve();
            return updated;
        });
      });
      
      setIsLoading(true);

      try {
          // 2. Transcribe
          const transcribedText = await transcribeAudio(audioBase64);

          // 3. Update with Transcribed Text
          let latestLog: LogEntry | null = null;
          
          await new Promise<void>(resolve => {
            setLog(prev => {
                if (!prev) { resolve(); return null; }
                const messagesWithTranscribed = prev.messages.map(m => 
                   m.id === userMsgId ? { ...m, text: transcribedText } : m
                );
                const updated = { ...prev, messages: messagesWithTranscribed, lastModified: Date.now() };
                
                // IMPORTANT: We wait for this save but catch errors
                latestLog = updated;
                resolve();
                return updated;
            });
          });
          
          if (latestLog) await safeSaveLog(latestLog);

          // 4. Send to AI
          if (latestLog && transcribedText && !transcribedText.startsWith('（')) {
              checkAndCreateLinkedRecord(transcribedText);
              const aiResponseText = await sendMessageToGemini((latestLog as LogEntry).messages, transcribedText);
              await addAiResponse(aiResponseText);
          } else {
             setIsLoading(false);
          }
      } catch (error) {
          console.error("Audio Message Error", error);
          setIsLoading(false);
      }
  };

  const updateLogWithNewMessage = async (msg: Message) => {
      return new Promise<LogEntry>((resolve) => {
          setLog(prev => {
              if (!prev) return null;
              const updatedMessages = [...prev.messages, msg];
              const updatedLog = { ...prev, messages: updatedMessages, lastModified: Date.now() };
              safeSaveLog(updatedLog); // Background save
              resolve(updatedLog);
              return updatedLog;
          });
      });
  };

  const addAiResponse = async (text: string, currentLog: LogEntry | null = log) => {
      setLog(prev => {
          const baseLog = prev || currentLog;
          if (!baseLog) return null;
          
          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            sender: Sender.AI,
            text: text,
            timestamp: Date.now()
          };
          const finalLog = { 
            ...baseLog, 
            messages: [...baseLog.messages, aiMessage], 
            lastModified: Date.now() 
          };
          safeSaveLog(finalLog); // Background save
          return finalLog;
      });
      setIsLoading(false);
  };

  // --- Audio Recording Logic (WAV) ---
  const toggleRecording = async () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
  };

  const startRecording = async () => {
    if (!window.isSecureContext) {
        alert("⚠️ 麦克风无法访问\n\n原因：当前使用IP访问(HTTP)属于非安全环境。\n\n请使用 HTTPS 访问或在浏览器中配置安全例外。");
        return;
    }

    try {
        const recorder = new WavRecorder();
        await recorder.start();
        wavRecorderRef.current = recorder;
        setIsRecording(true);
    } catch (err) {
        console.error("Mic Error:", err);
        alert("无法访问麦克风，请检查权限设置。");
        setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!isRecording || !wavRecorderRef.current) return;
    setIsRecording(false); 
    
    try {
        const wavBlob = await wavRecorderRef.current.stop();
        if (wavBlob.size < 100) return; 

        const base64Audio = await blobToBase64(wavBlob);
        handleAudioMessage(base64Audio);
    } catch (e) {
        console.error("Recording Stop Error", e);
    }
    wavRecorderRef.current = null;
  };

  const playAudio = (url: string, id: string) => {
      const audio = new Audio(url);
      setPlayingAudioId(id);
      audio.play();
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => {
          alert("播放失败");
          setPlayingAudioId(null);
      };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleSendMessage("（用户发送了一张图片）", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleFinish = async () => {
    if (!log) return;
    
    // Guard: Loading
    if (isLoading) {
        alert("请等待 AI 回复完成后再点击完成，以防数据丢失。");
        return;
    }
    // Guard: Saving
    if (isSaving) {
        // Wait a bit or block? Blocking is safer.
        alert("正在同步数据，请稍后...");
        return;
    }

    if (log.messages.length <= 1) {
        alert("请先记录一些内容再生成日报");
        return;
    }

    setIsFinishing(true);
    
    try {
        const completedLog: LogEntry = {
            ...log,
            status: 'completed',
            lastModified: Date.now()
        };
        
        // Optimistic update
        setLog(completedLog);
        
        // Try Standard Save First
        await saveLog(completedLog);
        
        navigate(`/project/${projectId}/report/${completedLog.id}?autoGenerate=true`, { replace: true });
    } catch (e) {
        console.warn("Standard save failed (likely storage quota), attempting slim save...", e);
        
        // Fallback: Slim Save (Strip audio to reduce payload)
        // This is ESSENTIAL for Dev Mode (LocalStorage) which has small limits (~5MB)
        try {
            const slimMessages = log.messages.map(m => {
                // Remove heavy fields if present
                const { audioUrl, ...rest } = m; 
                return rest;
            });
            const slimLog: LogEntry = {
                ...log,
                messages: slimMessages,
                status: 'completed',
                lastModified: Date.now()
            };
            
            await saveLog(slimLog);
            setLog(slimLog); // Update local state to match DB
            navigate(`/project/${projectId}/report/${slimLog.id}?autoGenerate=true`, { replace: true });
            
        } catch (slimError) {
            console.error("Slim save also failed", slimError);
            alert("保存失败：存储空间不足且无法精简数据。建议删除部分旧日志后重试。");
            setIsFinishing(false);
        }
    }
  };

  const handleSmartCardClick = (link: LinkedRecord) => {
      if (link.type === 'concrete') {
          navigate(`/project/${projectId}/side/concrete/${link.id}?returnToLog=${log?.id}`);
      }
  };

  const TitleComponent = (
    <div className="inline-flex items-center gap-1 relative px-2 py-0.5 rounded active:bg-gray-200/80 transition-colors cursor-pointer select-none">
        <span>{log ? `${formatDateForDisplay(log.date)} 记录` : '现场记录'}</span>
        {log && <input type="date" value={log.date} onChange={async (e) => {
            if (!log) return;
            const val = e.target.value;
            setLog(prev => {
                if (!prev) return null;
                const updated = { ...prev, date: val, lastModified: Date.now() };
                safeSaveLog(updated);
                return updated;
            });
        }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />}
    </div>
  );

  const visibleLinkedRecords = log?.linkedRecords?.filter(link => {
      const status = linkedRecordStatus[link.id] || link.status;
      return status !== 'completed';
  });

  if (!log) return <div className="p-4 flex items-center justify-center h-full">Loading...</div>;

  return (
    <Layout title={TitleComponent} showBack onBack={() => navigate(`/project/${projectId}/logs`)} headerRight={
        <button 
            onClick={handleFinish} 
            disabled={isFinishing || isLoading || isSaving}
            className={`text-sm font-semibold px-3 py-1.5 rounded-[4px] transition-all active:scale-95 flex items-center justify-center min-w-[50px]
                ${(isFinishing || isLoading || isSaving) ? 'bg-green-400 cursor-not-allowed opacity-80' : 'bg-[#07C160] hover:bg-[#06ad56] text-white'}
            `}
        >
            {isFinishing ? (
                 <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
            ) : (isSaving ? '同步中' : '完成')}
        </button>
    }>
      <div className="bg-[#EDEDED] px-3 py-2 border-b border-gray-300 z-10">
        <div className="flex items-center gap-2">
           <div className="flex-1 relative">
               <input 
                   type="text"
                   value={log.weather}
                   onChange={(e) => {
                       const val = e.target.value;
                       setLog(prev => {
                           if(!prev) return null;
                           const updated = { ...prev, weather: val, lastModified: Date.now() };
                           safeSaveLog(updated); 
                           return updated;
                       });
                   }}
                   className="w-full h-8 text-xs text-center bg-white border border-gray-200 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-gray-600 placeholder-gray-400 transition-all shadow-sm"
                   placeholder="天气与位置信息"
               />
           </div>
           
           <button 
               onClick={handleRefreshWeather}
               disabled={isWeatherLoading}
               title="重新定位获取天气"
               className="h-8 w-8 flex items-center justify-center bg-white border border-gray-200 rounded-md text-gray-600 active:bg-gray-100 active:scale-95 transition-all shadow-sm"
           >
               {isWeatherLoading ? (
                   <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
               ) : (
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                   </svg>
               )}
           </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-4 ${COLORS.bg}`} onClick={() => setShowPlusPanel(false)}>
        <div className="space-y-4 py-4">
          {log.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === Sender.USER ? 'justify-end' : 'justify-start'} items-start gap-2`}>
              {msg.sender === Sender.AI && (
                 <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
              )}
              
              <div className={`max-w-[75%] rounded-[6px] shadow-sm text-[16px] leading-relaxed relative break-words overflow-hidden ${
                msg.sender === Sender.USER ? `${COLORS.userBubble} text-black` : `${COLORS.aiBubble} text-gray-800 border border-gray-200`
              }`}>
                 {msg.audioUrl && (
                     <div 
                        className="flex items-center gap-2 p-2.5 cursor-pointer active:opacity-70 select-none border-b border-black/5 min-w-[120px]"
                        onClick={() => playAudio(msg.audioUrl!, msg.id)}
                     >
                        <div className="w-5 h-5 flex items-center justify-center">
                            {playingAudioId === msg.id ? (
                                <span className="animate-pulse">🔊</span> 
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 opacity-70">
                                    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 2.485.735 4.817 2.038 6.784.072.11.163.2.27.265l.006.004a2.625 2.625 0 0 0 2.924-.766l.872-.871a2.25 2.25 0 0 1 1.591-.659h1.16c.382 0 .736-.156 1.006-.426l4.5-4.5c.945-.945 2.56-1.604 2.56-2.94V4.06Zm-6.52 6.505a.75.75 0 0 0 1.06 0l4.5-4.5a.75.75 0 0 0-1.06-1.06l-4.5 4.5ZM17.25 10.5a.75.75 0 0 0 0 1.5h.75a.75.75 0 0 0 0-1.5h-.75Zm3.75 0a.75.75 0 0 0 0 1.5h.75a.75.75 0 0 0 0-1.5h-.75Z" />
                                </svg>
                            )}
                        </div>
                        <span className="text-sm font-medium opacity-80">{playingAudioId === msg.id ? '播放中...' : '播放语音'}</span>
                     </div>
                 )}

                 <div className="p-2.5">
                    {msg.sender === Sender.USER ? (
                        <div className={`absolute top-3 -right-1.5 w-3 h-3 ${COLORS.userBubble} rotate-45 transform`}></div>
                    ) : (
                        <div className={`absolute top-3 -left-1.5 w-3 h-3 ${COLORS.aiBubble} border-l border-b border-gray-200 rotate-45 transform`}></div>
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                        {msg.imageUrl && (
                            <img src={msg.imageUrl} alt="upload" className="mb-2 rounded max-h-48 object-cover min-w-[100px] bg-gray-100" />
                        )}
                        <span className="whitespace-pre-wrap">{msg.text}</span>
                        {msg.text === '正在转写...' && (
                            <div className="flex items-center gap-1.5">
                                <span className="animate-spin h-3 w-3 border-2 border-gray-500 border-t-transparent rounded-full"></span>
                            </div>
                        )}
                    </div>
                 </div>
              </div>

               {msg.sender === Sender.USER && (
                 <div className="w-10 h-10 rounded bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0 overflow-hidden">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-500">
                     <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                   </svg>
                 </div>
              )}
            </div>
          ))}

          {isLoading && (
             <div className="flex justify-start items-center gap-2">
                <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">AI</div>
                <div className="bg-white px-3 py-2 rounded-[6px] border border-gray-200 text-sm text-gray-400 flex items-center gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce delay-100">●</span>
                  <span className="animate-bounce delay-200">●</span>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className={`shrink-0 ${COLORS.toolbar} border-t border-[#DCDCDC] pb-safe transition-all duration-200 z-20`}>
        {visibleLinkedRecords && visibleLinkedRecords.length > 0 && (
            <div className="px-3 pt-2 flex flex-col gap-2">
                {visibleLinkedRecords.map(link => (
                    <div 
                        key={link.id} 
                        onClick={() => handleSmartCardClick(link)}
                        className="rounded-xl p-3 shadow-md flex items-center justify-between cursor-pointer border transition-all animate-in slide-in-from-bottom-2 bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-lg"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-amber-800">
                                    {link.title}
                                </h4>
                                <p className="text-xs text-amber-600">
                                    草稿状态 - 点击继续填写
                                </p>
                            </div>
                        </div>
                        <div className="text-amber-500">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                        </div>
                    </div>
                ))}
            </div>
        )}

        <div className="flex items-end gap-2 px-3 py-2 min-h-[56px]">
          <button 
            onClick={() => {
                setInputMode(prev => prev === 'text' ? 'voice' : 'text');
                setShowPlusPanel(false);
            }}
            disabled={isRecording}
            className={`mb-1.5 p-1 text-gray-600 active:opacity-50 ${isRecording ? 'opacity-30' : ''}`}
          >
            {inputMode === 'text' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                    <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                    <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                    <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" />
                </svg>
            )}
          </button>
          <div className="flex-1 mb-1">
            {inputMode === 'text' ? (
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className={`${COLORS.textInput} w-full rounded-[4px] px-3 py-2 text-[16px] leading-5 border-none outline-none resize-none max-h-32 min-h-[40px] shadow-sm`}
                    rows={1}
                    style={{ height: 'auto' }}
                />
            ) : (
                <button
                    className={`w-full h-[40px] rounded-[4px] font-medium text-[16px] select-none transition-all duration-200 flex items-center justify-center gap-2 ${
                        isRecording ? COLORS.voiceBtnActive : COLORS.voiceBtn
                    } shadow-sm border border-gray-200`}
                    onClick={toggleRecording}
                >
                    {isRecording ? (
                        <>
                            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm animate-pulse"></div>
                            <span className="text-red-600 font-bold">点击停止 ({recordingDuration}s)</span>
                        </>
                    ) : (
                        <>
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-700">
                                <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                                <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                             </svg>
                             <span className="text-gray-800">点击开始录音</span>
                        </>
                    )}
                </button>
            )}
          </div>
          {inputText.trim() ? (
              <button 
                onClick={() => handleSendMessage(inputText)}
                className="mb-1.5 px-3 py-1.5 bg-[#07C160] text-white text-sm font-bold rounded-[4px] hover:bg-[#06ad56] transition-colors"
              >
                发送
              </button>
          ) : (
            <button 
                onClick={() => setShowPlusPanel(!showPlusPanel)}
                disabled={isRecording}
                className={`mb-1.5 p-1 text-gray-600 transition-transform ${showPlusPanel ? 'rotate-45' : ''} ${isRecording ? 'opacity-30' : ''}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
                </svg>
            </button>
          )}
        </div>
        
        {showPlusPanel && !isRecording && (
            <div className={`h-60 border-t border-[#DCDCDC] ${COLORS.toolbar} p-6 grid grid-cols-4 gap-6 animate-in slide-in-from-bottom duration-200`}>
                <div className="flex flex-col items-center gap-2">
                    <button 
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-gray-600 border border-gray-200 active:bg-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                        </svg>
                        <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
                    </button>
                    <span className="text-xs text-gray-500">拍摄</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <button 
                         onClick={() => galleryInputRef.current?.click()}
                        className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-gray-600 border border-gray-200 active:bg-gray-100"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                             <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                         </svg>
                        <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                    </button>
                     <span className="text-xs text-gray-500">相册</span>
                </div>
            </div>
        )}
      </div>

      {isRecording && (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm cursor-pointer"
            onClick={stopRecording} 
        >
            <div className="flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-300">
                <div className="relative">
                    <div className="w-32 h-32 bg-blue-500/20 rounded-full animate-ping absolute inset-0"></div>
                    <div className="w-32 h-32 bg-blue-500/40 rounded-full animate-pulse absolute inset-0 delay-75"></div>
                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-2xl relative z-10">
                         <div className="w-12 h-12 bg-red-500 rounded-md transition-all duration-300 hover:scale-90"></div>
                    </div>
                </div>
                
                <div className="text-center text-white drop-shadow-md">
                    <h3 className="text-2xl font-bold mb-1">正在聆听...</h3>
                    <p className="text-white/80 font-mono text-lg">{recordingDuration}s</p>
                    <p className="text-sm mt-4 opacity-70 border border-white/30 rounded-full px-4 py-1">点击屏幕任意位置完成</p>
                </div>
            </div>
        </div>
      )}
    </Layout>
  );
};

export default Recorder;
