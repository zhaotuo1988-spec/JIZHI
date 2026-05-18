
import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import Recorder from './pages/Recorder';
import Report from './pages/Report';
import Login from './pages/Login';
import ProjectList from './pages/ProjectList';
import ConcreteList from './pages/ConcreteList';
import ConcreteForm from './pages/ConcreteForm';
import ConcreteReport from './pages/ConcreteReport';
import { getUser } from './services/storageService';

// Auth Guard Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = getUser();
  if (!user || !user.isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Login Page */}
        <Route path="/login" element={<Login />} />

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
  );
};

export default App;
