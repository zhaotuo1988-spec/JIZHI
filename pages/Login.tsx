
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser, loginAsDev, isDevModeAllowed } from '../services/storageService';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const showDevLogin = isDevModeAllowed();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('请输入邮箱和密码');
      setLoading(false);
      return;
    }

    try {
        if (isRegister) {
            await registerUser(email, password);
            setSuccessMsg('注册成功！请登录。');
            setIsRegister(false);
        } else {
            await loginUser(email, password);
            navigate('/projects');
        }
    } catch (err: any) {
        console.error(err);
        setError(err.message || '操作失败，请检查账号密码');
    } finally {
        setLoading(false);
    }
  };

  const handleDevLogin = async () => {
      setLoading(true);
      try {
          await loginAsDev();
          navigate('/projects');
      } catch (err: any) {
          setError(err.message || 'Developer mode is disabled');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <div className="w-full max-w-sm z-10">
        <div className="mb-10 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-xl shadow-blue-200 mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">智能监理日志</h1>
            <p className="text-gray-500 mt-2 text-sm">MemFire Cloud 云同步版</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">邮箱账号</label>
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入邮箱"
                    className="block w-full px-4 py-3.5 rounded-xl border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">密码</label>
                <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码 (至少6位)"
                    className="block w-full px-4 py-3.5 rounded-xl border-gray-200 bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
            </div>

            {error && <p className="text-sm text-red-500 ml-1 bg-red-50 p-2 rounded">{error}</p>}
            {successMsg && <p className="text-sm text-green-600 ml-1 bg-green-50 p-2 rounded">{successMsg}</p>}

            <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-bold text-white transition-all
                    ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'}
                `}
            >
                {loading ? '处理中...' : (isRegister ? '注册账号' : '立即登录')}
            </button>
        </form>

        {/* Developer Bypass Button */}
        {showDevLogin && <div className="mt-4">
             <button
                type="button"
                onClick={handleDevLogin}
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-xl bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
                🛠 开发者免密进入 (本地数据模式)
            </button>
        </div>}
        
        <div className="mt-6 text-center">
            <button 
                onClick={() => {
                    setIsRegister(!isRegister);
                    setError('');
                    setSuccessMsg('');
                }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
                {isRegister ? '已有账号？去登录' : '没有账号？注册新账号'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
