
import { createClient } from '@supabase/supabase-js';
import { LogEntry, Project, User, ConcreteRecord } from '../types';

// ============================================================================
// CONFIG & DEV MODE SWITCH
// ============================================================================

// Safely access environment variables
const getEnv = () => {
    try {
        // @ts-ignore
        return (import.meta as any).env || {};
    } catch {
        return {};
    }
};

const env = getEnv();
const RAW_MEMFIRE_URL = env.VITE_MEMFIRE_URL || "";
const RAW_MEMFIRE_ANON_KEY = env.VITE_MEMFIRE_ANON_KEY || "";
const MEMFIRE_URL = RAW_MEMFIRE_URL || "https://placeholder-project.memfiredb.com"; 
const MEMFIRE_ANON_KEY = RAW_MEMFIRE_ANON_KEY || "placeholder-key";
const isLocalHost = () => {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};
export const isCloudConfigured = () => Boolean(
    RAW_MEMFIRE_URL &&
    RAW_MEMFIRE_ANON_KEY &&
    !RAW_MEMFIRE_URL.includes('placeholder') &&
    RAW_MEMFIRE_ANON_KEY !== 'placeholder-key'
);

// Initialize Supabase Client
export const supabase = createClient(MEMFIRE_URL, MEMFIRE_ANON_KEY);

// ----------------------------------------------------------------------------
// DEVELOPER MODE
// ----------------------------------------------------------------------------
// If true, we bypass Supabase and use localStorage for everything.
// Developer mode is available in Vite dev builds, or when explicitly enabled.
export const isDevModeAllowed = () => env.DEV === true || isLocalHost() || env.VITE_ENABLE_DEV_MODE === 'true';
export const isDevMode = () => isDevModeAllowed() && localStorage.getItem('is_dev_mode') === 'true';

const mockDelay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// USER AUTH
// ============================================================================

export const getUser = (): User | null => {
  // 1. Check Dev Mode User
  if (isDevMode()) {
      const devUser = localStorage.getItem('dev_user');
      if (devUser) {
          return JSON.parse(devUser);
      }
      return null;
  }

  // 2. Check Supabase User
  try {
      let hostname = 'memfiredb';
      try {
        hostname = new URL(MEMFIRE_URL).hostname.split('.')[0];
      } catch(e) {}
      
      const keyPattern = `sb-${hostname}-auth-token`;
      const session = localStorage.getItem(keyPattern);
      
      if (session) {
          const parsed = JSON.parse(session);
          if (parsed.user) {
              return {
                  username: parsed.user.email || 'User',
                  isLoggedIn: true
              };
          }
      }
  } catch(e) {}
  return null;
};

export const registerUser = async (email: string, password: string): Promise<void> => {
    if (isDevMode()) {
        throw new Error("开发者模式下不支持注册，请直接点击“进入系统”");
    }
    if (!isCloudConfigured()) {
        throw new Error("尚未配置云端数据库，无法注册账号。请先使用“开发者免密进入（本地数据模式）”试用，或在 .env 中配置 VITE_MEMFIRE_URL 和 VITE_MEMFIRE_ANON_KEY 后重新构建。");
    }
    const { error } = await supabase.auth.signUp({
        email,
        password
    });
    if (error) throw error;
};

export const loginUser = async (email: string, password: string): Promise<void> => {
    if (isDevMode()) {
        throw new Error("当前处于开发者模式，请退出后操作");
    }
    if (!isCloudConfigured()) {
        throw new Error("尚未配置云端数据库，无法登录账号。请先使用“开发者免密进入（本地数据模式）”试用，或配置 MemFire/Supabase 环境变量。");
    }
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
};

export const loginAsDev = async (): Promise<void> => {
    if (!isDevModeAllowed()) {
        throw new Error("Developer mode is disabled in this build");
    }
    localStorage.setItem('is_dev_mode', 'true');
    localStorage.setItem('dev_user', JSON.stringify({
        username: 'dev@developer.com',
        isLoggedIn: true
    }));
    await mockDelay(500);
};

