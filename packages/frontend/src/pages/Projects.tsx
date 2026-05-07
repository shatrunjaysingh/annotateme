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

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

const DATA_TYPES = ['image', 'video', 'text', 'audio', 'pointcloud'];

export default function Projects() {
  const navigate = useNavigate();
  const { activeTenant } = useTenantStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.project-menu')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
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

  const handleExportDataset = async (id: string, name: string) => {
    setOpenMenuId(null);
    try {
      const res = await client.get(`/import-export/export?projectId=${id}&format=json`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `project-${name}-dataset.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed. The server may not support this format yet.'); }
  };

  const handleImportDataset = (id: string) => {
    setOpenMenuId(null);
    importRefs.current[id]?.click();
  };

  const handleImportFile = async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await client.post(`/import-export/import?projectId=${id}`, data);
      alert('Dataset imported successfully.');
      load();
    } catch { alert('Import failed. Check the file format.'); }
  };

  const handleBackup = async (id: string, name: string) => {
    setOpenMenuId(null);
    try {
      const [projRes, tasksRes] = await Promise.all([
        client.get(`/projects/${id}`),
        client.get(`/tasks?projectId=${id}`),
      ]);
      const backup = { project: projRes.data, tasks: tasksRes.data, exportedAt: new Date().toISOString() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `backup-${name}-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Backup failed.'); }
  };

  const thumbnailColors = ['#1890ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2'];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div className="search-bar" style={{ width: 260 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search projects..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <button className="btn btn-default btn-sm">Select all</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-default btn-sm">Sort by</button>
          <button className="btn btn-default btn-sm">Quick filters ▾</button>
          <button className="btn btn-default btn-sm">Filter ▾</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ padding: '4px 14px' }}>+</button>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>
            <p>{search ? 'No projects match your search' : 'No projects yet'}</p>
            <span>Create your first annotation project to get started</span>
            {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>Create Project</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {paginated.map((p, i) => (
              <div key={p.id} className="card project-menu" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.15s', position: 'relative' }}
                onClick={() => navigate(`/projects/${p.id}`)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>

                {/* Hidden import input per project */}
                <input ref={el => importRefs.current[p.id] = el} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={e => handleImportFile(p.id, e.target.files)} />

                {/* Thumbnail */}
                <div style={{ height: 140, background: thumbnailColors[i % thumbnailColors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderRadius: '10px 10px 0 0' }}>
                  {p.tasks?.[0]?.thumbnailUrl ? (
                    <img src={p.tasks[0].thumbnailUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  )}

                  {/* ⋮ menu trigger */}
                  <div style={{ position: 'absolute', top: 8, right: 8 }} onClick={e => e.stopPropagation()}>
                    <button
                      style={{ width: 28, height: 28, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}>
                      ⋮
                    </button>

                    {openMenuId === p.id && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 190, zIndex: 300, overflow: 'hidden' }}>
                        <MenuItem icon="↗" label="Open" onClick={() => { navigate(`/projects/${p.id}`); setOpenMenuId(null); }} />
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
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>Created · {p.dataType}</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>Last updated {timeAgo(p.updatedAt)}</div>
                  {p.labelSet?.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.labelSet.slice(0, 3).map(l => <span key={l} className="badge badge-blue" style={{ fontSize: 11 }}>{l}</span>)}
                      {p.labelSet.length > 3 && <span className="badge badge-gray" style={{ fontSize: 11 }}>+{p.labelSet.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
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
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>{PER_PAGE} / page</span>
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

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: danger ? '#ff4d4f' : '#262626', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#fff1f0' : '#f5f5f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>
      <span style={{ width: 16, textAlign: 'center', fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />;
}
