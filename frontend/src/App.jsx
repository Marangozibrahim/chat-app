import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RoomsPage from './pages/RoomsPage'
import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/rooms" element={<ProtectedRoute><RoomsPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      {/* Gated by its own admin token, not chat-user auth — intentionally outside ProtectedRoute. */}
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/rooms" replace />} />
    </Routes>
  )
}
