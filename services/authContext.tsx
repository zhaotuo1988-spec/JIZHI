import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { isDevMode, logoutUser, supabase } from './storageService';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const buildDevUser = (): User | null => {
  if (!isDevMode()) return null;

  try {
    const stored = localStorage.getItem('dev_user');
    const parsed = stored ? JSON.parse(stored) : {};
    return {
      id: 'dev-user-id',
      username: parsed.username || 'dev@developer.com',
      email: parsed.username || 'dev@developer.com',
      displayName: 'Developer Admin',
      role: 'admin',
      status: 'active',
      isLoggedIn: true
    };
  } catch {
    return {
      id: 'dev-user-id',
      username: 'dev@developer.com',
      email: 'dev@developer.com',
      displayName: 'Developer Admin',
      role: 'admin',
      status: 'active',
      isLoggedIn: true
    };
  }
};

const loadSupabaseUser = async (): Promise<User | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;
  if (!sessionUser) return null;

  let profile: any = null;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,email,display_name,role,status')
    .eq('user_id', sessionUser.id)
    .maybeSingle();

  if (!error && data) {
    profile = data;
  } else if (error) {
    console.warn('Profile lookup failed; falling back to auth user metadata.', error.message);
  }

  if (profile?.status === 'inactive') {
    await logoutUser();
    return null;
  }

  const email = profile?.email || sessionUser.email || 'User';
  const displayName = profile?.display_name || sessionUser.user_metadata?.display_name || email;

  return {
    id: sessionUser.id,
    username: displayName,
    email,
    displayName,
    role: profile?.role === 'admin' ? 'admin' : 'user',
    status: profile?.status === 'inactive' ? 'inactive' : 'active',
    isLoggedIn: true
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const devUser = buildDevUser();
      setUser(devUser || await loadSupabaseUser());
    } catch (error) {
      console.error('Auth refresh failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const devUser = buildDevUser();
        const nextUser = devUser || await loadSupabaseUser();
        if (mounted) setUser(nextUser);
      } catch (error) {
        console.error('Initial auth load failed:', error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const { data } = supabase.auth.onAuthStateChange(() => {
      if (isDevMode()) return;
      window.setTimeout(load, 0);
    });

    window.addEventListener('storage', refreshUser);

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      window.removeEventListener('storage', refreshUser);
    };
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAdmin: user?.role === 'admin',
    refreshUser
  }), [loading, refreshUser, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
