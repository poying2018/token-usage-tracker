import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Usage from './pages/Usage';
import Vendors from './pages/Vendors';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import { getUser, getToken, clearToken, clearUser, getDeviceId, getDeviceName, api } from './utils/api';

interface AuthContextType {
  user: any;
  login: (token: string, userData: any) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

export const useAuth = () => useContext(AuthContext);

function App() {
  const [user, setUser] = useState<any>(getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify token on mount
    const token = getToken();
    if (token) {
      // Try a lightweight API call to validate
      api.getStats('today').catch(() => {
        clearToken();
        clearUser();
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((token: string, userData: any) => {
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearUser();
    setUser(null);
  }, []);

  const isAuthenticated = !!getToken() && !!user;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated }}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={
          isAuthenticated ? (
            <Layout />
          ) : (
            <Navigate to="/login" />
          )
        } />
      </Routes>
    </AuthContext.Provider>
  );
}

function Layout() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="app-layout">
      <Sidebar activePath={path} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
