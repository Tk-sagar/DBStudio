import { useState, lazy, Suspense } from 'react';
import Navbar from '../components/Navbar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TableGrid from '../components/TableGrid.jsx';
import TableStructure from '../components/TableStructure.jsx';

const SqlEditor = lazy(() => import('../components/SqlEditor.jsx'));

const STORAGE_KEY_TABLE = 'db_selectedTable';
const STORAGE_KEY_VIEW  = 'db_activeView';

export default function Dashboard({ dbInfo, dbPermission, initialTables, user, onDisconnect, onLogout, onAdmin }) {
  // typeof window guard: sessionStorage doesn't exist in Node.js during SSR
  const [selectedTable, setSelectedTable] = useState(
    () => typeof window !== 'undefined' ? (sessionStorage.getItem(STORAGE_KEY_TABLE) || null) : null
  );
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved = sessionStorage.getItem(STORAGE_KEY_VIEW);
    if (saved === 'sql' && dbPermission !== 'full') return null;
    return saved || (dbPermission === 'full' ? 'sql' : null);
  });

  const persistView = (table, view) => {
    if (table) sessionStorage.setItem(STORAGE_KEY_TABLE, table);
    else        sessionStorage.removeItem(STORAGE_KEY_TABLE);
    if (view) sessionStorage.setItem(STORAGE_KEY_VIEW, view);
    else      sessionStorage.removeItem(STORAGE_KEY_VIEW);
  };

  const handleTableSelect = (tableName) => {
    setSelectedTable(tableName);
    setActiveView('data');
    persistView(tableName, 'data');
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    persistView(selectedTable, view);
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem(STORAGE_KEY_TABLE);
    sessionStorage.removeItem(STORAGE_KEY_VIEW);
    onDisconnect();
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-zinc-100 font-sans">
      <Navbar dbInfo={dbInfo} user={user} onDisconnect={handleDisconnect} onLogout={onLogout} onAdmin={onAdmin} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedTable={selectedTable}
          onTableSelect={handleTableSelect}
          onSqlOpen={() => handleViewChange('sql')}
          activeView={activeView}
          initialTables={initialTables}
          dbPermission={dbPermission}
        />

        <main className="flex-1 overflow-auto bg-[#09090b]">
          {/* SQL Editor */}
          {activeView === 'sql' && dbPermission === 'full' && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <span className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin-fast" />
              </div>
            }>
              <SqlEditor user={user} />
            </Suspense>
          )}

          {/* Table view */}
          {(activeView === 'data' || activeView === 'structure') && selectedTable && (
            <div className="h-full flex flex-col">
              {/* Tab bar */}
              <div className="flex items-center gap-1 px-6 pt-5 border-b border-white/[0.07] bg-[#09090b]">
                <span className="text-zinc-600 text-xs font-mono mr-3 pb-3 select-none">{selectedTable}</span>
                {['data', 'structure'].map(view => (
                  <button
                    key={view}
                    onClick={() => handleViewChange(view)}
                    className={`px-3.5 py-2 text-xs font-medium -mb-px border-b-2 transition-all capitalize ${
                      activeView === view
                        ? 'border-violet-500 text-violet-400'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-6">
                {activeView === 'data'      && <TableGrid tableName={selectedTable} dbPermission={dbPermission} />}
                {activeView === 'structure' && <TableStructure tableName={selectedTable} />}
              </div>
            </div>
          )}

          {/* Empty state */}
          {activeView !== 'sql' && !selectedTable && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#111113] border border-white/[0.07] flex items-center justify-center mx-auto mb-5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-zinc-700">
                    <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1.5 8h21M8 8v14" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                </div>
                <p className="text-zinc-400 text-sm font-medium mb-1">Select a table</p>
                <p className="text-zinc-700 text-xs">Choose a table from the sidebar to view its data</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
