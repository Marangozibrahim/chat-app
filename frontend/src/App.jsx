import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RoomsPage from './pages/RoomsPage'
import ChatPage from './pages/ChatPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/rooms" element={<ProtectedRoute><RoomsPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/rooms" replace />} />
    </Routes>
  )
}
