
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Project, User } from '../types';
import { getProjects, saveProject, updateProject, logoutUser, deleteProjects, getLogs, getConcreteRecords } from '../services/storageService';
import { useAuth } from '../services/authContext';

// --- Internal Component: Long Pressable Item (Projects) ---
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
                relative z-10 bg-white p-5 rounded-2xl shadow-sm border flex items-center justify-between transition-all duration-300
                ${isSelectionMode ? 'translate-x-8 w-[calc(100%-32px)]' : 'translate-x-0 w-full active:scale-[0.98] group hover:shadow-md hover:border-blue-200'}
                ${isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100'}
            `}>
               {children}
            </div>
        </div>
    );
};

// --- Internal Component: Stat Card ---
const StatCard = ({ label, value, icon, colorClass }: { label: string, value: number | string, icon: React.ReactNode, colorClass: string }) => (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1 min-h-[100px]">
        <div className={`p-2 rounded-full mb-1 ${colorClass} bg-opacity-10`}>
            {icon}
        </div>
        <span className="text-2xl font-bold text-gray-800 font-mono">{value}</span>
        <span className="text-xs text-gray-400">{label}</span>
    </div>
);

// --- Internal Component: Profile Menu Item ---
const MenuItem = ({ icon, label, onClick, isDestructive = false }: { icon: React.ReactNode, label: string, onClick?: () => void, isDestructive?: boolean }) => (
    <button 
        onClick={onClick}
        className="w-full bg-white px-5 py-4 border-b border-gray-50 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
        <div className="flex items-center gap-3">
            <div className={`${isDestructive ? 'text-red-500' : 'text-gray-400'}`}>
                {icon}
            </div>
            <span className={`text-base font-medium ${isDestructive ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
        </div>
        {!isDestructive && (
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
        )}
    </button>
);

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, isAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'projects' | 'profile'>('projects');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Statistics
  const [totalLogsCount, setTotalLogsCount] = useState<number | null>(null);
  const [totalConcreteCount, setTotalConcreteCount] = useState<number | null>(null);
  const [workDaysCount, setWorkDaysCount] = useState<number | null>(null);
  
  // Selection Mode State (Only for Projects Tab)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Add/Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectNumber, setNewProjectNumber] = useState(''); // New State
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Initialize
  useEffect(() => {
    if (!authUser) {
        navigate('/login');
        return;
    }
    setUser(authUser);
    loadData();
  }, [authUser, navigate]);

  const loadData = async () => {
      setIsLoading(true);
      const projData = await getProjects();
      setProjects(projData);
      
      // Load stats (fetch all logs to count)
      const allLogs = await getLogs();
      setTotalLogsCount(allLogs.length);

      // Fetch all concrete records for stats
      const allConcrete = await getConcreteRecords();
      setTotalConcreteCount(allConcrete.length);
      
      // Calculate Work Days (unique dates with logs)
      const uniqueDates = new Set(allLogs.map(l => l.date));
      setWorkDaysCount(uniqueDates.size);
      
      setIsLoading(false);
  };

  const handleOpenAddModal = () => {
      setEditingProject(null);
      setNewProjectName('');
      setNewProjectNumber('');
      setNewProjectLocation('');
      setShowAddModal(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation(); // Prevent entering the project
      setEditingProject(project);
      setNewProjectName(project.name);
      setNewProjectNumber(project.projectNumber || '');
      setNewProjectLocation(project.location);
      setShowAddModal(true);
  };

  const handleSaveProject = async () => {
    if (!newProjectName.trim()) {
        alert('请输入项目名称');
        return;
    }
    setIsCreating(true);
    
    try {
        if (editingProject) {
            // Update Existing
            await updateProject({
                ...editingProject,
                name: newProjectName,
                projectNumber: newProjectNumber,
                location: newProjectLocation
            });
        } else {
            // Create New
            const newProject: Project = {
                id: '', // Server will assign UUID but interface needs this param
                name: newProjectName,
                projectNumber: newProjectNumber,
                location: newProjectLocation,
                createdAt: Date.now()
            };
            await saveProject(newProject);
        }
        
        await loadData();
        setShowAddModal(false);
        setNewProjectName('');
        setNewProjectNumber('');
        setNewProjectLocation('');
        setEditingProject(null);
    } catch (e) {
        alert(editingProject ? '修改失败，请重试' : '创建失败，请重试');
    } finally {
        setIsCreating(false);
    }
  };

  const handleLogout = async () => {
      if (isLoggingOut) return;
      
      if (window.confirm('确定要退出登录吗？')) {
        setIsLoggingOut(true);
        try {
            await logoutUser();
            await refreshUser();
        } catch (error) {
            console.error("Logout error:", error);
            // Only clear auth keys; project/log drafts may be local-only in developer mode.
            Object.keys(localStorage)
                .filter(key => key === 'is_dev_mode' || key === 'dev_user' || key.startsWith('sb-'))
                .forEach(key => localStorage.removeItem(key));
        } finally {
            navigate('/login');
            setIsLoggingOut(false);
        }
      }
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
          navigate(`/project/${id}/logs`);
      }
  }, [isSelectionMode, navigate]);

  const handleDeleteClick = () => {
      if (selectedIds.size === 0) return;
      setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
      const idsToDelete = Array.from(selectedIds) as string[];
      await deleteProjects(idsToDelete);
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

  // --- Renderers ---

  // Header Logic
  let headerTitle = '';
  let headerRight: React.ReactNode = null;

  if (activeTab === 'projects') {
      headerTitle = isSelectionMode ? `已选择 ${selectedIds.size} 项` : '项目列表';
      headerRight = isSelectionMode ? (
          <button onClick={exitSelectionMode} className="text-gray-600 font-medium px-2 py-1">取消</button>
      ) : (
           <button 
              onClick={() => setIsSelectionMode(true)} 
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
              title="批量管理"
          >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 17.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
          </button>
      );
  } else {
      headerTitle = '个人中心';
  }

  // --- Profile Tab Content ---
  const renderProfileTab = () => (
      <div className="flex-1 overflow-y-auto bg-gray-50 pb-24">
          
          {/* 1. User Info Header */}
          <div className="bg-white p-6 border-b border-gray-100 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold shadow-sm">
                  {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 truncate pr-4">{user?.username || '用户'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                          标准会员
                      </span>
                  </div>
              </div>
          </div>

          {/* 2. Stats Dashboard */}
          <div className="px-4 py-4">
              <h3 className="text-sm font-bold text-gray-500 mb-3 px-1">数据统计</h3>
              <div className="grid grid-cols-2 gap-3">
                  <StatCard 
                      label="管理项目" 
                      value={projects.length} 
                      colorClass="bg-blue-500 text-blue-600"
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                          </svg>
                      }
                  />
                  <StatCard 
                      label="累计日志" 
                      value={totalLogsCount || 0} 
                      colorClass="bg-purple-500 text-purple-600"
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                      }
                  />
                  <StatCard 
                      label="工作天数" 
                      value={workDaysCount || 0} 
                      colorClass="bg-green-500 text-green-600"
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                          </svg>
                      }
                  />
                  <StatCard 
                      label="旁站记录" 
                      value={totalConcreteCount || 0} 
                      colorClass="bg-orange-500 text-orange-600"
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                          </svg>
                      }
                  />
              </div>
          </div>

          {isAdmin && (
              <div className="px-4 pb-2">
                  <button
                      onClick={() => navigate('/admin/users')}
                      className="w-full bg-slate-900 text-white rounded-xl px-5 py-4 shadow-sm flex items-center justify-between active:scale-[0.99] transition-transform"
                  >
                      <div className="text-left">
                          <p className="text-base font-bold">账号管理</p>
                          <p className="text-xs text-slate-300 mt-0.5">创建账号、停用用户、重置密码</p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                  </button>
              </div>
          )}

          {/* 3. Menu List */}
          <div className="px-4 py-2">
              <h3 className="text-sm font-bold text-gray-500 mb-3 px-1">常用功能</h3>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <MenuItem 
                      label="账号设置" 
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                          </svg>
                      }
                  />
                  <MenuItem 
                      label="帮助与支持" 
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                          </svg>
                      }
                  />
                  <MenuItem 
                      label="关于应用" 
                      icon={
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                          </svg>
                      }
                  />
              </div>
          </div>

          {/* 4. Logout Button */}
          <div className="px-4 mt-6">
              <button 
                  onClick={handleLogout}
                  className="w-full bg-white border border-red-100 text-red-600 font-bold py-4 rounded-xl shadow-sm active:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                  退出登录
              </button>
              <div className="text-center mt-6 text-xs text-gray-400">
                  Version 1.1.0 (Build 202403)
              </div>
          </div>

      </div>
  );

  // --- Projects Tab Content ---
  const renderProjectsTab = () => (
      <div className="p-4 flex-1 overflow-y-auto no-scrollbar pb-24">
        {!isSelectionMode && (
            <div className="flex justify-between items-end mb-4 px-1">
                <h2 className="text-xl font-bold text-gray-800">所有项目</h2>
                <span className="text-xs text-gray-400 font-medium">{projects.length} 个进行中</span>
            </div>
        )}

        {isLoading ? (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        ) : projects.length === 0 ? (
             <div className="mt-20 flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">暂无项目</h3>
                <p className="mt-1 text-sm text-gray-500">点击下方按钮添加您的第一个监理项目</p>
             </div>
        ) : (
            <div className="">
                {projects.map(proj => {
                    const isSelected = selectedIds.has(proj.id);
                    return (
                        <LongPressableItem
                            key={proj.id}
                            id={proj.id}
                            isSelectionMode={isSelectionMode}
                            isSelected={isSelected}
                            onLongPress={handleLongPress}
                            onClick={handleItemClick}
                        >
                            <div className="flex-1 relative">
                                {/* Header with Title and Edit Button */}
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex-1 mr-8">
                                        <h3 className={`text-lg font-bold transition-colors ${!isSelectionMode ? 'group-hover:text-blue-700' : ''} text-gray-800 break-all`}>{proj.name}</h3>
                                        {proj.projectNumber && (
                                            <p className="text-xs text-blue-600 mt-1 font-medium bg-blue-50 inline-block px-1.5 py-0.5 rounded">
                                                编号: {proj.projectNumber}
                                            </p>
                                        )}
                                    </div>
                                    
                                    {/* Edit Button - Only show when NOT in selection mode */}
                                    {!isSelectionMode && (
                                        <button 
                                            onClick={(e) => handleOpenEditModal(e, proj)}
                                            className="absolute top-0 right-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors active:bg-blue-100"
                                            title="编辑项目"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center text-sm text-gray-500 mt-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1 text-gray-400 shrink-0">
                                        <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.625a19.015 19.015 0 002.274 1.765c.311.193.571.337.757.433.092.047.168.082.227.114.029.016.05.027.064.035l.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                                    </svg>
                                    <span className="truncate">{proj.location || '未设置地点'}</span>
                                </div>
                                {!isSelectionMode && (
                                    <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400">
                                         <span>创建于 {new Date(proj.createdAt).toLocaleDateString()}</span>
                                         <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-gray-500">进入项目</span>
                                    </div>
                                )}
                            </div>
                            
                            {!isSelectionMode && (
                                <div className="ml-2 bg-gray-50 p-2 rounded-full text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                </div>
                            )}
                        </LongPressableItem>
                    );
                })}
            </div>
        )}
        
        {/* Floating Action Button OR Delete Action Bar */}
        {isSelectionMode ? (
             <div className="absolute bottom-20 left-6 right-6 z-50 animate-in slide-in-from-bottom-2 duration-200">
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
                    删除项目 ({selectedIds.size})
                 </button>
             </div>
        ) : (
            <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none z-30">
                <button
                onClick={handleOpenAddModal}
                className="bg-gray-900 text-white w-14 h-14 rounded-full shadow-xl shadow-gray-900/30 flex items-center justify-center pointer-events-auto hover:bg-black active:scale-95 transition-all transform hover:-translate-y-0.5"
                >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                </button>
            </div>
        )}
      </div>
  );

  return (
    <>
    <Layout title={headerTitle} headerRight={headerRight} showBack={false}>
      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
          {activeTab === 'projects' ? renderProjectsTab() : renderProfileTab()}
      </div>

      {/* Bottom Navigation Bar */}
      {!isSelectionMode && (
          <div className="shrink-0 bg-white border-t border-gray-200 flex justify-around items-center h-[calc(56px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] z-40">
              <button 
                onClick={() => setActiveTab('projects')}
                className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'projects' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                  {activeTab === 'projects' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M4.5 2.25a.75.75 0 0 1 .75.75v2.25h13.5V3a.75.75 0 0 1 1.5 0v18a.75.75 0 0 1-1.5 0v-5.25H5.25V21a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                        <path d="M7.5 9.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM12.75 9.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM18 9.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM7.5 14.25a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM12.75 14.25a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM18 14.25a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5Z" />
                      </svg>
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6a9 9 0 0 1 18 0t-18 0ZM3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                  )}
                  <span className="text-[10px] font-medium">项目</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('profile')}
                className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                   {activeTab === 'profile' ? (
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                         <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                       </svg>
                   ) : (
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                         <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                       </svg>
                   )}
                   <span className="text-[10px] font-medium">我的</span>
              </button>
          </div>
      )}

      {/* Add/Edit Project Modal */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <h3 className="font-bold text-lg text-gray-800">{editingProject ? '编辑项目' : '新建项目'}</h3>
                      <button onClick={() => setShowAddModal(false)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
                          <input 
                            type="text" 
                            autoFocus
                            value={newProjectName}
                            onChange={e => setNewProjectName(e.target.value)}
                            placeholder="例如：万科金域蓝湾二期"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">项目编号</label>
                          <input 
                            type="text" 
                            value={newProjectNumber}
                            onChange={e => setNewProjectNumber(e.target.value)}
                            placeholder="例如：SG-2024-001"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">项目地点</label>
                          <input 
                            type="text" 
                            value={newProjectLocation}
                            onChange={e => setNewProjectLocation(e.target.value)}
                            placeholder="例如：杭州市萧山区"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                      </div>
                      <div className="pt-2">
                          <button 
                            onClick={handleSaveProject}
                            disabled={isCreating}
                            className={`w-full py-3 bg-blue-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20
                                ${isCreating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-[0.98]'}
                            `}
                          >
                              {isCreating ? '保存中...' : (editingProject ? '保存修改' : '立即创建')}
                          </button>
                      </div>
                  </div>
              </div>
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
                    <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除项目?</h3>
                    <p className="text-gray-500">
                        即将删除 <span className="font-bold text-gray-800">{selectedIds.size}</span> 个项目。
                        <br/>这将同时<span className="text-red-500 font-bold">清空所有相关日志</span>，且无法恢复。
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
    </Layout>
    </>
  );
};

export default ProjectList;
