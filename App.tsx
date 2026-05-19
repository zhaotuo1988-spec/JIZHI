
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Recorder from './pages/Recorder';
import Report from './pages/Report';
import Login from './pages/Login';
import ProjectList from './pages/ProjectList';
import AdminUsers from './pages/AdminUsers';
import ConcreteList from './pages/ConcreteList';
import ConcreteForm from './pages/ConcreteForm';
import ConcreteReport from './pages/ConcreteReport';
import { AuthProvider, useAuth } from './services/authContext';

const RouteLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-9 h-9 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
  </div>
);

// Auth Guard Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user || !user.isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user || !user.isLoggedIn) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/projects" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* Login Page */}
          <Route path="/login" element={<Login />} />

          {/* Admin Account Management */}
          <Route path="/admin/users" element={
              <AdminRoute>
                  <AdminUsers />
              </AdminRoute>
          } />

          {/* Project Selection (Home for logged in users) */}
          <Route path="/projects" element={
              <ProtectedRoute>
                  <ProjectList />
              </ProtectedRoute>
          } />
        
        {/* Project Log List */}
        <Route path="/project/:projectId/logs" element={
            <ProtectedRoute>
                <Home />
            </ProtectedRoute>
        } />
        
        {/* Recording & Chat Interface - Specific to a project */}
        <Route path="/project/:projectId/record/:id" element={
            <ProtectedRoute>
                <Recorder />
            </ProtectedRoute>
        } />
        
        {/* Report Preview & Export Interface - Specific to a project */}
        <Route path="/project/:projectId/report/:id" element={
            <ProtectedRoute>
                <Report />
            </ProtectedRoute>
        } />

        {/* Concrete Side Station List */}
        <Route path="/project/:projectId/side/concrete" element={
            <ProtectedRoute>
                <ConcreteList />
            </ProtectedRoute>
        } />

        {/* Concrete Side Station Form (New/Edit) */}
        <Route path="/project/:projectId/side/concrete/:recordId" element={
            <ProtectedRoute>
                <ConcreteForm />
            </ProtectedRoute>
        } />

        {/* Concrete Side Station Report Preview (NEW) */}
        <Route path="/project/:projectId/side/concrete/report/:recordId" element={
            <ProtectedRoute>
                <ConcreteReport />
            </ProtectedRoute>
        } />
        
          {/* Default Redirect - Modified to point to Login first */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
