
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { ConcreteRecord } from '../types';
import { getConcreteRecords, deleteConcreteRecords } from '../services/storageService';

// --- Internal Component: Long Pressable Item (Reused logic) ---
interface LongPressableItemProps {
    children: React.ReactNode;
    id: string;
    isSelectionMode: boolean;
    isSelected: boolean;
    onLongPress: (id: string) => void;
    onClick: (id: string) => void;
}

const LongPressableItem: React.FC<LongPressableItemProps> = ({ 
    children, 
    id, 
    isSelectionMode, 
    isSelected, 
    onLongPress, 
    onClick
}) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressTriggered = useRef(false);
    const startY = useRef(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isSelectionMode) return;
        isLongPressTriggered.current = false;
        startY.current = e.touches[0].clientY;

        timerRef.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            if (navigator.vibrate) navigator.vibrate(50);
            onLongPress(id);
        }, 500);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isSelectionMode) return;
        const moveY = e.touches[0].clientY;
        if (Math.abs(moveY - startY.current) > 10) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const handleTouchEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLongPressTriggered.current) {
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
             {/* Checkbox Indicator */}
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
                relative z-10 bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center transition-all duration-300
                ${isSelectionMode ? 'translate-x-8 w-[calc(100%-32px)]' : 'translate-x-0 w-full active:scale-[0.98] active:bg-gray-50'}
                ${isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100'}
            `}>
               {children}
            </div>
        </div>
    );
};

const ConcreteList: React.FC = () => {
    const navigate = useNavigate();
    const { projectId } = useParams<{ projectId: string }>();
    const [records, setRecords] = useState<ConcreteRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Filter State
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed'>('all');
    const [selectedDate, setSelectedDate] = useState('');
    const dateInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadData();
    }, [projectId]);

    // Reset selection when changing filters
    useEffect(() => {
        if (isSelectionMode) {
            exitSelectionMode();
        }
    }, [statusFilter, selectedDate]);

    const loadData = async () => {
        if (!projectId) return;
        setIsLoading(true);
        const data = await getConcreteRecords(projectId);
        setRecords(data);
        setIsLoading(false);
    };

    const handleCreate = () => {
        navigate(`/project/${projectId}/side/concrete/new`);
    };

    // --- Selection Handlers ---
    const handleLongPress = useCallback((id: string) => {
        setIsSelectionMode(true);
        setSelectedIds(new Set([id]));
    }, []);

    const handleItemClick = useCallback((id: string) => {
        if (isSelectionMode) {
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
            navigate(`/project/${projectId}/side/concrete/${id}`);
        }
    }, [isSelectionMode, navigate, projectId]);

    const handleDeleteClick = () => {
        if (selectedIds.size === 0) return;
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        const idsToDelete = Array.from(selectedIds) as string[];
        await deleteConcreteRecords(idsToDelete);
        await loadData();
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

    const triggerPicker = () => {
        try { dateInputRef.current?.showPicker(); } catch (err) {}
    };

    // --- Filter Logic ---
    const filteredRecords = useMemo(() => {
        return records.filter(record => {
            const isDateMatch = !selectedDate || record.date === selectedDate;
            const isStatusMatch = statusFilter === 'all' || record.status === statusFilter;
            return isDateMatch && isStatusMatch;
        });
    }, [records, selectedDate, statusFilter]);

    const draftCount = records.filter(r => r.status === 'draft').length;
    const completedCount = records.filter(r => r.status === 'completed').length;

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

    // Format Helper
    const formatDisplayTime = (isoString?: string) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            const y = date.getFullYear();
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const d = date.getDate().toString().padStart(2, '0');
            const hh = date.getHours().toString().padStart(2, '0');
            const mm = date.getMinutes().toString().padStart(2, '0');
            return `${y}-${m}-${d} ${hh}:${mm}`;
        } catch (e) {
            return isoString;
        }
    };

    // Header Right (Only show 'Cancel' when in selection mode, otherwise buttons are in the filter bar)
    const headerRight = isSelectionMode ? (
        <button onClick={exitSelectionMode} className="text-gray-600 font-medium px-2 py-1">取消</button>
    ) : null;

    const title = isSelectionMode ? `已选择 ${selectedIds.size} 项` : '混凝土浇筑旁站';

    return (
        <>
        <Layout 
            title={title} 
            showBack={!isSelectionMode} 
            onBack={() => navigate(`/project/${projectId}/logs`)}
            headerRight={headerRight}
        >
            <div className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
                
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

                <div className="flex-1 overflow-y-auto p-4 pb-24">
                    {isLoading ? (
                        <div className="flex items-center justify-center pt-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="text-center text-gray-400 mt-20 flex flex-col items-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                                <span className="text-4xl">🏗️</span>
                            </div>
                            <p className="text-lg font-medium text-gray-500">暂无旁站记录</p>
                            <p className="text-sm mt-1">点击下方按钮新建记录</p>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="text-center text-gray-400 mt-10">
                            <p className="text-3xl mb-2">🔍</p>
                            <p className="text-sm">未找到符合条件的记录</p>
                            <div className="flex gap-2 justify-center mt-3">
                                <button onClick={() => { setStatusFilter('all'); setSelectedDate(''); }} className="text-blue-600 text-sm font-medium hover:underline bg-blue-50 px-3 py-1.5 rounded-full">清除筛选条件</button>
                            </div>
                        </div>
                    ) : (
                        <div className="">
                            {filteredRecords.map(record => {
                                const isSelected = selectedIds.has(record.id);
                                // Determine display date: prefer 'info_start_time', fallback to 'date'
                                const displayDate = formatDisplayTime(record.data['info_start_time']) || record.date;
                                const location = record.data['info_part'] || '未填写部位';

                                return (
                                    <LongPressableItem
                                        key={record.id}
                                        id={record.id}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={isSelected}
                                        onLongPress={handleLongPress}
                                        onClick={handleItemClick}
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="font-bold text-gray-800 text-base">{displayDate}</span>
                                                {record.status === 'completed' ? (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">已完成</span>
                                                ) : (
                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">草稿</span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-600 font-medium mb-1">
                                                {location}
                                            </div>
                                            <div className="text-xs text-gray-400 space-y-0.5">
                                                {record.data['q3_strength'] && <span>强度:{record.data['q3_strength']} </span>}
                                                {record.data['q3_slump'] && <span>坍落度:{record.data['q3_slump']}mm </span>}
                                            </div>
                                        </div>
                                        {!isSelectionMode && (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-300 ml-2 shrink-0">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                                            </svg>
                                        )}
                                    </LongPressableItem>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Floating Action Button OR Delete Action Bar */}
                {isSelectionMode ? (
                    <div className="absolute bottom-10 left-6 right-6 z-50 animate-in slide-in-from-bottom-2 duration-200">
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
                    <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none z-30">
                        <button
                            onClick={handleCreate}
                            className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-xl shadow-blue-600/30 flex items-center justify-center pointer-events-auto hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={cancelDelete}></div>
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-600">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除?</h3>
                                <p className="text-gray-500">
                                    即将删除 <span className="font-bold text-gray-800">{selectedIds.size}</span> 条记录。
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
            </div>
        </Layout>
        </>
    );
};

export default ConcreteList;
