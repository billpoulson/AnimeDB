import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Settings from './pages/Settings';

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
  }`;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">AnimeDB</h1>
            <nav className="flex gap-2">
              <NavLink to="/" end className={navClass}>Dashboard</NavLink>
              <NavLink to="/library" className={navClass}>Library</NavLink>
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
