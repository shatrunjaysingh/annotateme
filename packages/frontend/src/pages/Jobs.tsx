import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import { useTenantStore } from '../store/tenantStore';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

interface Job {
  id: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  assignee?: { id: string; username: string };
  task?: { id: string; name: string; thumbnailUrl?: string; project?: { id: string; name: string } };
  createdAt: string;
  updatedAt: string;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATE_COLORS: Record<string, string> = { new: 'badge-gray', in_progress: 'badge-blue', completed: 'badge-green', rejected: 'badge-red' };
const STAGE_COLORS: Record<string, string> = { annotation: 'badge-blue', validation: 'badge-orange', acceptance: 'badge-green' };

export default function Jobs() {
  const navigate = useNavigate();
  const { activeTenant } = useTenantStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: tasks } = await client.get('/tasks');
      const allJobs: Job[] = [];
      for (const task of tasks) {
        const { data: taskJobs } = await client.get(`/tasks/${task.id}/jobs`);
        taskJobs.forEach((j: Job) => allJobs.push({ ...j, task }));
      }
      setJobs(allJobs);
    } catch {
      toast.error('Failed to load jobs', 'Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, activeTenant]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.job-card-menu')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.task?.name?.toLowerCase().includes(search.toLowerCase()) || j.task?.project?.name?.toLowerCase().includes(search.toLowerCase());
    const matchState = !filterState || j.state === filterState;
    const matchStage = !filterStage || j.stage === filterStage;
    return matchSearch && matchState && matchStage;
  });

  const handleExport = async (jobId: string) => {
    setOpenMenuId(null);
    try {
      const res = await client.get(`/jobs/${jobId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `job-${jobId}-annotations.json`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed', 'Could not export annotations.');
    }
  };

  const handleDelete = async (jobId: string) => {
    setOpenMenuId(null);
    const ok = await confirm({
      title: 'Delete this job?',
      message: 'This job and all its annotations will be permanently deleted.',
      confirmLabel: 'Delete job',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await client.delete(`/jobs/${jobId}`);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      toast.success('Job deleted');
    } catch {
      toast.error('Delete failed', 'The job could not be deleted.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <div className="page-header">
        <div>
          <h1>Jobs</h1>
          {!loading && <p>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>}
        </div>
      </div>
      <div className="page-content">

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 280 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search by task or project…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
          <select className="input" style={{ width: 150 }} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All stages</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
          </select>
          <select className="input" style={{ width: 150 }} value={filterState} onChange={e => setFilterState(e.target.value)}>
            <option value="">All states</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card" style={{ overflow: 'hidden' }}>
                <div className="skeleton" style={{ height: 120, borderRadius: '12px 12px 0 0' }} />
                <div style={{ padding: '12px 14px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                  <div className="skeleton skeleton-text" style={{ width: '80%' }} />
                  <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </div>
            <h3>No jobs found</h3>
            <p>{search || filterState || filterStage ? 'Try adjusting your filters.' : 'Jobs appear here when tasks are created in a project.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {filtered.map((job) => (
              <div key={job.id} className="card card-hover job-card-menu"
                style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative', zIndex: openMenuId === job.id ? 500 : 1 }}
                onClick={() => navigate(`/jobs/${job.id}/annotate`)}>

                {/* Thumbnail */}
                <div style={{ height: 120, background: '#1E293B', position: 'relative', overflow: 'hidden' }}>
                  {job.task?.thumbnailUrl ? (
                    <img src={job.task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8 }}>
                    <span className={`badge ${STAGE_COLORS[job.stage]}`} style={{ fontSize: 10 }}>{job.stage}</span>

                    <div onClick={e => e.stopPropagation()}>
                      <button
                        style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                        onClick={() => setOpenMenuId(openMenuId === job.id ? null : job.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                      </button>

                      {openMenuId === job.id && (
                        <div style={{ position: 'absolute', top: 40, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', minWidth: 190, zIndex: 300, overflow: 'hidden' }}>
                          <button className="dropdown-item" onClick={() => { navigate(`/jobs/${job.id}/annotate`); setOpenMenuId(null); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Open in editor
                          </button>
                          <div className="dropdown-divider" />
                          <button className="dropdown-item" onClick={() => handleExport(job.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Export annotations
                          </button>
                          <div className="dropdown-divider" />
                          <button className="dropdown-item danger" onClick={() => handleDelete(job.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                            Delete job
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {job.task?.project?.name && <span style={{ fontWeight: 600, color: 'var(--text)' }}>{job.task.project.name} › </span>}
                    {job.task?.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className={`badge ${STATE_COLORS[job.state]}`} style={{ fontSize: 11 }}>{job.state.replace('_', ' ')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{timeAgo(job.updatedAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {job.frameEnd - job.frameStart + 1} frames · {job.frameStart}–{job.frameEnd}
                  </div>
                  {job.assignee && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      {job.assignee.username}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
