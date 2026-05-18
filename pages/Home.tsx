
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { LogEntry, Project } from '../types';
import { getLogs, deleteLogs, getProjectById } from '../services/storageService';

// --- Internal Component: Long Pressable Item ---
interface LongPressableItemProps {
    children: React.ReactNode;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onLongPress: (id: string) => void;
    onClick: (id: string) => void;
    isDup?: boolean;
}

const LongPressableItem: React.FC<LongPressableItemProps> = ({ 
    children, 
    id, 
    isSelectionMode, 
    isSelected, 
    onLongPress, 
    onClick,
    isDup
}) => {
    // Fixed: Use ReturnType<typeof setTimeout> instead of NodeJS.Timeout for cross-environment compatibility
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressTriggered = useRef(false);
    const startY = useRef(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        // If already in selection mode, long press logic is disabled (just tap to select)
        if (isSelectionMode) return;

        isLongPressTriggered.current = false;
        startY.current = e.touches[0].clientY;

        timerRef.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(50);
            onLongPress(id);
        }, 500); // 500ms threshold
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isSelectionMode) return;
        
        // If scrolling happens, cancel long press
        const moveY = e.touches[0].clientY;
        if (Math.abs(moveY - startY.current) > 10) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLongPressTriggered.current) {
            // It was a long press, ignore the click
            isLongPressTriggered.current = false;
            return;
        }
        onClick(id);
    };

    return (
        <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleClick}
            className={`relative mb-3 transition-all duration-300 ease-out select-none
                ${isSelected ? 'transform scale-[0.98]' : ''}
            `}
        >
             {/* Checkbox Indicator (Visible in Selection Mode) */}
             <div className={`absolute left-0 top-1/2 -translate-y-1/2 z-0 transition-all duration-300 flex items-center justify-center w-8
                ${isSelectionMode ? 'opacity-100 -translate-x-1' : 'opacity-0 translate-x-[-20px] pointer-events-none'}
             `}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                    ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}
                `}>
                    {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                    )}
                </div>
             </div>

            {/* Main Content Card */}
            <div className={`
                relative z-10 bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between min-h-[72px] transition-all duration-300
                ${isSelectionMode ? 'translate-x-8 w-[calc(100%-32px)]' : 'translate-x-0 w-full'}
                ${isSelected ? 'border-blue-300 bg-blue-50/30' : (isDup ? 'border-red-200 bg-red-50/10' : 'border-gray-100')}
                active:bg-gray-50
            `}>
               {children}
            </div>
        </div>
    );
};

// --- Internal Component: Simple Navigation List Item ---
const NavListItem = ({ icon, title, onClick }: { icon: React.ReactNode, title: string, onClick: () => void }) => (
    <div 
        onClick={onClick}
        className="bg-white px-4 py-4 border-b border-gray-100 flex items-center active:bg-gray-50 transition-colors cursor-pointer"
    >
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mr-3 shrink-0">
            {icon}
        </div>
        <div className="flex-1 font-medium text-gray-800 text-[16px]">{title}</div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
    </div>
);


export default function Home() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  
  // Navigation State
  const [activeBottomTab, setActiveBottomTab] = useState<'logs' | 'side' | 'parallel' | 'nonconformity'>('logs');
  
  // Side Station Specific State
  const [sideStationView, setSideStationView] = useState<'root' | 'civil'>('root');

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // New state for custom modal
  
  // Filter State
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed'>('all');

  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
        if (!projectId) {
            navigate('/projects');
            return;
        }
        setIsLoading(true);
        const proj = await getProjectById(projectId);
        if (!proj) {
            // alert('项目不存在');
            // navigate('/projects');
            // return;
        }
        setProject(proj);
        
        const logsData = await getLogs(projectId);
        setLogs(logsData);
        setIsLoading(false);
    };
    fetchData();
  }, [projectId, navigate]);

  // Reset selection when leaving or changing filters or tabs
  useEffect(() => {
    if (isSelectionMode) {
        exitSelectionMode();
    }
    // Reset side station view when changing bottom tabs
    if (activeBottomTab !== 'side') {
        setSideStationView('root');
    }
  }, [selectedDate, statusFilter, activeBottomTab]);

  // Filter Logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const isDateMatch = !selectedDate || log.date === selectedDate;
      const isStatusMatch = statusFilter === 'all' || log.status === statusFilter;
      return isDateMatch && isStatusMatch;
    });
  }, [logs, selectedDate, statusFilter]);

  // --- Analysis Logic: Gap Detection & Duplicates ---
  const analysisResult = useMemo(() => {
    if (logs.length === 0) return { messages: [], duplicateSet: new Set<string>() };
    const msgs: string[] = [];
    const dateCounts: Record<string, number> = {};
    
    // Count occurrences
    logs.forEach(l => { dateCounts[l.date] = (dateCounts[l.date] || 0) + 1; });
    
    // Check duplicates
    const duplicateDates = Object.keys(dateCounts).filter(d => dateCounts[d] > 1);
    const duplicateSet = new Set(duplicateDates);
    if (duplicateDates.length > 0) {
        duplicateDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        msgs.push(`发现 ${duplicateDates.length} 个日期存在重复记录`);
    }

    // Check gaps (only if we have at least 2 logs)
    const uniqueDates = Object.keys(dateCounts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    if (uniqueDates.length >= 2) {
        for (let i = 0; i < uniqueDates.length - 1; i++) {
            const d1Str = uniqueDates[i];
            const d2Str = uniqueDates[i+1];
            
            // Parse as UTC to avoid timezone issues when calculating diff
            const d1 = new Date(d1Str);
            const d2 = new Date(d2Str);
            
            // Calculate difference in days
            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 1) {
                // Identify the missing range
                const start = new Date(d1);
                start.setDate(start.getDate() + 1);
                
                const end = new Date(d2);
                end.setDate(end.getDate() - 1);

                const startStr = start.toISOString().split('T')[0];
                const endStr = end.toISOString().split('T')[0];
                
                if (startStr === endStr) {
                    msgs.push(`缺失日期：${startStr}`);
                } else {
                    msgs.push(`缺失日期：${startStr} 至 ${endStr}`);
                }
            }
        }
    }
    return { messages: msgs, duplicateSet };
  }, [logs]);

  // --- Handlers ---

  const handleCreateNew = () => {
    navigate(`/project/${projectId}/record/new`);
  };

  const handleLongPress = useCallback((id: string) => {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
  }, []);

  const handleItemClick = useCallback((id: string) => {
      if (isSelectionMode) {
          // Toggle Selection
          setSelectedIds(prev => {
              const newSet = new Set(prev);
              if (newSet.has(id)) {
                  newSet.delete(id);
              } else {
                  newSet.add(id);
              }
              return newSet;
          });
      } else {
          // Navigation Logic
          const log = logs.find(l => l.id === id);
          if (log) {
            if (log.status === 'completed') {
                navigate(`/project/${projectId}/report/${id}`);
            } else {
                navigate(`/project/${projectId}/record/${id}`);
            }
          }
      }
  }, [isSelectionMode, navigate, projectId, logs]);

  const handleDeleteClick = () => {
      if (selectedIds.size === 0) return;
      setShowDeleteConfirm(true); // Open custom modal
  };

  const confirmDelete = async () => {
      // Execute Delete
      const idsToDelete = Array.from(selectedIds) as string[];
      await deleteLogs(idsToDelete);
      
      // Refresh UI
      setIsLoading(true);
      const updatedLogs = await getLogs(projectId);
      setLogs(updatedLogs);
      setIsLoading(false);
      
      // Cleanup
      setShowDeleteConfirm(false);
      exitSelectionMode();
  };

  const cancelDelete = () => {
      setShowDeleteConfirm(false);
  };

  const exitSelectionMode = () => {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
  };
  
  // Custom Back Handler
  const handleBackPress = () => {
      if (isSelectionMode) {
          exitSelectionMode();
          return;
      }
      
      // If inside a nested side station view, go up one level
      if (activeBottomTab === 'side' && sideStationView === 'civil') {
          setSideStationView('root');
          return;
      }
      
      navigate('/projects');
  };

  // --- Header Action ---
  const headerRightAction = isSelectionMode ? (
      <button onClick={exitSelectionMode} className="text-gray-600 font-medium px-2 py-1">取消</button>
  ) : null;

  // Count helpers for badges
  const draftCount = logs.filter(l => l.status === 'draft').length;
  const completedCount = logs.filter(l => l.status === 'completed').length;

  // Filter Tab Helper
  const FilterTab = ({ label, value, current, count }: any) => (
    <button 
      onClick={() => setStatusFilter(value)}
      disabled={isSelectionMode}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0
        ${current === value 
          ? 'bg-slate-800 text-white shadow-md' 
          : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
        } ${isSelectionMode ? 'opacity-50' : ''}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
          current === value ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {count}
        </span>
      )}
    </button>
  );

  const triggerPicker = () => {
    try { dateInputRef.current?.showPicker(); } catch (err) {}
  };

  // Determine Title based on Tab
  let pageTitle: React.ReactNode = project?.name || '日志列表';
  if (isSelectionMode) {
      pageTitle = `已选择 ${selectedIds.size} 项`;
  } else {
      if (activeBottomTab === 'side') {
          pageTitle = sideStationView === 'civil' ? '土建旁站' : '旁站记录';
      }
      if (activeBottomTab === 'parallel') pageTitle = '平行检验';
      if (activeBottomTab === 'nonconformity') pageTitle = '不符合项';
  }

  return (
    <>
    <Layout 
        title={pageTitle} 
        showBack={true} 
        onBack={handleBackPress}
        headerRight={activeBottomTab === 'logs' ? headerRightAction : null}
    >
      {/* Content Container based on Tab */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* ================= LOGS TAB ================= */}
          {activeBottomTab === 'logs' && (
             <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Filter Header */}
                <div className="bg-gray-50/80 backdrop-blur-md px-4 py-3 border-b border-gray-200 shrink-0 z-20 sticky top-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <FilterTab label="全部" value="all" current={statusFilter} />
                    <FilterTab label="草稿" value="draft" current={statusFilter} count={draftCount} />
                    <FilterTab label="已完成" value="completed" current={statusFilter} count={completedCount} />
                    <div className="w-px h-4 bg-gray-300 mx-1 shrink-0"></div>
                    <div className={`relative shrink-0 group ${isSelectionMode ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className={`flex items-center justify-center px-3 py-1.5 rounded-full text-sm font-medium border transition-all select-none group-active:scale-95 duration-75
                            ${selectedDate 
                                ? 'bg-blue-50 border-blue-200 text-blue-700 pr-7 group-active:bg-blue-100' 
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 group-active:bg-gray-100'
                            }
                        `}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5 pointer-events-none">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                            </svg>
                            <span className="pointer-events-none whitespace-nowrap">
                                {selectedDate ? selectedDate.slice(5) : '日期'}
                            </span>
                        </div>
                        <input ref={dateInputRef} type="date" className="absolute inset-0 opacity-0 w-full h-full z-10 cursor-pointer appearance-none" style={{ WebkitAppearance: 'none' }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} onClick={triggerPicker} />
                        {selectedDate && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedDate(''); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-0.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full active:scale-90 transition-transform"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                            </button>
                        )}
                    </div>

                    {!isSelectionMode && (
                        <button
                            onClick={() => setIsSelectionMode(true)}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 active:bg-gray-100 shrink-0"
                            title="批量管理"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 17.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Warning Banner */}
                {analysisResult.messages.length > 0 && !selectedDate && (
                    <div className="px-4 pt-3 pb-0 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 shadow-sm max-h-40 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-orange-50 z-10">
                                <div className="p-1 bg-orange-100 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-orange-600"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg></div>
                                <span className="text-sm font-bold text-orange-800">日志异常提醒 ({analysisResult.messages.length})</span>
                            </div>
                            <div className="space-y-1.5 pl-1 pb-1">
                                {analysisResult.messages.map((msg, idx) => (
                                    <div key={idx} className="text-xs text-orange-700/80 flex items-start gap-1.5 font-mono">
                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-orange-400 shrink-0"></span>
                                        <span>{msg}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* List Content */}
                <div className="flex-1 overflow-y-auto p-4 no-scrollbar pb-[140px]">
                    {isLoading ? (
                        <div className="flex items-center justify-center pt-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : logs.length === 0 ? (
                    <div className="text-center text-gray-400 mt-20 flex flex-col items-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><span className="text-4xl">📝</span></div>
                        <p className="text-lg font-medium text-gray-500">该项目暂无日志</p>
                        <p className="text-sm mt-1">点击下方 + 号新建第一篇监理日志</p>
                    </div>
                    ) : filteredLogs.length === 0 ? (
                    <div className="text-center text-gray-400 mt-10">
                        <p className="text-3xl mb-2">📅</p>
                        <p className="text-sm">该日期没有找到日志</p>
                        <div className="flex gap-2 justify-center mt-3">
                            {(selectedDate || statusFilter !== 'all') && (
                                <button onClick={() => { setStatusFilter('all'); setSelectedDate(''); }} className="text-blue-600 text-sm font-medium hover:underline bg-blue-50 px-3 py-1.5 rounded-full">清除筛选条件</button>
                            )}
                        </div>
                    </div>
                    ) : (
                        filteredLogs.map((log) => {
                        const isDup = analysisResult.duplicateSet.has(log.date);
                        const isSelected = selectedIds.has(log.id);
                        
                        return (
                            <LongPressableItem
                                key={log.id}
                                id={log.id}
                                isSelectionMode={isSelectionMode}
                                isSelected={isSelected}
                                isDup={isDup}
                                onLongPress={handleLongPress}
                                onClick={handleItemClick}
                            >
                                {/* Left: Date Info */}
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-gray-800 tracking-tight font-mono leading-none mb-1">{log.date}</h3>
                                        {isDup && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-medium border border-red-200 mb-1 pointer-events-none">重复</span>}
                                    </div>
                                    <p className="text-xs text-gray-400 font-medium">
                                        {new Date(log.date).toLocaleDateString('zh-CN', { weekday: 'long' })}
                                    </p>
                                </div>
                                
                                {/* Right: Status Badge */}
                                <div className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 pointer-events-none ${
                                    log.status === 'completed' 
                                        ? 'bg-green-50 text-green-700 border border-green-100' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                                    {log.status === 'completed' ? '已完成' : '草稿'}
                                </div>
                            </LongPressableItem>
                        );
                        })
                    )}
                </div>

                {/* FAB or Delete Bar (Inside Logs Tab) */}
                {isSelectionMode ? (
                     <div className="absolute bottom-[calc(56px+env(safe-area-inset-bottom)+24px)] left-6 right-6 z-30 animate-in slide-in-from-bottom-2 duration-200">
                         <button
                            type="button"
                            onClick={handleDeleteClick}
                            disabled={selectedIds.size === 0}
                            className={`w-full h-14 rounded-2xl shadow-xl flex items-center justify-center gap-2 font-bold text-lg transition-all
                                ${selectedIds.size > 0 ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95' : 'bg-gray-200 text-gray-400'}
                            `}
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            删除 ({selectedIds.size})
                         </button>
                     </div>
                ) : (
                    <div className="absolute bottom-[calc(56px+env(safe-area-inset-bottom)+24px)] left-0 right-0 flex justify-center pointer-events-none z-30">
                        <button
                        onClick={handleCreateNew}
                        className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-xl shadow-blue-600/30 flex items-center justify-center pointer-events-auto hover:bg-blue-700 active:scale-95 transition-all transform hover:-translate-y-0.5"
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        </button>
                    </div>
                )}
             </div>
          )}

          {/* ================= SIDE STATION TAB ================= */}
          {activeBottomTab === 'side' && (
              <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
                  {sideStationView === 'root' ? (
                      <div className="mt-2 border-t border-gray-100">
                          <NavListItem 
                            icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819" />
                                </svg>
                            }
                            title="土建旁站"
                            onClick={() => setSideStationView('civil')}
                          />
                      </div>
                  ) : (
                      <div className="mt-2 border-t border-gray-100 animate-in slide-in-from-right duration-200">
                           <NavListItem 
                            icon={
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.675.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
                                </svg>
                            }
                            title="混凝土浇筑旁站"
                            onClick={() => navigate(`/project/${projectId}/side/concrete`)}
                          />
                      </div>
                  )}
              </div>
          )}

          {/* ================= PARALLEL INSPECTION TAB ================= */}
          {activeBottomTab === 'parallel' && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 bg-gray-50">
                   <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" />
                      </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">平检功能开发中</h3>
                  <p className="text-sm mt-2">敬请期待...</p>
              </div>
          )}

          {/* ================= NON-CONFORMITY TAB (NEW) ================= */}
          {activeBottomTab === 'nonconformity' && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 bg-gray-50">
                   <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">不符合项功能开发中</h3>
                  <p className="text-sm mt-2">敬请期待...</p>
              </div>
          )}

      </div>

      {/* Bottom Navigation Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] z-40">
          <button 
            onClick={() => setActiveBottomTab('logs')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeBottomTab === 'logs' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
              {activeBottomTab === 'logs' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875ZM12.75 12a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V18a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V12Z" clipRule="evenodd" />
                  </svg>
              ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
              )}
              <span className="text-[10px] font-medium">日志</span>
          </button>
          
          <button 
            onClick={() => setActiveBottomTab('side')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeBottomTab === 'side' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
               {activeBottomTab === 'side' ? (
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                     <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                     <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                   </svg>
               ) : (
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                     <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                   </svg>
               )}
               <span className="text-[10px] font-medium">旁站</span>
          </button>

          <button 
            onClick={() => setActiveBottomTab('parallel')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeBottomTab === 'parallel' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
               {activeBottomTab === 'parallel' ? (
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                     <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0 1 18 9.375v9.375a3.375 3.375 0 0 1-3.375 3.375H9.375a3.375 3.375 0 0 1-3.375-3.375V9.375e.g.A3.375 3.375 0 0 1 9.375 6Zm1.687 10.875a.75.75 0 0 0 .563.875 6.402 6.402 0 0 0 2.256.002.75.75 0 1 0-.253-1.478 4.903 4.903 0 0 1-1.691-.002.75.75 0 0 0-.875.603Z" clipRule="evenodd" />
                     <path d="M18.599 4.318a.75.75 0 1 0-1.198-.936 4.498 4.498 0 0 1-1.439 1.43 4.5 4.5 0 0 1-1.353.486l-.21.056c-.84.225-1.115 1.343-.501 1.957l.112.112c.56.561 1.517.48 1.986-.17l.08-.111c.219-.304.516-.549.856-.708a3.003 3.003 0 0 1 1.667-.118Z" />
                     <path d="M5.401 4.318a.75.75 0 1 1 1.198-.936 4.498 4.498 0 0 0 1.439 1.43 4.5 4.5 0 0 0 1.353.486l.21.056c.84.225 1.115 1.343.501 1.957l-.112.112c-.56.561-1.517.48-1.986-.17l-.08-.111a2.992 2.992 0 0 0-.856-.708 3.003 3.003 0 0 0-1.667-.118Z" />
                   </svg>
               ) : (
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                   </svg>
               )}
               <span className="text-[10px] font-medium">平检</span>
          </button>

          <button 
            onClick={() => setActiveBottomTab('nonconformity')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeBottomTab === 'nonconformity' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
               {activeBottomTab === 'nonconformity' ? (
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                     <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                   </svg>
               ) : (
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                   </svg>
               )}
               <span className="text-[10px] font-medium">不符合项</span>
          </button>
      </div>

    </Layout> 
    {/* Correctly closing Layout before opening the Modal */}

    {/* Custom Delete Confirmation Modal - High Z-Index to overlap everything */}
    {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={cancelDelete}></div>
            
            {/* Modal Content */}
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-600">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                         </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除?</h3>
                    <p className="text-gray-500">
                        即将删除 <span className="font-bold text-gray-800">{selectedIds.size}</span> 条日志。
                        <br/>此操作<span className="text-red-500 font-bold">无法恢复</span>。
                    </p>
                </div>
                <div className="flex border-t border-gray-100">
                    <button 
                        onClick={cancelDelete}
                        className="flex-1 py-4 text-gray-600 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors border-r border-gray-100"
                    >
                        取消
                    </button>
                    <button 
                        onClick={confirmDelete}
                        className="flex-1 py-4 text-red-600 font-bold hover:bg-red-50 active:bg-red-100 transition-colors"
                    >
                        确认删除
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};
