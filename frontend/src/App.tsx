import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Settings from './pages/Settings';
import Peers from './pages/Peers';
import Docs from './pages/Docs';
import Login from './pages/Login';
import { getAuthStatus, authLogout, setOnAuthFailure, type AuthStatus } from './api/client';

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
  }`;
}

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setAuth(status);
    } catch {
      setAuth({ setup: false, authenticated: false, authRequired: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    setOnAuthFailure(() => {
      setAuth((prev) => prev ? { ...prev, authenticated: false } : prev);
    });
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (auth?.authRequired && !auth.authenticated) {
    return <Login isSetup={!auth.setup} onSuccess={checkAuth} />;
  }

  const handleLogout = async () => {
    await authLogout();
    setAuth((prev) => prev ? { ...prev, authenticated: false, setup: true } : prev);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">AnimeDB</h1>
            <nav className="flex gap-2 items-center">
              <NavLink to="/" end className={navClass}>Dashboard</NavLink>
              <NavLink to="/library" className={navClass}>Library</NavLink>
              <NavLink to="/peers" className={navClass}>Peers</NavLink>
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
              <NavLink to="/docs" className={navClass}>Docs</NavLink>
              {auth?.authRequired && (
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-1"
                >
                  Logout
                </button>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/peers" element={<Peers />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/docs" element={<Docs />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
