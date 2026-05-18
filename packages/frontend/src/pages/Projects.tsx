import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import { useTenantStore } from '../store/tenantStore';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

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

const STATUS_CONFIG: Record<string, { label: string; cssClass: string; dot: string }> = {
  in_progress: { label: 'In Progress', cssClass: 'badge-blue', dot: 'var(--primary)' },
  completed:   { label: 'Completed',   cssClass: 'badge-green', dot: 'var(--success)' },
  rejected:    { label: 'Rejected',    cssClass: 'badge-red',   dot: 'var(--danger)' },
};

const SORT_OPTIONS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'name_az',  label: 'Name A → Z' },
  { value: 'name_za',  label: 'Name Z → A' },
  { value: 'progress', label: 'Progress (high → low)' },
];

const DATA_TYPES = ['image', 'video', 'text', 'audio', 'pointcloud'];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  image: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  video: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  text:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  audio: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  pointcloud: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg>,
};

const THUMBNAIL_GRADIENTS = [
  'linear-gradient(135deg, #1D4ED8 0%, #7C3AED 100%)',
  'linear-gradient(135deg, #059669 0%, #0284C7 100%)',
  'linear-gradient(135deg, #D97706 0%, #DC2626 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
  'linear-gradient(135deg, #0284C7 0%, #059669 100%)',
  'linear-gradient(135deg, #DC2626 0%, #D97706 100%)',
];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SkeletonCard() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: 120, borderRadius: '12px 12px 0 0' }} />
      <div style={{ padding: '14px 16px' }}>
        <div className="skeleton skeleton-title" style={{ width: '70%' }} />
        <div className="skeleton skeleton-text" style={{ width: '50%' }} />
        <div className="skeleton" style={{ height: 6, borderRadius: 4, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="skeleton" style={{ width: 48, height: 20, borderRadius: 10 }} />
          <div className="skeleton" style={{ width: 48, height: 20, borderRadius: 10 }} />
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const { activeTenant, tenants, setTenants } = useTenantStore();
  const toast = useToast();
  const confirm = useConfirm();

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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [form, setForm] = useState({ name: '', description: '', dataType: 'image', labelSet: '', organizationId: '' });
  const [saving, setSaving] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string } | null>(null);
  const [exportFormat, setExportFormat] = useState<'coco' | 'yolo' | 'pascal_voc'>('coco');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const importRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const PER_PAGE = 12;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/projects');
      setProjects(data);
    } catch {
      toast.error('Failed to load projects', 'Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, activeTenant]);

  // Ensure tenants are loaded for the create-project dropdown
  useEffect(() => {
    if (tenants.length > 0) return;
    client.get('/tenants')
      .then(({ data }) => { if (Array.isArray(data)) setTenants(data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))); })
      .catch(() => {});
  }, [tenants.length, setTenants]);

  const closeMenu = () => { setOpenMenuId(null); setMenuPos(null); };
  const openMenu = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (openMenuId === projectId) { closeMenu(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpenMenuId(projectId);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.project-menu')) closeMenu();
      if (!(e.target as HTMLElement).closest('.sort-menu')) setShowSortMenu(false);
      if (!(e.target as HTMLElement).closest('.type-menu')) setShowTypeMenu(false);
      if (!(e.target as HTMLElement).closest('.status-menu')) setShowStatusMenu(false);
    };
    const onScroll = () => closeMenu();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenuId]);

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
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const labels = form.labelSet.split(',').map(l => l.trim()).filter(Boolean);
      await client.post('/projects', {
        name: form.name.trim(),
        description: form.description,
        dataType: form.dataType,
        labelSet: labels,
        organizationId: form.organizationId || undefined,
      });
      setShowCreate(false);
      setForm({ name: '', description: '', dataType: 'image', labelSet: '', organizationId: '' });
      toast.success('Project created', `"${form.name.trim()}" is ready.`);
      load();
    } catch {
      toast.error('Failed to create project', 'Please try again.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    closeMenu();
    const ok = await confirm({
      title: 'Delete project?',
      message: `"${name}" and all its tasks, jobs, and annotations will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete project',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await client.delete(`/projects/${id}`);
      setProjects(p => p.filter(x => x.id !== id));
      toast.success('Project deleted', `"${name}" has been removed.`);
    } catch {
      toast.error('Delete failed', 'The project could not be deleted. Try again.');
    }
  };

  const handleChangeStatus = async (id: string, status: string) => {
    closeMenu();
    try {
      await client.patch(`/projects/${id}`, { status });
      setProjects(ps => ps.map(p => p.id === id ? { ...p, status } : p));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDownloadAnnotations = async (id: string, name: string) => {
    closeMenu();
    try {
      const res = await client.get(`/import-export/${id}/annotations/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${name}-annotations.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Annotations downloaded');
    } catch (err: any) {
      let msg = 'Could not export annotations.';
      try {
        const text = await err?.response?.data?.text?.();
        const parsed = text ? JSON.parse(text) : null;
        if (parsed?.error) msg = parsed.error;
      } catch { /* ignore */ }
      toast.error('Download failed', msg);
    }
  };

  const handleOpenExportModal = (id: string, name: string) => {
    closeMenu();
    setExportFormat('coco');
    setExportTarget({ id, name });
  };

  const handleExportForTraining = async () => {
    if (!exportTarget) return;
    setExporting(true);
    try {
      const res = await client.get(`/import-export/${exportTarget.id}/export?format=${exportFormat}&download=true`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportTarget.name}-${exportFormat}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportTarget(null);
      toast.success('Export downloaded', `${exportFormat.toUpperCase()} format ready.`);
    } catch {
      toast.error('Export failed', 'Could not export in this format.');
    } finally { setExporting(false); }
  };

  const handleImportDataset = (id: string) => { closeMenu(); importRefs.current[id]?.click(); };

  const handleImportFile = async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const text = await files[0].text();
      await client.post(`/import-export/import?projectId=${id}`, JSON.parse(text));
      toast.success('Dataset imported', 'All annotations have been imported.');
      load();
    } catch {
      toast.error('Import failed', 'Check the file format and try again.');
    }
  };

  const handleBackup = async (id: string, name: string) => {
    closeMenu();
    try {
      const [projRes, tasksRes] = await Promise.all([client.get(`/projects/${id}`), client.get(`/tasks?projectId=${id}`)]);
      const backup = { project: projRes.data, tasks: tasksRes.data, exportedAt: new Date().toISOString() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `backup-${name}-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Backup failed', 'Could not create the project backup.');
    }
  };

  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort by';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          {!loading && <p>{filtered.length} project{filtered.length !== 1 ? 's' : ''}{statusFilter || typeFilter || search ? ' matching filters' : ''}</p>}
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(f => ({ ...f, organizationId: activeTenant?.id || '' })); setShowCreate(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </button>
      </div>

      <div className="page-content">
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 280 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search projects…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Sort */}
          <div className="sort-menu dropdown">
            <button className="btn btn-default btn-sm" onClick={() => setShowSortMenu(v => !v)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
              {activeSortLabel}
            </button>
            {showSortMenu && (
              <div className="dropdown-menu" style={{ minWidth: 200 }}>
                {SORT_OPTIONS.map(o => (
                  <button key={o.value} className="dropdown-item"
                    style={sortBy === o.value ? { background: 'var(--primary-light)', color: 'var(--primary)' } : {}}
                    onClick={() => { setSortBy(o.value); setShowSortMenu(false); setPage(1); }}>
                    {sortBy === o.value && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type filter */}
          <div className="type-menu dropdown">
            <button className="btn btn-default btn-sm" onClick={() => setShowTypeMenu(v => !v)}
              style={typeFilter ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' } : {}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {typeFilter ? typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1) : 'Type'}
            </button>
            {showTypeMenu && (
              <div className="dropdown-menu" style={{ minWidth: 160 }}>
                <button className="dropdown-item" style={!typeFilter ? { background: 'var(--primary-light)', color: 'var(--primary)' } : {}}
                  onClick={() => { setTypeFilter(''); setShowTypeMenu(false); setPage(1); }}>All types</button>
                <div className="dropdown-divider" />
                {DATA_TYPES.map(t => (
                  <button key={t} className="dropdown-item"
                    style={typeFilter === t ? { background: 'var(--primary-light)', color: 'var(--primary)' } : {}}
                    onClick={() => { setTypeFilter(t); setShowTypeMenu(false); setPage(1); }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status filter */}
          <div className="status-menu dropdown">
            <button className="btn btn-default btn-sm" onClick={() => setShowStatusMenu(v => !v)}
              style={statusFilter ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' } : {}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {statusFilter ? STATUS_CONFIG[statusFilter]?.label : 'Status'}
            </button>
            {showStatusMenu && (
              <div className="dropdown-menu" style={{ minWidth: 180 }}>
                <button className="dropdown-item" style={!statusFilter ? { background: 'var(--primary-light)', color: 'var(--primary)' } : {}}
                  onClick={() => { setStatusFilter(''); setShowStatusMenu(false); setPage(1); }}>All statuses</button>
                <div className="dropdown-divider" />
                {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                  <button key={val} className="dropdown-item"
                    style={statusFilter === val ? { background: 'var(--primary-light)', color: 'var(--primary)' } : {}}
                    onClick={() => { setStatusFilter(val); setShowStatusMenu(false); setPage(1); }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {(statusFilter || typeFilter || search) && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>Filters:</span>
            {search && (
              <FilterChip label={`"${search}"`} onRemove={() => { setSearch(''); setPage(1); }} />
            )}
            {statusFilter && (
              <FilterChip label={STATUS_CONFIG[statusFilter]?.label} onRemove={() => { setStatusFilter(''); setPage(1); }} />
            )}
            {typeFilter && (
              <FilterChip label={typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)} onRemove={() => { setTypeFilter(''); setPage(1); }} />
            )}
            <button onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); setPage(1); }}
              style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', textDecoration: 'underline' }}>
              Clear all
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>
            </div>
            <h3>{search || statusFilter || typeFilter ? 'No projects match your filters' : 'No projects yet'}</h3>
            <p>{search || statusFilter || typeFilter ? 'Try adjusting your search or filter criteria.' : 'Create your first annotation project to get started.'}</p>
            <div className="empty-actions">
              {(search || statusFilter || typeFilter) && (
                <button className="btn btn-default" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); setPage(1); }}>
                  Clear filters
                </button>
              )}
              {!search && !statusFilter && !typeFilter && (
                <button className="btn btn-primary" onClick={() => { setForm(f => ({ ...f, organizationId: activeTenant?.id || '' })); setShowCreate(true); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Create Project
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {paginated.map((p, i) => {
              const statusCfg = STATUS_CONFIG[p.status || 'in_progress'] || STATUS_CONFIG.in_progress;
              const pct = Math.min(100, Math.max(0, p.progress || 0));
              const progressClass = pct >= 100 ? 'success' : pct >= 50 ? '' : '';
              return (
                <div key={p.id} className="card card-hover project-menu"
                  style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
                  onClick={() => navigate(`/projects/${p.id}`)}>

                  <input ref={el => importRefs.current[p.id] = el} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={e => handleImportFile(p.id, e.target.files)} />

                  {/* Thumbnail */}
                  <div style={{ height: 128, background: THUMBNAIL_GRADIENTS[i % THUMBNAIL_GRADIENTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
                    {p.tasks?.[0]?.thumbnailUrl ? (
                      <img src={p.tasks[0].thumbnailUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ color: 'rgba(255,255,255,0.35)' }}>{TYPE_ICONS[p.dataType] || TYPE_ICONS.image}</div>
                    )}
                    {/* Status badge only — menu button moved outside overflow:hidden */}
                    <div style={{ position: 'absolute', top: 10, left: 10 }}>
                      <span style={{ padding: '3px 9px', borderRadius: 20, background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(4px)', letterSpacing: 0.3 }}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Three-dot button — outside thumbnail so no overflow/transform clipping */}
                  <div className="project-menu" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }} onClick={e => e.stopPropagation()}>
                    <button
                      style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                      onClick={e => openMenu(e, p.id)}
                      aria-label="Project options">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '14px 16px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ textTransform: 'capitalize' }}>{p.dataType}</span>
                      <span style={{ width: 3, height: 3, background: 'var(--gray-300)', borderRadius: '50%' }} />
                      <span>Updated {timeAgo(p.updatedAt)}</span>
                    </div>

                    {/* Progress */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Progress</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? 'var(--success)' : 'var(--text)' }}>{pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-fill ${progressClass}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Labels */}
                    {p.labelSet?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {p.labelSet.slice(0, 4).map(l => (
                          <span key={l} style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--gray-100)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}>{l}</span>
                        ))}
                        {p.labelSet.length > 4 && (
                          <span style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>+{p.labelSet.length - 4}</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-disabled)', fontStyle: 'italic' }}>No labels defined</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 32 }}>
            <button className="btn btn-default btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 8px' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-default btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
          </div>
        )}
      </div>

      {/* Fixed-position project menu — outside all card stacking contexts */}
      {openMenuId && menuPos && (() => {
        const p = projects.find(proj => proj.id === openMenuId);
        if (!p) return null;
        return (
          <div className="project-menu" style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', minWidth: 210, zIndex: 9999, overflow: 'hidden' }}>
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>} label="Open project" onClick={() => { navigate(`/projects/${p.id}`); closeMenu(); }} />
            <div className="dropdown-divider" />
            <CardSubMenuItem label="Set status" items={Object.entries(STATUS_CONFIG).map(([val, cfg]) => ({ label: cfg.label, active: (p.status || 'in_progress') === val, onClick: () => handleChangeStatus(p.id, val) }))} />
            <div className="dropdown-divider" />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} label="Download annotations" onClick={() => handleDownloadAnnotations(p.id, p.name)} />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} label="Export for training…" onClick={() => handleOpenExportModal(p.id, p.name)} />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} label="Import dataset" onClick={() => handleImportDataset(p.id)} />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} label="Backup project" onClick={() => handleBackup(p.id, p.name)} />
            <div className="dropdown-divider" />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} label="View analytics" onClick={() => { navigate('/analytics'); closeMenu(); }} />
            <div className="dropdown-divider" />
            <CardMenuItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>} label="Delete project" onClick={() => handleDelete(p.id, p.name)} danger />
          </div>
        );
      })()}

      {/* Export for Training Modal */}
      {exportTarget && (
        <Modal
          title="Export for Training"
          onClose={() => setExportTarget(null)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setExportTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExportForTraining} disabled={exporting}>
                {exporting ? <><span className="spinner spinner-sm" /> Exporting…</> : 'Download'}
              </button>
            </>
          }>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Choose the format your ML framework expects. The file will download immediately.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { value: 'coco',       label: 'COCO JSON',  desc: 'Detectron2, MMDetection, COCO API' },
              { value: 'yolo',       label: 'YOLO',       desc: 'Ultralytics YOLOv5/v8, Darknet' },
              { value: 'pascal_voc', label: 'Pascal VOC', desc: 'Older pipelines, LabelImg' },
            ] as const).map(opt => (
              <label key={opt.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 8, border: `2px solid ${exportFormat === opt.value ? '#2563eb' : '#e5e7eb'}`,
                background: exportFormat === opt.value ? '#eff6ff' : '#fff',
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}>
                <input
                  type="radio"
                  name="export-format"
                  value={opt.value}
                  checked={exportFormat === opt.value}
                  onChange={() => setExportFormat(opt.value)}
                  style={{ marginTop: 2, accentColor: '#2563eb' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal
          title="Create New Project"
          onClose={() => { setShowCreate(false); setForm({ name: '', description: '', dataType: 'image', labelSet: '', organizationId: '' }); }}
          footer={
            <>
              <button className="btn btn-default" onClick={() => { setShowCreate(false); setForm({ name: '', description: '', dataType: 'image', labelSet: '', organizationId: '' }); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.name.trim()}>
                {saving ? <><span className="spinner spinner-sm" /> Creating…</> : 'Create Project'}
              </button>
            </>
          }>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label required">Project Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Object Detection Dataset" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional project description…" rows={3} />
            </div>
            <div className="form-group">
              <label className="form-label required">Data Type</label>
              <select className="input" value={form.dataType} onChange={e => setForm(f => ({ ...f, dataType: e.target.value }))}>
                {DATA_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tenant (Organisation)</label>
              <select className="input" value={form.organizationId} onChange={e => setForm(f => ({ ...f, organizationId: e.target.value }))}>
                <option value="">— No tenant —</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="form-hint">Assign this project to a tenant to control who can see it.</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Initial Labels</label>
              <input className="input" value={form.labelSet} onChange={e => setForm(f => ({ ...f, labelSet: e.target.value }))} placeholder="car, person, bicycle, …" />
              <p className="form-hint">Comma-separated. You can add more labels later.</p>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Small helper components ────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </span>
  );
}

function CardMenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`dropdown-item${danger ? ' danger' : ''}`}
      onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function CardSubMenuItem({ label, items }: { label: string; items: { label: string; active: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="dropdown-item" style={{ justifyContent: 'space-between' }} onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {label}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {open && items.map(item => (
        <button key={item.label} className="dropdown-item"
          style={{ paddingLeft: 32, ...(item.active ? { background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 } : {}) }}
          onClick={item.onClick}>
          {item.active
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            : <span style={{ width: 12, display: 'inline-block' }} />}
          {item.label}
        </button>
      ))}
    </>
  );
}
