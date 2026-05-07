import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import Navbar from '../components/Navbar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TableGrid from '../components/TableGrid.jsx';
import TableStructure from '../components/TableStructure.jsx';
import AlterTable from '../components/AlterTable.jsx';
import QueriesPage from './QueriesPage.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import RowEditPage from '../components/RowEditPage.jsx';

const SqlEditor = lazy(() => import('../components/SqlEditor.jsx'));

// ── Persistence helpers (scoped per connection) ───────────────────────────────
const lsTabsKey   = (connId) => `ws_tabs_${connId}`;
const lsActiveKey = (connId) => `ws_active_${connId}`;
const lsSqlKey    = (connId, tabId) => `ws_sql_${connId}_${tabId}`;

function loadTabs(connId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsTabsKey(connId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function loadActiveId(connId, tabs) {
  if (typeof window === 'undefined') return tabs[0].id;
  try {
    const saved = localStorage.getItem(lsActiveKey(connId));
    if (saved && tabs.find(t => t.id === saved)) return saved;
  } catch {}
  return tabs[0].id;
}

function defaultTabs() {
  return [{ id: `sql_${Date.now()}`, type: 'sql', label: 'Query 1' }];
}

function maxSqlN(tabs) {
  return tabs.reduce((acc, t) => {
    if (t.type !== 'sql') return acc;
    const m = t.label.match(/^Query (\d+)$/);
    return m ? Math.max(acc, parseInt(m[1])) : acc;
  }, 0);
}

// ── Tab-type icons ────────────────────────────────────────────────────────────
function SqlTabIcon({ active }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <path d="M1.5 3.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 8.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function TableTabIcon({ active }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <rect x="0.5" y="0.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1"/>
      <path d="M0.5 4h10M4 4v6.5" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

function AlterTabIcon({ active }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <path d="M1 5.5h4M7 5.5h3M5 3.5l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function QueriesTabIcon({ active }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <rect x="0.5" y="0.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1"/>
      <path d="M2.5 4h6M2.5 6h4M2.5 8h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function ActivityTabIcon({ active }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={active ? 'text-violet-400' : 'text-zinc-600'}>
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M5.5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Workbench tab bar ─────────────────────────────────────────────────────────
function WorkbenchTabBar({ tabs, activeId, onSwitch, onNewSql, onClose, onReorder }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState({ id: null, side: null });

  const handleDragStart = (e, tabId) => {
    setDraggingId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  };

  const handleDragOver = (e, tabId) => {
    e.preventDefault();
    if (tabId === draggingId) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTarget({ id: tabId, side });
  };

  const handleDrop = (e, tabId) => {
    e.preventDefault();
    if (!draggingId || tabId === draggingId) return;
    onReorder(draggingId, tabId, dropTarget.side);
    setDraggingId(null);
    setDropTarget({ id: null, side: null });
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget({ id: null, side: null });
  };

  return (
    <div
      className="flex items-center bg-base border-b border-zinc-700/80 overflow-x-auto shrink-0 h-[38px]"
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget({ id: null, side: null }); }}
    >
      {tabs.map(tab => {
        const isActive   = tab.id === activeId;
        const isDragging = tab.id === draggingId;
        const isDropLeft  = dropTarget.id === tab.id && dropTarget.side === 'left';
        const isDropRight = dropTarget.id === tab.id && dropTarget.side === 'right';

        return (
          <div
            key={tab.id}
            draggable
            onDragStart={e => handleDragStart(e, tab.id)}
            onDragOver={e => handleDragOver(e, tab.id)}
            onDrop={e => handleDrop(e, tab.id)}
            onDragEnd={handleDragEnd}
            onClick={() => onSwitch(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3.5 h-full border-r border-zinc-700/60 flex-shrink-0 max-w-[200px] min-w-[90px] select-none cursor-pointer ${
              isDragging ? 'opacity-40' : 'transition-colors'
            } ${
              isActive
                ? 'bg-base text-zinc-200'
                : 'text-zinc-500 hover:bg-surface hover:text-zinc-400'
            }`}
          >
            {/* Drop indicators */}
            {isDropLeft  && <span className="absolute left-0 inset-y-1 w-0.5 bg-violet-500 rounded-full z-10" />}
            {isDropRight && <span className="absolute right-0 inset-y-1 w-0.5 bg-violet-500 rounded-full z-10" />}

            {/* Violet top accent on active */}
            {isActive && <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500" />}

            {/* Icon */}
            {tab.type === 'sql'      && <SqlTabIcon active={isActive} />}
            {tab.type === 'table'    && <TableTabIcon active={isActive} />}
            {tab.type === 'queries'  && <QueriesTabIcon active={isActive} />}
            {tab.type === 'alter'    && <AlterTabIcon active={isActive} />}
            {tab.type === 'activity' && <ActivityTabIcon active={isActive} />}

            {/* Label */}
            <span className="text-[11px] font-medium truncate flex-1 text-left">{tab.label}</span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={-1}
              draggable={false}
              onClick={e => onClose(tab.id, e)}
              className="shrink-0 opacity-0 group-hover:opacity-100 w-3.5 h-3.5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/20 transition-all"
            >
              <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                <path d="M1 1l5 5M6 1L1 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </span>
          </div>
        );
      })}

      {/* New SQL tab */}
      <button
        onClick={onNewSql}
        title="New query tab"
        className="flex items-center justify-center w-8 h-8 mx-0.5 shrink-0 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/15 rounded transition-all"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── Table view (data / structure sub-tabs) ────────────────────────────────────
function TableTabView({ tableName, subview, onSubviewChange, dbPermission, user, onAlterTable }) {
  const isAdmin = user?.role === 'org_admin' || user?.role === 'super_admin';
  const [editingRow, setEditingRow] = useState(null);

  if (editingRow) {
    return (
      <RowEditPage
        tableName={tableName}
        row={editingRow.row}
        pkColumn={editingRow.pkColumn}
        onBack={() => setEditingRow(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-6 pt-5 border-b border-zinc-800 bg-base">
        <span className="text-zinc-600 text-xs font-mono mr-3 pb-3 select-none">{tableName}</span>
        {['data', 'structure'].map(v => (
          <button
            key={v}
            onClick={() => onSubviewChange(v)}
            className={`px-3.5 py-2 text-xs font-medium -mb-px border-b-2 transition-all capitalize ${
              subview === v ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => onAlterTable(tableName)}
            className="ml-2 mb-1 h-6 px-2.5 flex items-center gap-1.5 text-[11px] font-medium rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-400 transition-all"
          >
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
              <path d="M1 5.5h2.5m5.5 0H6.5m0 0V3m0 2.5V8M1 2.5h2m0 0V1m0 1.5V4M7 8.5h2m0 0V7m0 1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Alter Table
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {subview === 'data' && (
          <TableGrid
            tableName={tableName}
            dbPermission={dbPermission}
            onEditRow={(row, pkCol) => setEditingRow({ row, pkColumn: pkCol })}
          />
        )}
        {subview === 'structure' && <TableStructure tableName={tableName} />}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ dbInfo, dbPermission, initialTables, user, onDisconnect, onLogout, onAdmin, openConnections, activeConnId, connectingId, onSwitchConnection, onCloseConnection, onAddConnection }) {
  const [openTabs, setOpenTabs] = useState(() => {
    const saved = loadTabs(activeConnId);
    return saved || defaultTabs();
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = loadTabs(activeConnId);
    const tabs = saved || defaultTabs();
    return loadActiveId(activeConnId, tabs);
  });

  const sqlCountRef = useRef(null);
  if (sqlCountRef.current === null) sqlCountRef.current = maxSqlN(openTabs) + 1;

  // When connection switches, load that connection's tabs (or start fresh)
  const prevConnId = useRef(activeConnId);
  useEffect(() => {
    if (prevConnId.current === activeConnId) return;
    prevConnId.current = activeConnId;
    const saved = loadTabs(activeConnId);
    const tabs = saved || defaultTabs();
    setOpenTabs(tabs);
    setActiveTabId(loadActiveId(activeConnId, tabs));
    sqlCountRef.current = maxSqlN(tabs) + 1;
  }, [activeConnId]);

  // Persist tabs and active tab (scoped to this connection)
  useEffect(() => {
    try { localStorage.setItem(lsTabsKey(activeConnId), JSON.stringify(openTabs)); } catch {}
  }, [openTabs, activeConnId]);

  useEffect(() => {
    try { localStorage.setItem(lsActiveKey(activeConnId), activeTabId); } catch {}
  }, [activeTabId, activeConnId]);

  // ── Tab operations ──────────────────────────────────────────────────────────
  const switchTab = (id) => setActiveTabId(id);

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (openTabs.length <= 1) return;
    const idx = openTabs.findIndex(t => t.id === id);
    const closing = openTabs.find(t => t.id === id);
    if (closing?.type === 'sql') {
      try { localStorage.removeItem(lsSqlKey(activeConnId, id)); } catch {}
    }
    const next = openTabs.filter(t => t.id !== id);
    setOpenTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.min(idx, next.length - 1)].id);
  };

  const openNewSqlTab = () => {
    const id = `sql_${Date.now()}`;
    const label = `Query ${sqlCountRef.current++}`;
    setOpenTabs(prev => [...prev, { id, type: 'sql', label }]);
    setActiveTabId(id);
  };

  // Clicking a table: find existing tab or open new one
  const handleTableSelect = (tableName) => {
    const existing = openTabs.find(t => t.type === 'table' && t.tableName === tableName);
    if (existing) { setActiveTabId(existing.id); return; }
    const id = `table_${tableName}_${Date.now()}`;
    setOpenTabs(prev => [...prev, { id, type: 'table', label: tableName, tableName, subview: 'data' }]);
    setActiveTabId(id);
  };

  // Clicking "Saved Queries" in sidebar: find existing tab or open one
  const handleOpenQueries = () => {
    const existing = openTabs.find(t => t.type === 'queries');
    if (existing) { setActiveTabId(existing.id); return; }
    const tab = { id: 'queries', type: 'queries', label: 'Saved Queries' };
    setOpenTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleOpenActivityLog = () => {
    const existing = openTabs.find(t => t.type === 'activity');
    if (existing) { setActiveTabId(existing.id); return; }
    const tab = { id: 'activity', type: 'activity', label: 'Activity Log' };
    setOpenTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  // From QueriesPage: open a query in a new SQL tab and auto-run it
  const handleOpenInEditor = (query) => {
    if (query?.id) sessionStorage.setItem('db_pendingQuery', JSON.stringify(query));
    const id = `sql_${Date.now()}`;
    const label = query?.name || `Query ${sqlCountRef.current++}`;
    setOpenTabs(prev => [...prev, { id, type: 'sql', label }]);
    setActiveTabId(id);
  };

  const setSubview = (tabId, sv) => {
    setOpenTabs(prev => prev.map(t => t.id === tabId ? { ...t, subview: sv } : t));
  };

  const handleOpenAlterTable = (tableName) => {
    const existing = openTabs.find(t => t.type === 'alter' && t.tableName === tableName);
    if (existing) { setActiveTabId(existing.id); return; }
    const id = `alter_${tableName}_${Date.now()}`;
    setOpenTabs(prev => [...prev, { id, type: 'alter', label: `⚙ ${tableName}`, tableName }]);
    setActiveTabId(id);
  };

  const handleAlterDone = (tabId, tableName, { dropped } = {}) => {
    setOpenTabs(prev => prev.filter(t => {
      if (t.id === tabId) return false;
      if (dropped && t.tableName === tableName) return false;
      return true;
    }));
    setActiveTabId(prev => {
      const remaining = openTabs.filter(t => t.id !== tabId && !(dropped && t.tableName === tableName));
      return remaining.length > 0 ? remaining[remaining.length - 1].id : openTabs[0]?.id;
    });
  };

  const reorderTabs = useCallback((dragId, dropId, side) => {
    setOpenTabs(prev => {
      const items = [...prev];
      const fromIdx = items.findIndex(t => t.id === dragId);
      if (fromIdx === -1) return prev;
      const [moved] = items.splice(fromIdx, 1);
      const targetIdx = items.findIndex(t => t.id === dropId);
      if (targetIdx === -1) return [...items, moved];
      items.splice(side === 'right' ? targetIdx + 1 : targetIdx, 0, moved);
      return items;
    });
  }, []);

  const handleDisconnect = () => {
    sessionStorage.removeItem('db_pendingQuery');
    onDisconnect();
  };

  // Derive sidebar highlight state from active tab
  const activeTab    = openTabs.find(t => t.id === activeTabId);
  const activeView   = activeTab?.type ?? null;
  const selectedTable = activeTab?.type === 'table' ? activeTab.tableName : null;

  return (
    <div className="flex flex-col h-full bg-base text-zinc-100 font-sans">
      {/* Top navbar */}
      <Navbar
        dbInfo={dbInfo}
        user={user}
        onDisconnect={handleDisconnect}
        onLogout={onLogout}
        onAdmin={onAdmin}
        openConnections={openConnections}
        activeConnId={activeConnId}
        connectingId={connectingId}
        onSwitchConnection={onSwitchConnection}
        onCloseConnection={onCloseConnection}
        onAddConnection={onAddConnection}
      />

      {/* ── Workbench tab bar (full width, below navbar) ── */}
      <WorkbenchTabBar
        tabs={openTabs}
        activeId={activeTabId}
        onSwitch={switchTab}
        onNewSql={openNewSqlTab}
        onClose={closeTab}
        onReorder={reorderTabs}
      />

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          key={activeConnId}
          selectedTable={selectedTable}
          onTableSelect={handleTableSelect}
          onSqlOpen={openNewSqlTab}
          onQueriesOpen={handleOpenQueries}
          onActivityLogOpen={handleOpenActivityLog}
          activeView={activeView}
          initialTables={initialTables}
          dbPermission={dbPermission}
          user={user}
        />

        {/* Main content — all tabs mounted, only active is visible */}
        <main className="flex-1 overflow-hidden relative">
          {openTabs.map(tab => (
            <div
              key={tab.id}
              className={tab.id === activeTabId ? 'h-full flex flex-col' : 'hidden'}
            >
              {tab.type === 'sql' && (
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <span className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin-fast" />
                  </div>
                }>
                  <SqlEditor
                    user={user}
                    dbPermission={dbPermission}
                    active={tab.id === activeTabId}
                    tabId={tab.id}
                    connId={activeConnId}
                  />
                </Suspense>
              )}

              {tab.type === 'table' && (
                <TableTabView
                  tableName={tab.tableName}
                  subview={tab.subview}
                  onSubviewChange={(sv) => setSubview(tab.id, sv)}
                  dbPermission={dbPermission}
                  user={user}
                  onAlterTable={handleOpenAlterTable}
                />
              )}

              {tab.type === 'alter' && (
                <AlterTable
                  tableName={tab.tableName}
                  onDone={(result) => handleAlterDone(tab.id, tab.tableName, result)}
                />
              )}

              {tab.type === 'queries' && (
                <QueriesPage onOpenInEditor={handleOpenInEditor} />
              )}

              {tab.type === 'activity' && (
                <ActivityLog />
              )}
            </div>
          ))}

          {/* Fallback empty state (should not normally show) */}
          {openTabs.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-zinc-400 text-sm font-medium mb-1">No tabs open</p>
                <button onClick={openNewSqlTab} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  Open a new query tab
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
