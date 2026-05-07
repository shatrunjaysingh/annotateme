import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import { useTenantStore } from '../store/tenantStore';

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
    } catch { /* no-op */ }
    finally { setLoading(false); }
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
    } catch { alert('Export failed.'); }
  };

  const handleDelete = async (jobId: string) => {
    setOpenMenuId(null);
    if (!confirm('Delete this job and its annotations?')) return;
    try { await client.delete(`/jobs/${jobId}`); setJobs(prev => prev.filter(j => j.id !== jobId)); }
    catch { alert('Delete failed.'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 260 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-default btn-sm">Select all</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-default btn-sm">Sort by</button>
          <button className="btn btn-default btn-sm">Quick filters ▾</button>
          <select className="input" style={{ width: 140 }} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All stages</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
          </select>
          <select className="input" style={{ width: 140 }} value={filterState} onChange={e => setFilterState(e.target.value)}>
            <option value="">All states</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            <p>No jobs found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {filtered.map((job, i) => (
              <div key={job.id} className="card job-card-menu"
                style={{ cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative' }}
                onClick={() => navigate(`/jobs/${job.id}/annotate`)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = ''}>

                {/* Thumbnail */}
                <div style={{ height: 120, background: '#1a1a1a', position: 'relative', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
                  {job.task?.thumbnailUrl ? (
                    <img src={job.task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>ID: {i + 1}</div>
                  <div style={{ position: 'absolute', top: 6, right: 40 }}>
                    <span className={`badge ${STAGE_COLORS[job.stage]}`} style={{ fontSize: 10 }}>{job.stage}</span>
                  </div>

                  {/* ⋮ menu button on thumbnail */}
                  <div style={{ position: 'absolute', top: 4, right: 4 }} onClick={e => e.stopPropagation()}>
                    <button
                      style={{ width: 26, height: 26, borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => setOpenMenuId(openMenuId === job.id ? null : job.id)}>
                      ⋮
                    </button>

                    {openMenuId === job.id && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 190, zIndex: 300, overflow: 'hidden' }}>
                        <JobMenuItem label="Open in editor" icon="↗" onClick={() => { navigate(`/jobs/${job.id}/annotate`); setOpenMenuId(null); }} />
                        <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />
                        <JobMenuItem label="Export annotations" icon="↓" onClick={() => handleExport(job.id)} />
                        <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />
                        <JobMenuItem label="View report" icon="📊" onClick={() => { navigate('/reports'); setOpenMenuId(null); }} />
                        <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />
                        <JobMenuItem label="Delete job" icon="🗑" onClick={() => handleDelete(job.id)} danger />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                    {job.task?.project?.name && <span style={{ fontWeight: 600 }}>{job.task.project.name} › </span>}
                    {job.task?.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span className={`badge ${STATE_COLORS[job.state]}`} style={{ fontSize: 11 }}>{job.state.replace('_', ' ')}</span>
                    <span style={{ fontSize: 11, color: '#8c8c8c' }}>{timeAgo(job.updatedAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    Frames: {job.frameEnd - job.frameStart + 1} · Range: {job.frameStart}–{job.frameEnd}
                  </div>
                  {job.assignee && (
                    <div style={{ fontSize: 12, color: '#595959', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
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

function JobMenuItem({ label, onClick, danger, icon }: { label: string; onClick: () => void; danger?: boolean; icon?: string }) {
  return (
    <button
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: danger ? '#ff4d4f' : '#262626', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#fff1f0' : '#f5f5f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>
      {icon && <span style={{ width: 15, textAlign: 'center' }}>{icon}</span>}
      {label}
    </button>
  );
}
