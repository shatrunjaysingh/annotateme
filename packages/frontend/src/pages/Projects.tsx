import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import { useTenantStore } from '../store/tenantStore';

interface Project {
  id: string;
  name: string;
  description: string;
  dataType: string;
  labelSet: string[];
  totalItems: number;
  annotatedItems: number;
  progress: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  tasks?: any[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  in_progress: { label: 'In Progress', color: '#1890ff', bg: '#e6f4ff' },
  completed:   { label: 'Completed',   color: '#52c41a', bg: '#f6ffed' },
  rejected:    { label: 'Rejected',    color: '#ff4d4f', bg: '#fff1f0' },
};

const SORT_OPTIONS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'name_az',  label: 'Name A → Z' },
  { value: 'name_za',  label: 'Name Z → A' },
  { value: 'progress', label: 'Progress (high → low)' },
];

const DATA_TYPES = ['image', 'video', 'text', 'audio', 'pointcloud'];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Projects() {
  const navigate = useNavigate();
  const { activeTenant } = useTenantStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('in_progress');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', dataType: 'image', labelSet: '' });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const importRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const PER_PAGE = 12;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/projects');
      setProjects(data);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, activeTenant]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.project-menu')) setOpenMenuId(null);
      if (!(e.target as HTMLElement).closest('.sort-menu')) setShowSortMenu(false);
      if (!(e.target as HTMLElement).closest('.type-menu')) setShowTypeMenu(false);
      if (!(e.target as HTMLElement).closest('.status-menu')) setShowStatusMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyFiltersAndSort = (list: Project[]) => {
    let result = [...list];

    if (search)       result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter) result = result.filter(p => (p.status || 'in_progress') === statusFilter);
    if (typeFilter)   result = result.filter(p => p.dataType === typeFilter);

    switch (sortBy) {
      case 'oldest':   result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'name_az':  result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name_za':  result.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'progress': result.sort((a, b) => (b.progress || 0) - (a.progress || 0)); break;
      default:         result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return result;
  };

  const filtered = applyFiltersAndSort(projects);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const labels = form.labelSet.split(',').map(l => l.trim()).filter(Boolean);
      await client.post('/projects', { name: form.name, description: form.description, dataType: form.dataType, labelSet: labels, organizationId: activeTenant?.id });
      setShowCreate(false);
      setForm({ name: '', description: '', dataType: 'image', labelSet: '' });
      load();
    } catch { /* no-op */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project and all its tasks? This cannot be undone.')) return;
    try {
      await client.delete(`/projects/${id}`);
      setProjects(p => p.filter(x => x.id !== id));
    } catch { /* no-op */ }
    setOpenMenuId(null);
  };

  const handleChangeStatus = async (id: string, status: string) => {
    try {
      await client.patch(`/projects/${id}`, { status });
      setProjects(ps => ps.map(p => p.id === id ? { ...p, status } : p));
    } catch { /* no-op */ }
    setOpenMenuId(null);
  };

  const handleExportDataset = async (id: string, name: string) => {
    setOpenMenuId(null);
    try {
      const res = await client.get(`/import-export/${id}/export?format=json&download=true`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `project-${name}-dataset.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed.'); }
  };

  const handleImportDataset = (id: string) => { setOpenMenuId(null); importRefs.current[id]?.click(); };

  const handleImportFile = async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const text = await files[0].text();
      await client.post(`/import-export/import?projectId=${id}`, JSON.parse(text));
      alert('Dataset imported successfully.');
      load();
    } catch { alert('Import failed. Check the file format.'); }
  };

  const handleBackup = async (id: string, name: string) => {
    setOpenMenuId(null);
    try {
      const [projRes, tasksRes] = await Promise.all([client.get(`/projects/${id}`), client.get(`/tasks?projectId=${id}`)]);
      const backup = { project: projRes.data, tasks: tasksRes.data, exportedAt: new Date().toISOString() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `backup-${name}-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Backup failed.'); }
  };

  const thumbnailColors = ['#1890ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2'];
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort by';

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 260 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search projects..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>

          <div style={{ flex: 1 }} />

          {/* Sort by */}
          <div className="sort-menu" style={{ position: 'relative' }}>
            <button className="btn btn-default btn-sm" onClick={() => setShowSortMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
              {activeSortLabel}
            </button>
            {showSortMenu && (
              <div style={dropdownStyle}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.value} style={dropdownItemStyle(sortBy === o.value)}
                    onClick={() => { setSortBy(o.value); setShowSortMenu(false); setPage(1); }}>
                    {sortBy === o.value && <span style={{ color: '#1890ff', marginRight: 6 }}>✓</span>}{o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick filters — data type */}
          <div className="type-menu" style={{ position: 'relative' }}>
            <button className="btn btn-default btn-sm" onClick={() => setShowTypeMenu(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, ...(typeFilter ? { borderColor: '#1890ff', color: '#1890ff' } : {}) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {typeFilter ? typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1) : 'Quick filters'}
            </button>
            {showTypeMenu && (
              <div style={dropdownStyle}>
                <button style={dropdownItemStyle(typeFilter === '')} onClick={() => { setTypeFilter(''); setShowTypeMenu(false); setPage(1); }}>All types</button>
                {DATA_TYPES.map(t => (
                  <button key={t} style={dropdownItemStyle(typeFilter === t)}
                    onClick={() => { setTypeFilter(t); setShowTypeMenu(false); setPage(1); }}>
                    {typeFilter === t && <span style={{ color: '#1890ff', marginRight: 6 }}>✓</span>}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter — status */}
          <div className="status-menu" style={{ position: 'relative' }}>
            <button className="btn btn-default btn-sm" onClick={() => setShowStatusMenu(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, ...(statusFilter ? { borderColor: STATUS_CONFIG[statusFilter]?.color, color: STATUS_CONFIG[statusFilter]?.color } : {}) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {statusFilter ? STATUS_CONFIG[statusFilter]?.label : 'All statuses'}
            </button>
            {showStatusMenu && (
              <div style={dropdownStyle}>
                <button style={dropdownItemStyle(statusFilter === '')} onClick={() => { setStatusFilter(''); setShowStatusMenu(false); setPage(1); }}>All statuses</button>
                {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                  <button key={val} style={dropdownItemStyle(statusFilter === val)}
                    onClick={() => { setStatusFilter(val); setShowStatusMenu(false); setPage(1); }}>
                    {statusFilter === val && <span style={{ color: '#1890ff', marginRight: 6 }}>✓</span>}
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block', marginRight: 7 }} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ padding: '4px 14px' }}>+ New</button>
        </div>

        {/* Active filter chips */}
        {(statusFilter || typeFilter) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {statusFilter && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 12, background: STATUS_CONFIG[statusFilter]?.bg, color: STATUS_CONFIG[statusFilter]?.color, fontSize: 12, fontWeight: 500 }}>
                {STATUS_CONFIG[statusFilter]?.label}
                <button onClick={() => { setStatusFilter(''); setPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            {typeFilter && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 12, background: '#f0f5ff', color: '#2f54eb', fontSize: 12, fontWeight: 500 }}>
                {typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                <button onClick={() => { setTypeFilter(''); setPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            )}
            <button onClick={() => { setStatusFilter(''); setTypeFilter(''); setPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 12, padding: '2px 6px' }}>Clear all</button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>
            <p>{search || statusFilter || typeFilter ? 'No projects match your filters' : 'No projects yet'}</p>
            <span>
              {(statusFilter || typeFilter) ? (
                <button className="btn btn-default btn-sm" style={{ marginTop: 8 }} onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); }}>Clear filters</button>
              ) : 'Create your first annotation project to get started'}
            </span>
            {!search && !statusFilter && !typeFilter && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>Create Project</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {paginated.map((p, i) => {
              const statusCfg = STATUS_CONFIG[p.status || 'in_progress'] || STATUS_CONFIG.in_progress;
              return (
                <div key={p.id} className="card project-menu"
                  style={{ cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.15s', position: 'relative' }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>

                  <input ref={el => importRefs.current[p.id] = el} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={e => handleImportFile(p.id, e.target.files)} />

                  {/* Thumbnail */}
                  <div style={{ height: 120, background: thumbnailColors[i % thumbnailColors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderRadius: '10px 10px 0 0' }}>
                    {p.tasks?.[0]?.thumbnailUrl ? (
                      <img src={p.tasks[0].thumbnailUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    )}

                    {/* Status badge */}
                    <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 10, background: statusCfg.bg, color: statusCfg.color, fontSize: 11, fontWeight: 600, backdropFilter: 'blur(4px)' }}>
                      {statusCfg.label}
                    </span>

                    {/* ⋮ menu */}
                    <div style={{ position: 'absolute', top: 8, right: 8 }} onClick={e => e.stopPropagation()}>
                      <button style={{ width: 28, height: 28, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}>⋮</button>

                      {openMenuId === p.id && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 190, zIndex: 300, overflow: 'visible' }}>
                          <MenuItem icon="↗" label="Open" onClick={() => { navigate(`/projects/${p.id}`); setOpenMenuId(null); }} />
                          <Divider />
                          <SubMenuItem label="Set status" items={Object.entries(STATUS_CONFIG).map(([val, cfg]) => ({ label: cfg.label, color: cfg.color, active: (p.status || 'in_progress') === val, onClick: () => handleChangeStatus(p.id, val) }))} />
                          <Divider />
                          <MenuItem icon="↓" label="Export dataset" onClick={() => handleExportDataset(p.id, p.name)} />
                          <MenuItem icon="↑" label="Import dataset" onClick={() => handleImportDataset(p.id)} />
                          <MenuItem icon="⊙" label="Backup project" onClick={() => handleBackup(p.id, p.name)} />
                          <Divider />
                          <MenuItem icon="📊" label="View report" onClick={() => { navigate('/reports'); setOpenMenuId(null); }} />
                          <Divider />
                          <MenuItem icon="🗑" label="Delete" onClick={() => handleDelete(p.id)} danger />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                      {p.dataType} · Updated {timeAgo(p.updatedAt)}
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>
                        <span>Progress</span>
                        <span>{p.progress || 0}%</span>
                      </div>
                      <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.progress || 0}%`, background: p.progress >= 100 ? '#52c41a' : '#1890ff', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    {/* Label chips */}
                    {p.labelSet?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {p.labelSet.slice(0, 3).map(l => <span key={l} className="badge badge-blue" style={{ fontSize: 11 }}>{l}</span>)}
                        {p.labelSet.length > 3 && <span className="badge badge-gray" style={{ fontSize: 11 }}>+{p.labelSet.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 }}>
            <button className="btn btn-default btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} className={`btn btn-sm ${n === page ? 'btn-primary' : 'btn-default'}`} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button className="btn btn-default btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Create New Project" onClose={() => setShowCreate(false)}
          footer={<><button className="btn btn-default" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button></>}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label required">Project Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Object Detection Dataset" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description..." rows={3} />
            </div>
            <div className="form-group">
              <label className="form-label required">Data Type</label>
              <select className="input" value={form.dataType} onChange={e => setForm(f => ({ ...f, dataType: e.target.value }))}>
                {DATA_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Labels (comma-separated)</label>
              <input className="input" value={form.labelSet} onChange={e => setForm(f => ({ ...f, labelSet: e.target.value }))} placeholder="car, person, bicycle, ..." />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff',
  border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  minWidth: 180, zIndex: 400, overflow: 'hidden',
};

function dropdownItemStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', width: '100%', padding: '8px 14px',
    border: 'none', background: active ? '#f0f7ff' : 'transparent',
    cursor: 'pointer', fontSize: 13, color: active ? '#1890ff' : '#262626', textAlign: 'left',
  };
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: danger ? '#ff4d4f' : '#262626', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#fff1f0' : '#f5f5f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>
      <span style={{ width: 16, textAlign: 'center', fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  );
}

function SubMenuItem({ label, items }: { label: string; items: { label: string; color: string; active: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#262626' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16, textAlign: 'center' }}>◈</span>{label}</span>
        <span style={{ fontSize: 10, color: '#8c8c8c' }}>▶</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: '100%', top: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 160, zIndex: 500, overflow: 'hidden' }}>
          {items.map(item => (
            <button key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: item.active ? '#f0f7ff' : 'transparent', cursor: 'pointer', fontSize: 13, color: item.active ? '#1890ff' : '#262626' }}
              onMouseEnter={e => { if (!item.active) e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { if (!item.active) e.currentTarget.style.background = 'transparent'; }}
              onClick={item.onClick}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              {item.label}
              {item.active && <span style={{ marginLeft: 'auto', color: '#1890ff' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />;
}
