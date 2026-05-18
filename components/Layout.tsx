
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
  title?: React.ReactNode; // Changed from string to React.ReactNode
  showBack?: boolean;
  onBack?: () => void; // New prop for custom back handling
  headerRight?: React.ReactNode; 
}

const Layout: React.FC<LayoutProps> = ({ children, title, showBack, onBack, headerRight }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 relative overflow-hidden mx-auto max-w-[750px] shadow-2xl border-x border-gray-200">
      {/* Header */}
      {/* Added pt-safe for status bar spacing and removed fixed height from container */}
      <header className="bg-[#EDEDED] text-black shadow-sm z-10 shrink-0 border-b border-gray-300 pt-safe transition-all duration-200">
        <div className="flex items-center justify-between px-4 h-[50px]">
            <div className="flex items-center flex-1 overflow-hidden mr-2">
            {showBack && (
                <button onClick={handleBack} className="mr-2 -ml-2 p-2 active:opacity-60 transition-opacity shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-black">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                </button>
            )}
            {/* Use a div instead of h1 to support interactive children properly, maintain style */}
            <div className="text-[17px] font-medium truncate flex items-center">
                {title || '智能监理日志'}
            </div>
            </div>
            
            {/* Right Action Button Area */}
            <div className="flex-none ml-2">
            {headerRight}
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col relative">
        {children}
      </main>
    </div>
  );
};

export default Layout;
