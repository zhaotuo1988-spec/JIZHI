import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  AdminManagedUser,
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser
} from '../services/adminService';
import { useAuth } from '../services/authContext';

const emptyForm = {
  email: '',
  password: '',
  displayName: '',
  role: 'user' as 'admin' | 'user'
};

const AdminUsers: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const totals = useMemo(() => users.reduce((acc, item) => ({
    users: acc.users + 1,
    active: acc.active + (item.status === 'active' ? 1 : 0),
    projects: acc.projects + item.stats.projects,
    logs: acc.logs + item.stats.logs
  }), { users: 0, active: 0, projects: 0, logs: 0 }), [users]);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await fetchAdminUsers());
    } catch (err: any) {
      setError(err.message || '加载账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async () => {
    if (!form.email.trim() || form.password.length < 6) {
      setError('请输入邮箱，并设置至少 6 位初始密码。');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createAdminUser({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        role: form.role
      });
      setShowCreate(false);
      setForm(emptyForm);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || '创建账号失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (managedUser: AdminManagedUser) => {
    if (managedUser.id === currentUser?.id && managedUser.status === 'active') {
      alert('不能停用当前登录的管理员账号。');
      return;
    }

    const nextStatus = managedUser.status === 'active' ? 'inactive' : 'active';
    const ok = window.confirm(nextStatus === 'inactive'
      ? `确定停用 ${managedUser.email} 吗？停用后该账号不能继续登录或调用接口。`
      : `确定启用 ${managedUser.email} 吗？`);
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      await updateAdminUser(managedUser.id, { status: nextStatus });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || '更新账号状态失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (managedUser: AdminManagedUser) => {
    if (managedUser.id === currentUser?.id) {
      alert('不能修改当前登录账号的管理员角色。');
      return;
    }

    const nextRole = managedUser.role === 'admin' ? 'user' : 'admin';
    const ok = window.confirm(`确定将 ${managedUser.email} 设置为${nextRole === 'admin' ? '管理员' : '普通用户'}吗？`);
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      await updateAdminUser(managedUser.id, { role: nextRole });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || '更新角色失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (managedUser: AdminManagedUser) => {
    const password = window.prompt(`请输入 ${managedUser.email} 的新密码（至少 6 位）`);
    if (!password) return;
    if (password.length < 6) {
      alert('新密码至少 6 位。');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await resetAdminUserPassword(managedUser.id, password);
      alert('密码已重置。');
    } catch (err: any) {
      setError(err.message || '重置密码失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout
      title="账号管理"
      showBack
      onBack={() => navigate('/projects')}
      headerRight={
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-semibold active:scale-95"
        >
          新增
        </button>
      }
    >
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-8">
        <div className="p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin Console</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">管理员分配账号</h2>
                <p className="mt-1 text-sm text-slate-500">集中创建账号、停用访问、重置密码，并查看每个账号的数据量。</p>
              </div>
              <button
                onClick={loadUsers}
                disabled={loading || saving}
                className="shrink-0 w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center active:scale-95 disabled:opacity-60"
                title="刷新"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M7.977 14.652H2.985m18.03-10.296v4.992m0 0h-4.992m4.992 0-3.181-3.183a8.25 8.25 0 0 0-13.803 3.7" />
                </svg>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-100 p-3">
                <p className="text-[11px] text-slate-500">账号</p>
                <p className="text-lg font-bold text-slate-900">{totals.users}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-[11px] text-emerald-700">启用</p>
                <p className="text-lg font-bold text-emerald-800">{totals.active}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-[11px] text-blue-700">项目</p>
                <p className="text-lg font-bold text-blue-800">{totals.projects}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-[11px] text-amber-700">日志</p>
                <p className="text-lg font-bold text-amber-800">{totals.logs}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center rounded-xl bg-white border border-slate-200 py-12 text-slate-500">
                暂无账号，请先新增一个用户。
              </div>
            ) : users.map((managedUser) => (
              <div key={managedUser.id} className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold ${managedUser.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-700'}`}>
                    {(managedUser.displayName || managedUser.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 truncate max-w-full">{managedUser.displayName || managedUser.email}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${managedUser.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {managedUser.status === 'active' ? '启用' : '停用'}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${managedUser.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-700'}`}>
                        {managedUser.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 break-all">{managedUser.email}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-base font-bold text-slate-900">{managedUser.stats.projects}</p>
                    <p className="text-[11px] text-slate-500">项目</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-base font-bold text-slate-900">{managedUser.stats.logs}</p>
                    <p className="text-[11px] text-slate-500">日志</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-base font-bold text-slate-900">{managedUser.stats.concreteRecords}</p>
                    <p className="text-[11px] text-slate-500">旁站</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    disabled={saving}
                    onClick={() => handleToggleStatus(managedUser)}
                    className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60 active:scale-95"
                  >
                    {managedUser.status === 'active' ? '停用' : '启用'}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleChangeRole(managedUser)}
                    className="rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60 active:scale-95"
                  >
                    改角色
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleResetPassword(managedUser)}
                    className="rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-60 active:scale-95"
                  >
                    重置密码
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900">新增账号</h3>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">邮箱账号</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">初始密码</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">显示名称</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">角色</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['user', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, role }))}
                      className={`rounded-lg border py-2.5 text-sm font-semibold ${form.role === role ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                    >
                      {role === 'admin' ? '管理员' : '普通用户'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-600/20 disabled:opacity-60 active:scale-[0.98]"
              >
                {saving ? '创建中...' : '创建账号'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AdminUsers;
