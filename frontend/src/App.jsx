import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { TourProvider } from './context/TourContext';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Market from './pages/Market';
import Portfolio from './pages/Portfolio';
import Watchlist from './pages/Watchlist';
import Transactions from './pages/Transactions';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#94a3b8', fontSize: '1.2rem' }}>Loading…</div>;
  return user ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Auth />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/market" element={<ProtectedRoute><Market /></ProtectedRoute>} />
      <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
      <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <TourProvider>
            <AppRoutes />
          </TourProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
