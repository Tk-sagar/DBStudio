import { useState, useEffect } from 'react';
import AppLogin          from './pages/AppLogin.jsx';
import AdminPanel        from './pages/AdminPanel.jsx';
import SuperAdminPanel   from './pages/SuperAdminPanel.jsx';
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
  const [loading,         setLoading]         = useState(!initialData);
  const [needsSetup,      setNeedsSetup]      = useState(initialData?.needsSetup   ?? false);
  const [user,            setUser]            = useState(initialData?.user         ?? null);
  const [dbConnected,     setDbConnected]     = useState(
    (initialData?.dbConnected ?? false) || (initialData?.openConnections?.length > 0)
  );
  const [dbInfo,          setDbInfo]          = useState(initialData?.dbInfo       ?? null);
  const [dbPermission,    setDbPermission]    = useState(initialData?.dbPermission ?? null);
  const [tables,          setTables]          = useState(initialData?.tables       ?? []);
  const [openConnections, setOpenConnections] = useState(initialData?.openConnections ?? []);
  const [activeConnId,    setActiveConnId]    = useState(initialData?.activeConnId ?? null);
  const [connectingId,    setConnectingId]    = useState(null);
  const [showAdmin,       setShowAdmin]       = useState(false);
  const [showPicker,      setShowPicker]      = useState(false);
  const [inviteToken]                         = useState(
    initialData?.inviteToken ||
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('invite') || null : null)
  );

  useEffect(() => {
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
          if (res.data.openConnections?.length) {
            setOpenConnections(res.data.openConnections);
            setActiveConnId(res.data.activeConnId || null);
            setDbConnected(true);
          }
          if (res.data.dbConnected) {
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
    if (typeof window !== 'undefined' && window.location.search.includes('invite')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Called whenever a connection is made (initial or additional)
  const handleConnect = ({ connId, dbInfo, dbPermission, tables }) => {
    setDbConnected(true);
    setDbInfo(dbInfo);
    setDbPermission(dbPermission || 'full');
    setTables(tables || []);
    setActiveConnId(connId);
    setOpenConnections(prev => {
      const entry = { id: connId, name: dbInfo.name, type: dbInfo.type, permission: dbPermission || 'full', dbInfo };
      const idx   = prev.findIndex(c => c.id === connId);
      if (idx >= 0) return prev.map((c, i) => i === idx ? entry : c);
      return [...prev, entry];
    });
    setShowPicker(false);
  };

  // Switch to an already-open connection
  const handleSwitchConnection = async (connId) => {
    if (connId === activeConnId) return;
    setConnectingId(connId);
    try {
      const res = await api.post(`/my/connections/${connId}/activate`);
      setDbConnected(true);
      setActiveConnId(connId);
      setDbInfo(res.data.dbInfo);
      setDbPermission(res.data.dbPermission);
      setTables(res.data.tables || []);
    } catch (err) {
      console.error('Switch connection failed', err);
    } finally {
      setConnectingId(null);
    }
  };

  // Close a specific open connection
  const handleCloseConnection = async (connId) => {
    try {
      const res        = await api.delete(`/my/connections/${connId}/disconnect`);
      const newOpen    = openConnections.filter(c => c.id !== connId);
      setOpenConnections(newOpen);

      if (res.data.activeConnId) {
        setActiveConnId(res.data.activeConnId);
        const newActive = newOpen.find(c => c.id === res.data.activeConnId);
        if (newActive) { setDbInfo(newActive.dbInfo); setDbPermission(newActive.permission); }
        setTables(res.data.tables || []);
      } else {
        setDbConnected(false);
        setActiveConnId(null);
        setDbInfo(null);
        setDbPermission(null);
        setTables([]);
      }
    } catch (err) {
      console.error('Close connection failed', err);
    }
  };

  // Disconnect all connections
  const handleDisconnect = () => {
    setDbConnected(false);
    setDbInfo(null);
    setDbPermission(null);
    setTables([]);
    setOpenConnections([]);
    setActiveConnId(null);
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    setUser(null);
    setDbConnected(false);
    setDbInfo(null);
    setDbPermission(null);
    setTables([]);
    setOpenConnections([]);
    setActiveConnId(null);
    setShowAdmin(false);
    setShowPicker(false);
  };

  if (loading) return <Spinner />;

  if (needsSetup || !user) {
    return <AppLogin mode={needsSetup ? 'setup' : 'login'} onLogin={handleLogin} inviteToken={inviteToken} />;
  }

  if (user.role === 'super_admin') {
    return <SuperAdminPanel user={user} onLogout={handleLogout} />;
  }

  if (showAdmin && user.role === 'tenant_admin') {
    return <AdminPanel user={user} onClose={() => setShowAdmin(false)} onLogout={handleLogout} />;
  }

  if (!dbConnected) {
    return (
      <ConnectionPicker
        user={user}
        onConnect={handleConnect}
        onAdmin={user.role === 'tenant_admin' ? () => setShowAdmin(true) : undefined}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <>
      <Dashboard
        dbInfo={dbInfo}
        dbPermission={dbPermission}
        initialTables={tables}
        user={user}
        openConnections={openConnections}
        activeConnId={activeConnId}
        connectingId={connectingId}
        onDisconnect={handleDisconnect}
        onLogout={handleLogout}
        onAdmin={user.role === 'tenant_admin' ? () => setShowAdmin(true) : undefined}
        onSwitchConnection={handleSwitchConnection}
        onCloseConnection={handleCloseConnection}
        onAddConnection={() => setShowPicker(true)}
      />

      {/* Add-connection overlay */}
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-auto py-10 px-4">
          <div className="w-full max-w-[540px]">
            <ConnectionPicker
              user={user}
              onConnect={handleConnect}
              onAdmin={user.role === 'tenant_admin' ? () => { setShowPicker(false); setShowAdmin(true); } : undefined}
              onLogout={handleLogout}
              onClose={() => setShowPicker(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
