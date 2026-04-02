import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import WalletManagement from './pages/WalletManagement';
import MaAnalysis from './pages/MaAnalysis';
import MvrvAnalysis from './pages/MvrvAnalysis';
import Ahr999Analysis from './pages/Ahr999Analysis';
import BtcdomAnalysis from './pages/BtcdomAnalysis';

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
          <Route path="/analysis/ma" element={<MaAnalysis />} />
          <Route path="/analysis/mvrv" element={<MvrvAnalysis />} />
          <Route path="/analysis/ahr999" element={<Ahr999Analysis />} />
          <Route path="/analysis/btcdom" element={<BtcdomAnalysis />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
