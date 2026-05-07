import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import { useTenantStore } from '../store/tenantStore';

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
    } catch { /* no-op */ }
    finally { setLoading(false); }
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
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 280 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search tasks or projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
            <option value="completed">Completed</option>
          </select>
          <select className="input" style={{ width: 130 }} value={filterSubset} onChange={e => setFilterSubset(e.target.value)}>
            <option value="">All subsets</option>
            <option value="Train">Train</option>
            <option value="Validation">Validation</option>
            <option value="Test">Test</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['table', 'grid'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: view === v ? '#1890ff' : '#fff', color: view === v ? '#fff' : '#595959', cursor: 'pointer', fontSize: 13 }}>
                {v === 'table' ? '☰' : '⊞'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
            <p>No tasks found</p>
          </div>
        ) : view === 'table' ? (
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0', background: '#fafafa' }}>
                  {['#', 'Thumbnail', 'Task Name', 'Project', 'Subset', 'Status', 'Frames', 'Progress', 'Jobs', 'Updated', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#8c8c8c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, i) => {
                  const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
                  const firstJob = task.jobs?.[0];
                  return (
                    <tr key={task.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td style={{ padding: '10px 12px', color: '#8c8c8c', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '6px 12px' }}>
                        <div style={{ width: 60, height: 36, borderRadius: 4, overflow: 'hidden', background: '#1a1a1a', flexShrink: 0 }}>
                          {task.thumbnailUrl ? (
                            <img src={task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#262626', fontWeight: 600, fontSize: 14, textAlign: 'left', padding: 0 }}
                          onClick={() => navigate(`/projects/${task.projectId}`)}>
                          {task.name}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#595959' }}>
                        {task.project?.name ? (
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1890ff', fontSize: 13, padding: 0 }}
                            onClick={() => navigate(`/projects/${task.projectId}`)}>
                            {task.project.name}
                          </button>
                        ) : <span style={{ color: '#bfbfbf' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: `${SUBSET_COLORS[task.subset] || '#8c8c8c'}18`, color: SUBSET_COLORS[task.subset] || '#8c8c8c' }}>
                          {task.subset}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#595959' }}>
                        {task.annotatedFrames}/{task.frameCount}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 60, background: '#f0f0f0', borderRadius: 4, height: 6 }}>
                            <div style={{ width: `${pct}%`, background: pct === 100 ? '#52c41a' : '#1890ff', height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#8c8c8c', minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#595959', fontSize: 13 }}>{task.jobs?.length ?? 0}</td>
                      <td style={{ padding: '10px 12px', color: '#8c8c8c', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(task.updatedAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(task => {
              const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
              const firstJob = task.jobs?.[0];
              return (
                <div key={task.id} className="card" style={{ cursor: 'default' }}>
                  <div style={{ height: 110, background: '#1a1a1a', position: 'relative', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
                    {task.thumbnailUrl ? (
                      <img src={task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 6, left: 6 }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${SUBSET_COLORS[task.subset] || '#8c8c8c'}cc`, color: '#fff' }}>{task.subset}</span>
                    </div>
                    <div style={{ position: 'absolute', top: 6, right: 6 }}>
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{task.status}</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: '#262626' }}>{task.name}</div>
                    {task.project?.name && (
                      <div style={{ fontSize: 12, color: '#1890ff', marginBottom: 8, cursor: 'pointer' }} onClick={() => navigate(`/projects/${task.projectId}`)}>
                        {task.project.name}
                      </div>
                    )}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                        <span>{task.annotatedFrames}/{task.frameCount} frames</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ background: '#f0f0f0', borderRadius: 4, height: 5 }}>
                        <div style={{ width: `${pct}%`, background: pct === 100 ? '#52c41a' : '#1890ff', height: '100%', borderRadius: 4 }} />
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
