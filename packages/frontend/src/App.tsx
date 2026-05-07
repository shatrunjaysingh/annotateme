import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Jobs from './pages/Jobs';
import AnnotationEditor from './pages/AnnotationEditor';
import Analytics from './pages/Analytics';
import Annotations from './pages/Annotations';
import CloudStorage from './pages/CloudStorage';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Tasks from './pages/Tasks';
import AdminPage from './pages/AdminPage';
import SupervisorPage from './pages/SupervisorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/projects" replace />} />

      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
      <Route path="/jobs/:id/annotate" element={<ProtectedRoute><AnnotationEditor /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/annotations" element={<ProtectedRoute><Annotations /></ProtectedRoute>} />
      <Route path="/cloud-storage" element={<ProtectedRoute><CloudStorage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />

      {/* Role-protected screens */}
      <Route path="/admin" element={<RoleRoute roles={['admin']}><AdminPage /></RoleRoute>} />
      <Route path="/supervisor" element={<RoleRoute roles={['admin', 'manager']}><SupervisorPage /></RoleRoute>} />

      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
