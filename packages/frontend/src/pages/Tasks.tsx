import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import { useTenantStore } from '../store/tenantStore';
import { useToast } from '../components/Toast';

interface Task {
  id: string;
  name: string;
  status: string;
  subset: string;
  frameCount: number;
  annotatedFrames: number;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  assigneeId?: string;
  assignee?: { id: string; username: string };
  jobs?: { id: string; state: string; stage: string }[];
  project?: { id: string; name: string };
}

const STATUS_COLORS: Record<string, string> = {
  annotation: 'badge-blue',
  validation: 'badge-orange',
  acceptance: 'badge-orange',
  completed: 'badge-green',
};

const SUBSET_COLORS: Record<string, string> = {
  Train: '#1890ff',
  Validation: '#722ed1',
  Test: '#13c2c2',
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Tasks() {
  const navigate = useNavigate();
  const { activeTenant } = useTenantStore();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSubset, setFilterSubset] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('table');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/tasks');
      setTasks(data);
    } catch {
      toast.error('Failed to load tasks', 'Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, activeTenant]);

  const filtered = tasks.filter(t => {
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.project?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchSubset = !filterSubset || t.subset === filterSubset;
    return matchSearch && matchStatus && matchSubset;
  });

  const openAnnotate = (task: Task) => {
    const firstJob = task.jobs?.[0];
    if (firstJob) navigate(`/jobs/${firstJob.id}/annotate`);
    else navigate(`/projects/${task.projectId}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <div className="page-header">
        <div>
          <h1>Tasks</h1>
          {!loading && <p>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</p>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['table', 'grid'] as const).map(v => (
            <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-default'}`} onClick={() => setView(v)}>
              {v === 'table' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="page-content">
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 280 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search tasks or projects…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" style={{ width: 155 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
            <option value="completed">Completed</option>
          </select>
          <select className="input" style={{ width: 135 }} value={filterSubset} onChange={e => setFilterSubset(e.target.value)}>
            <option value="">All subsets</option>
            <option value="Train">Train</option>
            <option value="Validation">Validation</option>
            <option value="Test">Test</option>
          </select>
        </div>

        {loading ? (
          <div className="table-wrap">
            <table>
              <thead><tr>{['', 'Name', 'Project', 'Status', 'Frames', 'Progress', 'Updated'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 4, width: j === 0 ? 48 : j === 4 ? 80 : '80%' }} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
            </div>
            <h3>No tasks found</h3>
            <p>{search || filterStatus || filterSubset ? 'Try adjusting your filters.' : 'Tasks are created within projects.'}</p>
          </div>
        ) : view === 'table' ? (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['#', 'Thumbnail', 'Task Name', 'Project', 'Subset', 'Status', 'Frames', 'Progress', 'Jobs', 'Updated', 'Actions'].map(h => <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, i) => {
                  const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
                  const firstJob = task.jobs?.[0];
                  return (
                    <tr key={task.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '6px 16px' }}>
                        <div style={{ width: 64, height: 38, borderRadius: 6, overflow: 'hidden', background: '#1E293B', flexShrink: 0 }}>
                          {task.thumbnailUrl ? (
                            <img src={task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 14, textAlign: 'left', padding: 0 }}
                          onClick={() => navigate(`/projects/${task.projectId}`)}>
                          {task.name}
                        </button>
                      </td>
                      <td>
                        {task.project?.name ? (
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, padding: 0 }}
                            onClick={() => navigate(`/projects/${task.projectId}`)}>
                            {task.project.name}
                          </button>
                        ) : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: `${SUBSET_COLORS[task.subset] || 'var(--gray-400)'}18`, color: SUBSET_COLORS[task.subset] || 'var(--text-secondary)' }}>
                          {task.subset}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{task.annotatedFrames}/{task.frameCount}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                          <div className="progress-bar" style={{ flex: 1 }}>
                            <div className={`progress-fill ${pct >= 100 ? 'success' : ''}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{task.jobs?.length ?? 0}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(task.updatedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {firstJob && (
                            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/jobs/${firstJob.id}/annotate`)}>
                              Annotate
                            </button>
                          )}
                          <button className="btn btn-default btn-sm" onClick={() => navigate(`/projects/${task.projectId}`)}>
                            Detail
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // Grid view
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {filtered.map(task => {
              const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
              const firstJob = task.jobs?.[0];
              return (
                <div key={task.id} className="card card-hover" style={{ overflow: 'hidden' }}>
                  <div style={{ height: 110, background: '#1E293B', position: 'relative', overflow: 'hidden' }}>
                    {task.thumbnailUrl ? (
                      <img src={task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${SUBSET_COLORS[task.subset] || '#475569'}bb`, color: '#fff' }}>{task.subset}</span>
                    </div>
                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{task.status}</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: 'var(--text)' }}>{task.name}</div>
                    {task.project?.name && (
                      <div style={{ fontSize: 12, color: 'var(--primary)', marginBottom: 10, cursor: 'pointer' }} onClick={() => navigate(`/projects/${task.projectId}`)}>
                        {task.project.name}
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>
                        <span>{task.annotatedFrames}/{task.frameCount} frames</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-fill ${pct >= 100 ? 'success' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {firstJob && (
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => navigate(`/jobs/${firstJob.id}/annotate`)}>
                          Annotate
                        </button>
                      )}
                      <button className="btn btn-default btn-sm" style={{ flex: 1 }} onClick={() => navigate(`/projects/${task.projectId}`)}>
                        Detail
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