export const logoutUser = async (): Promise<void> => {
  if (isDevMode()) {
      localStorage.removeItem('is_dev_mode');
      localStorage.removeItem('dev_user');
      return;
  }
  await supabase.auth.signOut();
};

// ============================================================================
// PROJECTS
// ============================================================================

const getLocalProjects = (): any[] => JSON.parse(localStorage.getItem('mock_projects') || '[]');
const saveLocalProjects = (data: any[]) => localStorage.setItem('mock_projects', JSON.stringify(data));

export const getProjects = async (): Promise<Project[]> => {
  if (isDevMode()) {
      await mockDelay();
      const raw = getLocalProjects();
      return raw.map(p => ({
          ...p,
          projectNumber: p.project_number,
          createdAt: new Date(p.created_at).getTime()
      }));
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        projectNumber: p.project_number,
        location: p.location,
        createdAt: new Date(p.created_at).getTime()
    }));
  } catch (e) {
    console.error("Fetch Projects Failed", e);
    return [];
  }
};

export const saveProject = async (project: Project): Promise<void> => {
  if (isDevMode()) {
      await mockDelay();
      const projects = getLocalProjects();
      const newProj = {
          id: Date.now().toString(), // Simple mock ID
          name: project.name,
          project_number: project.projectNumber,
          location: project.location,
          owner_id: 'dev-user',
          created_at: new Date().toISOString()
      };
      projects.unshift(newProj);
      saveLocalProjects(projects);
      return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please login");

  const { error } = await supabase
    .from('projects')
    .insert({
        name: project.name,
        project_number: project.projectNumber,
        location: project.location,
        owner_id: user.id
    });

  if (error) throw error;
};

export const updateProject = async (project: Project): Promise<void> => {
    if (isDevMode()) {
        await mockDelay();
        const projects = getLocalProjects();
        const index = projects.findIndex(p => p.id === project.id);
        if (index !== -1) {
            projects[index] = {
                ...projects[index],
                name: project.name,
                project_number: project.projectNumber,
                location: project.location
            };
            saveLocalProjects(projects);
        }
        return;
    }

    const { error } = await supabase
        .from('projects')
        .update({
            name: project.name,
            project_number: project.projectNumber,
            location: project.location
        })
        .eq('id', project.id);

    if (error) throw error;
};

export const getProjectById = async (id: string): Promise<Project | undefined> => {
    if (isDevMode()) {
        const projects = getLocalProjects();
        const found = projects.find(p => p.id === id);
        if (!found) return undefined;
        return {
            id: found.id,
            name: found.name,
            projectNumber: found.project_number,
            location: found.location,
            createdAt: new Date(found.created_at).getTime()
        };
    }

    try {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return undefined;

        return {
            id: data.id,
            name: data.name,
            projectNumber: data.project_number,
            location: data.location,
            createdAt: new Date(data.created_at).getTime()
        };
    } catch (e) {
        return undefined;
    }
};

export const deleteProjects = async (ids: string[]): Promise<void> => {
    if (!ids || ids.length === 0) return;

    if (isDevMode()) {
        let projects = getLocalProjects();
        projects = projects.filter(p => !ids.includes(p.id));
        saveLocalProjects(projects);
        
        // Also delete associated logs
        let logs = getLocalLogs();
        logs = logs.filter(l => !ids.includes(l.project_id));
        saveLocalLogs(logs);

        // Also delete associated concrete records
        let concrete = getLocalConcreteRecords();
        concrete = concrete.filter(c => !ids.includes(c.project_id));
        saveLocalConcreteRecords(concrete);
        
        return;
    }

    await supabase.from('concrete_records').delete().in('project_id', ids);
    await supabase.from('logs').delete().in('project_id', ids);
    await supabase.from('projects').delete().in('id', ids);
};

// ============================================================================
// LOGS
// ============================================================================

const getLocalLogs = (): any[] => JSON.parse(localStorage.getItem('mock_logs') || '[]');
const saveLocalLogs = (data: any[]) => localStorage.setItem('mock_logs', JSON.stringify(data));

export const getLogs = async (projectId?: string): Promise<LogEntry[]> => {
  if (isDevMode()) {
      await mockDelay();
      let logs = getLocalLogs();
      if (projectId) {
          logs = logs.filter(l => l.project_id === projectId);
      }
      // Sort desc
      logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return logs.map(l => ({
        id: l.id,
        projectId: l.project_id,
        date: l.date,
        weather: l.weather,
        location: l.location,
        messages: l.messages || [],
        report: l.report,
        status: l.status,
        lastModified: new Date(l.updated_at).getTime(),
        linkedRecords: l.linked_records || [] // MAP from DB snake_case
      }));
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
        .from('logs')
        .select('*')
        .eq('owner_id', user.id);

    if (projectId) {
        query = query.eq('project_id', projectId);
    }
    
    const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((l: any) => ({
        id: l.id,
        projectId: l.project_id,
        date: l.date,
        weather: l.weather,
        location: l.location,
        messages: l.messages || [],
        report: l.report,
        status: l.status,
        lastModified: new Date(l.updated_at).getTime(),
        linkedRecords: l.linked_records || [] // MAP from DB snake_case
    }));
  } catch (e) {
    console.error("Fetch Logs Failed", e);
    return [];
  }
};

export const saveLog = async (log: LogEntry): Promise<string> => {
  const payload = {
      project_id: log.projectId,
      date: log.date,
      weather: log.weather,
      location: log.location,
      messages: log.messages,
      report: log.report,
      status: log.status,
      updated_at: new Date().toISOString(),
      linked_records: log.linkedRecords || [] // SAVE to DB snake_case
  };

  if (isDevMode()) {
      const logs = getLocalLogs();
      const existingIndex = logs.findIndex(l => l.id === log.id);
      
      if (existingIndex >= 0) {
          // Update
          logs[existingIndex] = { ...logs[existingIndex], ...payload };
          saveLocalLogs(logs);
          return log.id;
      } else {
          // Insert
          const newId = Date.now().toString();
          logs.unshift({
              id: newId,
              ...payload,
              owner_id: 'dev-user',
              created_at: new Date().toISOString()
          });
          saveLocalLogs(logs);
          return newId;
      }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please login");
  
  const dbPayload = { ...payload, owner_id: user.id };
  const isTempId = !isNaN(Number(log.id));
  
  if (isTempId) {
      const { data, error } = await supabase.from('logs').insert(dbPayload).select().single();
      if (error) throw error;
      return data.id;
  } else {
      const { data, error } = await supabase.from('logs').update(dbPayload).eq('id', log.id).select().single();
      if (error) throw error;
      return data.id;
  }
};

export const getLogById = async (id: string): Promise<LogEntry | undefined> => {
  if (isDevMode()) {
      const logs = getLocalLogs();
      const data = logs.find(l => l.id === id);
      if (!data) return undefined;
      return {
        id: data.id,
        projectId: data.project_id,
        date: data.date,
        weather: data.weather,
        location: data.location,
        messages: data.messages || [],
        report: data.report,
        status: data.status,
        lastModified: new Date(data.updated_at).getTime(),
        linkedRecords: data.linked_records || [] // MAP from DB snake_case
      };
  }

  try {
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return undefined;

      return {
        id: data.id,
        projectId: data.project_id,
        date: data.date,
        weather: data.weather,
        location: data.location,
        messages: data.messages || [],
        report: data.report,
        status: data.status,
        lastModified: new Date(data.updated_at).getTime(),
        linkedRecords: data.linked_records || [] // MAP from DB snake_case
      };
  } catch (e) {
      return undefined;
  }
};

export const deleteLog = async (id: string): Promise<void> => {
    if (isDevMode()) {
        let logs = getLocalLogs();
        logs = logs.filter(l => l.id !== id);
        saveLocalLogs(logs);
        return;
    }
    await supabase.from('logs').delete().eq('id', id);
};

export const deleteLogs = async (ids: string[]): Promise<void> => {
    if (!ids || ids.length === 0) return;
    if (isDevMode()) {
        let logs = getLocalLogs();
        logs = logs.filter(l => !ids.includes(l.id));
        saveLocalLogs(logs);
        return;
    }
    await supabase.from('logs').delete().in('id', ids);
};

// ============================================================================
// CONCRETE SIDE STATION RECORDS (NEW)
// ============================================================================

const getLocalConcreteRecords = (): any[] => JSON.parse(localStorage.getItem('mock_concrete_records') || '[]');
const saveLocalConcreteRecords = (data: any[]) => localStorage.setItem('mock_concrete_records', JSON.stringify(data));

const mapConcreteRecord = (r: any): ConcreteRecord => ({
    id: r.id,
    projectId: r.project_id,
    date: r.date,
    createdAt: new Date(r.created_at).getTime(),
    status: r.status,
    data: r.data || {}
});

// projectId is optional to allow fetching all records for profile stats.
export const getConcreteRecords = async (projectId?: string): Promise<ConcreteRecord[]> => {
    if (isDevMode()) {
        await mockDelay();
        let records = getLocalConcreteRecords();
        if (projectId) {
            records = records.filter(r => r.project_id === projectId);
        }
        records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        return records.map(mapConcreteRecord);
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        let query = supabase
            .from('concrete_records')
            .select('*')
            .eq('owner_id', user.id);

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        return (data || []).map(mapConcreteRecord);
    } catch (e) {
        console.error("Fetch Concrete Records Failed", e);
        return [];
    }
};

export const getConcreteRecordById = async (id: string): Promise<ConcreteRecord | undefined> => {
    if (isDevMode()) {
        const records = getLocalConcreteRecords();
        const r = records.find(r => r.id === id);
        if (!r) return undefined;
        return mapConcreteRecord(r);
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return undefined;

        const { data, error } = await supabase
            .from('concrete_records')
            .select('*')
            .eq('owner_id', user.id)
            .eq('id', id)
            .single();

        if (error || !data) return undefined;
        return mapConcreteRecord(data);
    } catch (e) {
        console.error("Fetch Concrete Record Failed", e);
        return undefined;
    }
};

export const saveConcreteRecord = async (record: ConcreteRecord): Promise<string> => {
    const payload = {
        project_id: record.projectId,
        date: record.date,
        status: record.status,
        data: record.data,
        updated_at: new Date().toISOString()
    };

    if (isDevMode()) {
        const records = getLocalConcreteRecords();
        // Check if ID exists (if it's a temp ID like 'new' or timestamp)
        const existingIndex = records.findIndex(r => r.id === record.id);
        
        if (existingIndex >= 0) {
            // Update
            records[existingIndex] = { ...records[existingIndex], ...payload };
            saveLocalConcreteRecords(records);
            return record.id;
        } else {
            // Insert
            // FIX: If the record object passed in already has an ID (e.g. from the chat card), use it!
            // Do not blindly generate a new Date.now() if record.id is valid and not 'new'.
            const idToUse = (record.id && record.id !== 'new') ? record.id : Date.now().toString();
            
            records.unshift({
                ...payload,
                id: idToUse,
                created_at: new Date().toISOString()
            });
            saveLocalConcreteRecords(records);
            return idToUse;
        }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please login");

    const idToUse = (record.id && record.id !== 'new')
        ? record.id
        : (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());

    const dbPayload = {
        id: idToUse,
        ...payload,
        owner_id: user.id,
        created_at: new Date(record.createdAt || Date.now()).toISOString()
    };

    const { data, error } = await supabase
        .from('concrete_records')
        .upsert(dbPayload, { onConflict: 'id' })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
};

export const deleteConcreteRecords = async (ids: string[]): Promise<void> => {
    if (!ids || ids.length === 0) return;

    if (isDevMode()) {
        let records = getLocalConcreteRecords();
        records = records.filter(r => !ids.includes(r.id));
        saveLocalConcreteRecords(records);
        return;
    }

    const { error } = await supabase.from('concrete_records').delete().in('id', ids);
    if (error) throw error;
};
