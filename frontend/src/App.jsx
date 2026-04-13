import { useState, useEffect } from 'react';
import AppLogin          from './pages/AppLogin.jsx';
import AdminPanel        from './pages/AdminPanel.jsx';
import Dashboard         from './pages/Dashboard.jsx';
import ConnectionPicker  from './components/ConnectionPicker.jsx';
import api from './api/client.js';

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full bg-[#09090b]">
      <span className="w-5 h-5 border-2 border-zinc-800 border-t-violet-500 rounded-full animate-spin-fast" />
    </div>
  );
}

export default function App({ initialData }) {
  // When initialData is provided by SSR, skip the bootstrap API calls entirely
  const [loading,      setLoading]      = useState(!initialData);
  const [needsSetup,   setNeedsSetup]   = useState(initialData?.needsSetup   ?? false);
  const [user,         setUser]         = useState(initialData?.user         ?? null);
  const [dbConnected,  setDbConnected]  = useState(initialData?.dbConnected  ?? false);
  const [dbInfo,       setDbInfo]       = useState(initialData?.dbInfo       ?? null);
  const [dbPermission, setDbPermission] = useState(initialData?.dbPermission ?? null);
  const [tables,       setTables]       = useState(initialData?.tables       ?? []);
  const [showAdmin,    setShowAdmin]    = useState(false);

  useEffect(() => {
    // SSR already resolved the session state — no bootstrap calls needed
    if (initialData) return;

    api.get('/auth/setup-required')
      .then(res => {
        if (res.data.required) { setNeedsSetup(true); return null; }
        return api.get('/auth/me');
      })
      .then(res => {
        if (!res) return;
        if (res.data.user) {
          setUser(res.data.user);
          if (res.data.dbConnected) {
            setDbConnected(true);
            setDbInfo(res.data.dbInfo);
            setDbPermission(res.data.dbPermission || 'full');
            setTables(res.data.tables || []);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    setNeedsSetup(false);
  };

  const handleConnect = ({ dbInfo, dbPermission, tables }) => {
    setDbConnected(true);
    setDbInfo(dbInfo);
    setDbPermission(dbPermission || 'full');
    setTables(tables || []);
  };

  const handleDisconnect = () => {
    setDbConnected(false);
    setDbInfo(null);
    setDbPermission(null);
    setTables([]);
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    setUser(null);
    setDbConnected(false);
    setDbInfo(null);
    setDbPermission(null);
    setTables([]);
    setShowAdmin(false);
  };

  if (loading) return <Spinner />;

  if (needsSetup || !user) {
    return <AppLogin mode={needsSetup ? 'setup' : 'login'} onLogin={handleLogin} />;
  }

  if (showAdmin) {
    return <AdminPanel user={user} onClose={() => setShowAdmin(false)} onLogout={handleLogout} />;
  }

  if (!dbConnected) {
    return (
      <ConnectionPicker
        user={user}
        onConnect={handleConnect}
        onAdmin={() => setShowAdmin(true)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Dashboard
      dbInfo={dbInfo}
      dbPermission={dbPermission}
      initialTables={tables}
      user={user}
      onDisconnect={handleDisconnect}
      onLogout={handleLogout}
      onAdmin={() => setShowAdmin(true)}
    />
  );
}
