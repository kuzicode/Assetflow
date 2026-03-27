import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import WalletManagement from './pages/WalletManagement';
import Settings from './pages/Settings';
import AccountManagement from './pages/AccountManagement';

function AuthLayout() {
  const authMode = localStorage.getItem('authMode');
  if (!authMode) return <Navigate to="/login" replace />;
  return <Layout />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/wallets" element={<WalletManagement />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/account" element={<AccountManagement />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
