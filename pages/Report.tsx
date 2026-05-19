
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { LogEntry } from '../types';
import { getLogById, saveLog, isDevMode, supabase } from '../services/storageService';
import { generateReportFromHistory } from '../services/geminiService';

const escapeHtml = (value: string | number | null | undefined) => String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return map[char];
});

const Report: React.FC = () => {
  const { projectId, id } = useParams<{ projectId: string, id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [log, setLog] = useState<LogEntry | null>(null);
  const [reportDate, setReportDate] = useState('');
  
  // Editable State for the 3 Categories
  const [engineeringText, setEngineeringText] = useState('');
  const [supervisorText, setSupervisorText] = useState('');
  const [safetyText, setSafetyText] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Preview State
  const [showPreview, setShowPreview] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  // Scale state for responsive preview
  const [scale, setScale] = useState(1);

  // Prevent double firing of effects
  const generationAttempted = useRef(false);

  useEffect(() => {
    const init = async () => {
        if (id) {
            const existing = await getLogById(id);
            if (existing) {
                setLog(existing);
                setReportDate(existing.date);
                
                // Populate text fields if report exists
                if (existing.report) {
                    setEngineeringText((existing.report.engineering || []).join('\n'));
                    setSupervisorText((existing.report.supervisor || []).join('\n'));
                    setSafetyText((existing.report.safety || []).join('\n'));
                } 
                
                // --- AUTO-GENERATION LOGIC ---
                // If report is NULL or query param requests it, we trigger generation.
                const shouldGenerate = !existing.report || searchParams.get('autoGenerate') === 'true';
                
                if (shouldGenerate && !generationAttempted.current && !isGenerating) {
                    generationAttempted.current = true;
                    generateReport(existing);
                }
            } else {
                navigate(`/project/${projectId}/logs`);
            }
        }
    };
    init();
  }, [id, projectId, navigate, searchParams]);

  // Calculate scale for preview when modal opens or window resizes
  useEffect(() => {
    if (showPreview) {
        const handleResize = () => {
            // A4 width in pixels (approx) at 96 DPI is 794px
            const a4WidthPx = 794; 
            // Available width with some padding (e.g., 32px total padding for margins)
            const availableWidth = window.innerWidth - 32;
            
            if (availableWidth < a4WidthPx) {
                setScale(availableWidth / a4WidthPx);
            } else {
                setScale(1);
            }
        };
        
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }
  }, [showPreview]);

  const generateReport = async (currentLog: LogEntry) => {
    setIsGenerating(true);
    try {
        const report = await generateReportFromHistory(
            currentLog.messages,
            currentLog.date,
            currentLog.weather,
            currentLog.location
        );

        if (report) {
            // Success
            const updatedLog = {
                ...currentLog,
                report: report,
                lastModified: Date.now()
            };
            await saveLog(updatedLog);
            setLog(updatedLog);
            setEngineeringText((report.engineering || []).join('\n'));
            setSupervisorText((report.supervisor || []).join('\n'));
            setSafetyText((report.safety || []).join('\n'));
        } else {
            // Failed (returned null)
            alert("AI 生成报告失败，请点击右上角重试");
        }
    } catch (e) {
        console.error(e);
        alert("生成出错，请检查网络");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    if (!log) return;
    if (window.confirm('重新生成将覆盖当前的编辑内容，确定吗？')) {
        generateReport(log);
    }
  };

  const handleSave = async () => {
    if (!log) return;
    setIsSaving(true);
    
    const newReport = {
        engineering: engineeringText.split('\n').filter(line => line.trim()),
        supervisor: supervisorText.split('\n').filter(line => line.trim()),
        safety: safetyText.split('\n').filter(line => line.trim()),
        summary: log.report?.summary || ''
    };

    const updatedLog = {
        ...log,
        date: reportDate || log.date,
        report: newReport,
        lastModified: Date.now()
    };
    
    await saveLog(updatedLog);
    setLog(updatedLog);
    
    setTimeout(() => setIsSaving(false), 500);
  };

  // --- HTML Generation Helper ---
  const getPrintHtml = () => {
    if (!log) return '';

    // Prepare Data
    const displayDate = reportDate || log.date;
    const dateObj = new Date(displayDate);
    const dateData = {
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
        day: dateObj.getDate(),
        weekday: dateObj.toLocaleDateString('zh-CN', { weekday: 'long' })
    };

    // Parse Weather
    const wStr = log.weather || '';
    const cond = wStr.match(/天气：(\S+)/)?.[1] || '';
    const temp = wStr.match(/气温：(\S+)/)?.[1] || '';
    const windDir = wStr.match(/风向：(\S+)/)?.[1] || '';
    const windPower = wStr.match(/风力：(\S+)/)?.[1] || '';
    
    const weatherData = {
        cond: cond || (wStr.length > 5 ? wStr : '——'),
        temp: temp || '——',
        windDir: windDir || '——',
        windPower: windPower || '——'
    };

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <title>监理日志 - ${escapeHtml(displayDate)}</title>
        <style>
          /* Global & Print Styles */
          @page { size: A4 portrait; margin: 20mm; }
          
          body { 
            font-family: "SimSun", "Songti SC", serif; 
            color: #000; 
            line-height: 1.5; 
            background: white;
            -webkit-print-color-adjust: exact;
          }

          /* Screen Preview Simulation Styles */
          @media screen {
            body {
                width: 210mm; /* Force A4 width on screen to match print */
                min-height: 297mm;
                padding: 20mm; /* Simulate print margins */
                margin: 0; 
                box-sizing: border-box;
            }
          }
          
          /* Print Reset */
          @media print {
            body { 
                width: auto; 
                padding: 0; 
                margin: 0; 
            }
          }

          .header-code { text-align: right; font-size: 12px; margin-bottom: 5px; font-family: sans-serif; }
          h1 { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 25px; letter-spacing: 2px; }
          
          /* Table Styles */
          .log-table { width: 100%; border-collapse: collapse; border: 2px solid black; table-layout: fixed; }
          .log-table td { border: 1px solid black; padding: 8px; vertical-align: top; word-break: break-all; }
          
          .label-cell { 
            width: 80px; 
            text-align: center; 
            font-weight: bold; 
            background-color: #f9f9f9; 
            vertical-align: middle; 
            font-size: 16px;
          }
          
          .content-cell { padding: 10px 15px; font-size: 15px; }
          
          .info-row { display: flex; align-items: center; gap: 60px; }
          .info-group { display: flex; gap: 20px; }
          
          .section-block {
            padding: 10px 5px;
            border-bottom: 1px solid black;
          }
          .section-block:last-child {
            border-bottom: none;
          }
          
          .section-title { 
            font-weight: bold; 
            text-decoration: underline; 
            margin-bottom: 10px; 
            font-size: 16px; 
          }
          
          .section-text { 
            min-height: 200px; 
            white-space: pre-wrap; 
            font-size: 15px; 
            text-align: justify; 
            line-height: 1.8; 
          }
          
          .footer { 
            margin-top: 40px; 
            display: flex; 
            justify-content: space-between; 
            font-size: 16px; 
            padding: 0 10px; 
          }
        </style>
      </head>
      <body>
        <div class="header-code">Q/SY 06522-2020</div>
        <h1>表 D.6 监理日志</h1>
        
        <table class="log-table">
          <!-- Date Row -->
          <tr>
            <td class="label-cell">日期</td>
            <td class="content-cell">
              <div class="info-row">
                <div class="info-group">
                  <span>${escapeHtml(dateData.year)} 年</span>
                  <span>${escapeHtml(dateData.month)} 月</span>
                  <span>${escapeHtml(dateData.day)} 日</span>
                </div>
                <span>${escapeHtml(dateData.weekday)}</span>
              </div>
            </td>
          </tr>
          
          <!-- Weather Row -->
          <tr>
            <td class="label-cell">气象</td>
            <td class="content-cell">
              <div class="info-row">
                <div class="info-group">
                  <span>天气：${escapeHtml(weatherData.cond)}</span>
                  <span>气温：${escapeHtml(weatherData.temp)}</span>
                </div>
                <div class="info-group">
                  <span>风向：${escapeHtml(weatherData.windDir)}</span>
                  <span>风力：${escapeHtml(weatherData.windPower)}</span>
                </div>
              </div>
            </td>
          </tr>
          
          <!-- Main Content Area (Merged Cells) -->
          <tr>
            <td colspan="2" style="padding: 0;">
              
              <!-- Engineering -->
              <div class="section-block">
                 <div style="padding: 0 15px;">
                   <div class="section-title">工程动态：</div>
                   <div class="section-text">${escapeHtml(engineeringText || '（本日无特殊工程动态）')}</div>
                 </div>
              </div>

              <!-- Supervisor -->
              <div class="section-block">
                 <div style="padding: 0 15px;">
                   <div class="section-title">监理工作情况：</div>
                   <div class="section-text">${escapeHtml(supervisorText || '（本日无特殊监理工作）')}</div>
                 </div>
              </div>

              <!-- Safety -->
              <div class="section-block" style="border-bottom: none;">
                 <div style="padding: 0 15px;">
                   <div class="section-title">安全监理工作情况：</div>
                   <div class="section-text" style="min-height: 150px;">${escapeHtml(safetyText || '（本日无安全异常情况）')}</div>
                 </div>
              </div>

            </td>
          </tr>
        </table>

        <div class="footer">
          <div>总监理工程师/总监代表：</div>
          <div style="margin-right: 60px;">记录人：</div>
        </div>
      </body>
      </html>
    `;
  };

  const handleOpenPreview = () => {
    setShowPreview(true);
  };

  // --- Export Actions ---

  const getExportAuthHeaders = async (): Promise<Record<string, string>> => {
    if (isDevMode()) {
      return { Authorization: 'Bearer dev-token' };
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleDownload = async () => {
    if (!log) return;
    const authHeaders = await getExportAuthHeaders();
    const response = await fetch('/api/export/report-docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        date: reportDate || log.date,
        weather: log.weather,
        engineering: engineeringText,
        supervisor: supervisorText,
        safety: safetyText
      })
    });

    if (!response.ok) {
      alert('导出 Word 文件失败，请稍后重试。');
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `监理日志_${reportDate || log.date}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
      // Robust Printing: Open in new window
      // This avoids iframe restrictions and works better on mobile
      const content = getPrintHtml();
      
      // Inject auto-print script
      const printScript = `
        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                }, 500);
            }
        </script>
      `;
      // Insert script before closing body
      const finalHtml = content.replace('</body>', `${printScript}</body>`);
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(finalHtml);
          printWindow.document.close();
      } else {
          alert("无法打开打印窗口，请检查是否被浏览器拦截，或尝试【下载文件】");
      }
  };

  const HeaderRightAction = (
     <div className="flex gap-1 items-center">
         {/* Re-generate Button */}
         <button 
            onClick={handleRegenerate}
            disabled={isGenerating || isSaving}
            className="text-sm font-medium px-2 py-1.5 rounded text-gray-500 hover:bg-gray-100 active:bg-gray-200"
            title="重新生成"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        </button>

         {/* Modify / Edit Button (Returns to Recorder) */}
         <button 
            onClick={() => navigate(`/project/${projectId}/record/${id}`)}
            className="text-sm font-medium px-3 py-1.5 rounded-[4px] text-gray-600 bg-gray-100 active:bg-gray-200 border border-transparent mr-1"
            disabled={isSaving || isGenerating}
        >
            返回修改
        </button>

         {/* Save Button */}
         <button 
            onClick={handleSave}
            className={`text-sm font-semibold px-3 py-1.5 rounded-[4px] transition-colors ${isSaving ? 'text-gray-400' : 'text-blue-600 active:bg-blue-50'}`}
            disabled={isSaving || isGenerating}
        >
            {isSaving ? '保存中' : '保存'}
        </button>
    </div>
  );

  if (!log) return null;

  return (
    <>
    <div className="h-full flex flex-col">
        <Layout 
            title="日志预览" 
            showBack 
            onBack={() => navigate(`/project/${projectId}/logs`)} 
            headerRight={HeaderRightAction}
        >
            {/* Loading Overlay */}
            {isGenerating && (
                <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
                    <p className="text-gray-600 font-medium">AI 正在润色日志...</p>
                    <p className="text-gray-400 text-sm mt-1">这可能需要几十秒，请稍候</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto bg-gray-50 pb-24 no-scrollbar">
                
                {/* Info Header */}
                <div className="bg-white p-4 mb-4 border-b border-gray-200 shadow-sm">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">监理日志</h2>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mt-1">
                            <label className="flex items-center gap-2">
                                <span>📅</span>
                                <input
                                    type="date"
                                    value={reportDate}
                                    onChange={(e) => setReportDate(e.target.value)}
                                    className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700 outline-none focus:border-blue-400 focus:bg-white"
                                    disabled={isSaving || isGenerating}
                                />
                            </label>
                            <span>☁️ {log.weather.split(' ')[0]}</span>
                        </div>
                         <div className="text-xs text-gray-400 mt-1 truncate">
                            {log.weather}
                         </div>
                    </div>
                </div>

                {/* Editable Sections */}
                <div className="space-y-4 px-4">
                    <SectionEditor 
                        title="一、工程动态及进度情况" 
                        value={engineeringText} 
                        onChange={setEngineeringText}
                        colorClass="border-blue-500"
                        placeholder="等待生成或手动输入..."
                        hint="AI已将口语润色为专业术语"
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                            </svg>
                        }
                    />

                    <SectionEditor 
                        title="二、监理工作情况" 
                        value={supervisorText} 
                        onChange={setSupervisorText}
                        colorClass="border-orange-500"
                        placeholder="等待生成或手动输入..."
                        hint="包含关键工序验收、指令签发等"
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                            </svg>
                        }
                    />

                    <SectionEditor 
                        title="三、安全监理工作" 
                        value={safetyText} 
                        onChange={setSafetyText}
                        colorClass="border-red-500"
                        placeholder="等待生成或手动输入..."
                        hint="请记录隐患部位及闭合情况"
                        icon={
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                        }
                    />
                </div>

                {/* Floating Bottom Button for Preview */}
                <div className="fixed bottom-6 left-6 right-6 z-20">
                    <button 
                        onClick={handleOpenPreview}
                        className={`w-full h-12 rounded-full font-bold shadow-lg flex items-center justify-center gap-2 transition-all 
                        bg-[#07C160] hover:bg-[#06ad56] active:scale-95 text-white`}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        导出日志 (PDF)
                    </button>
                </div>
            </div>
        </Layout>
    </div>

    {/* --- Preview Modal --- */}
    {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
             {/* Header */}
             <div className="bg-white p-4 flex justify-between items-center shadow-md z-10 shrink-0">
                 <h3 className="font-bold text-lg text-gray-800">打印预览</h3>
                 <button 
                    onClick={() => setShowPreview(false)} 
                    className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                 </button>
             </div>
             
             {/* Preview Container - Scrollable Area with SCALING */}
             <div className="flex-1 overflow-auto p-4 bg-gray-600 flex flex-col items-center">
                 {/* Container controls the scrollable area size */}
                 <div style={{
                     width: `${794 * scale}px`,
                     height: `${1123 * scale}px`, // Fixed A4 height per page visual
                     flexShrink: 0,
                     marginTop: '1rem',
                     marginBottom: '1rem'
                 }}>
                     {/* Transform Wrapper */}
                     <div style={{
                         transform: `scale(${scale})`,
                         transformOrigin: 'top left',
                         width: '794px',
                         height: '1123px'
                     }}>
                         <iframe 
                            ref={previewIframeRef}
                            title="Print Preview"
                            srcDoc={getPrintHtml()}
                            className="bg-white shadow-2xl"
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                // Iframe handles internal scrolling if content > 1 page
                            }}
                         />
                     </div>
                 </div>
                 
                 <p className="text-white/80 text-sm mb-6 font-medium drop-shadow-md">
                     {scale < 0.95 ? '已自动缩放以适应屏幕宽度' : 'A4 标准打印预览'}
                 </p>
             </div>
             
             {/* Footer Actions */}
             <div className="bg-white p-4 border-t border-gray-200 flex justify-end gap-3 safe-area-bottom shrink-0">
                 <button 
                    onClick={handleDownload}
                    className="flex-1 px-4 py-2 rounded-lg text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    下载源文件
                 </button>
                 <button 
                    onClick={handlePrint} 
                    className="flex-1 px-4 py-2 rounded-lg bg-[#07C160] text-white font-bold hover:bg-[#06ad56] active:scale-95 transition-all flex items-center justify-center gap-2"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008h-.008V10.5Zm-3 0h.008v.008h-.008V10.5Z" />
                    </svg>
                    立即打印
                 </button>
             </div>
        </div>
    )}
    </>
  );
};

// Internal Sub-component for Editor Section
interface SectionEditorProps {
    title: string;
    value: string;
    onChange: (val: string) => void;
    colorClass: string;
    placeholder: string;
    icon: React.ReactNode;
    hint?: string;
}

const SectionEditor: React.FC<SectionEditorProps> = ({ title, value, onChange, colorClass, placeholder, icon, hint }) => {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className={`px-4 py-3 bg-gray-50 border-l-4 ${colorClass} border-b border-gray-100`}>
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="font-bold text-gray-800">{title}</span>
                </div>
                {hint && <div className="text-xs text-gray-400 mt-1 ml-7">{hint}</div>}
            </div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full p-4 text-[15px] leading-relaxed text-gray-700 outline-none resize-none min-h-[120px]"
            />
        </div>
    );
}

export default Report;
