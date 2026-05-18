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
  jobs?: { id: string; state: string; stage: string; frameStart: number; frameEnd: number }[];
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

const STAGE_COLORS: Record<string, string> = {
  annotation: 'badge-blue',
  validation: 'badge-orange',
  acceptance: 'badge-orange',
};

const STATE_STYLES: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#f5f5f5', color: '#595959' },
  in_progress: { bg: '#e6f4ff', color: '#1890ff' },
  completed:   { bg: '#f6ffed', color: '#52c41a' },
  rejected:    { bg: '#fff1f0', color: '#ff4d4f' },
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

function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (totalPages <= 1 && total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages: number[] = [];
  const lo = Math.max(1, page - 2);
  const hi = Math.min(totalPages, lo + 4);
  for (let i = lo; i <= hi; i++) pages.push(i);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, flexWrap: 'wrap', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Showing {start}–{end} of {total} task{total !== 1 ? 's' : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn btn-default btn-sm" disabled={page === 1} onClick={() => onPage(page - 1)}>← Prev</button>
        {lo > 1 && <><button className="btn btn-default btn-sm" style={{ minWidth: 36 }} onClick={() => onPage(1)}>1</button><span style={{ color: 'var(--text-disabled)', padding: '0 2px' }}>…</span></>}
        {pages.map(p => (
          <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-default'}`} style={{ minWidth: 36 }} onClick={() => onPage(p)}>{p}</button>
        ))}
        {hi < totalPages && <><span style={{ color: 'var(--text-disabled)', padding: '0 2px' }}>…</span><button className="btn btn-default btn-sm" style={{ minWidth: 36 }} onClick={() => onPage(totalPages)}>{totalPages}</button></>}
        <button className="btn btn-default btn-sm" disabled={page === totalPages} onClick={() => onPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  const PAGE_SIZE = view === 'grid' ? 12 : 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  React.useEffect(() => { setPage(1); setExpandedTaskId(null); }, [search, filterStatus, filterSubset, view]);

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
          <>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['#', 'Thumbnail', 'Task Name', 'Project', 'Subset', 'Status', 'Frames', 'Progress', 'Jobs', 'Updated', 'Actions'].map(h => (
                    <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((task, i) => {
                  const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
                  const isExpanded = expandedTaskId === task.id;
                  const jobCount = task.jobs?.length ?? 0;
                  return (
                    <React.Fragment key={task.id}>
                      <tr style={{ background: isExpanded ? '#f0f7ff' : undefined }}>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
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
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 14, textAlign: 'left', padding: 0 }}
                            onClick={() => navigate(`/projects/${task.projectId}`)}
                          >
                            {task.name}
                          </button>
                        </td>
                        <td>
                          {task.project?.name ? (
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, padding: 0 }}
                              onClick={() => navigate(`/projects/${task.projectId}`)}
                            >
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
                        <td>
                          <button
                            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            disabled={jobCount === 0}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none', padding: 0,
                              cursor: jobCount > 0 ? 'pointer' : 'default',
                              color: jobCount > 0 ? 'var(--primary)' : 'var(--text-secondary)',
                              fontSize: 13, fontWeight: jobCount > 0 ? 600 : 400,
                            }}
                          >
                            {jobCount}
                            {jobCount > 0 && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                {isExpanded
                                  ? <polyline points="18 15 12 9 6 15" />
                                  : <polyline points="6 9 12 15 18 9" />}
                              </svg>
                            )}
                          </button>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(task.updatedAt)}</td>
                        <td>
                          <button className="btn btn-default btn-sm" onClick={() => navigate(`/projects/${task.projectId}`)}>
                            View
                          </button>
                        </td>
                      </tr>

                      {/* Expanded jobs sub-row */}
                      {isExpanded && (
                        <tr style={{ background: '#f9fafb' }}>
                          <td colSpan={11} style={{ padding: 0, borderTop: '1px solid #e8f0fe' }}>
                            <div style={{ padding: '10px 90px 14px' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Jobs ({jobCount})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {(task.jobs || []).map((job, jIdx) => {
                                  const stStyle = STATE_STYLES[job.state] || STATE_STYLES.new;
                                  return (
                                    <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, fontSize: 13 }}>
                                      <span style={{ color: '#8c8c8c', fontSize: 12, minWidth: 52, fontWeight: 500 }}>Job #{jIdx + 1}</span>
                                      <span className={`badge ${STAGE_COLORS[job.stage] || 'badge-gray'}`} style={{ fontSize: 11 }}>{job.stage}</span>
                                      <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: stStyle.bg, color: stStyle.color }}>
                                        {job.state.replace('_', ' ')}
                                      </span>
                                      <span style={{ color: '#8c8c8c', fontSize: 12, flex: 1 }}>
                                        Frames {job.frameStart} – {job.frameEnd}
                                        <span style={{ marginLeft: 6, color: '#bfbfbf' }}>({job.frameEnd - job.frameStart + 1} frames)</span>
                                      </span>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        style={{ fontSize: 12 }}
                                        onClick={() => navigate(`/jobs/${job.id}/annotate`)}
                                      >
                                        Open
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </>

        ) : (
          // Grid view
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {paged.map(task => {
              const pct = task.frameCount > 0 ? Math.round((task.annotatedFrames / task.frameCount) * 100) : 0;
              return (
                <div key={task.id} className="card card-hover" style={{ overflow: 'hidden' }}>
                  {/* Thumbnail */}
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
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, color: 'var(--text)' }}>{task.name}</div>
                    {task.project?.name && (
                      <div
                        style={{ fontSize: 12, color: 'var(--primary)', marginBottom: 8, cursor: 'pointer' }}
                        onClick={() => navigate(`/projects/${task.projectId}`)}
                      >
                        {task.project.name}
                      </div>
                    )}

                    {/* Progress */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>
                        <span>{task.annotatedFrames}/{task.frameCount} frames</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-fill ${pct >= 100 ? 'success' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Jobs list */}
                    {task.jobs && task.jobs.length > 0 && (
                      <div style={{ marginBottom: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Jobs ({task.jobs.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                          {task.jobs.map((job, jIdx) => {
                            const stStyle = STATE_STYLES[job.state] || STATE_STYLES.new;
                            return (
                              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12 }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: 11, minWidth: 44, fontWeight: 500 }}>Job #{jIdx + 1}</span>
                                <span className={`badge ${STAGE_COLORS[job.stage] || 'badge-gray'}`} style={{ fontSize: 10 }}>{job.stage}</span>
                                <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: stStyle.bg, color: stStyle.color }}>
                                  {job.state.replace('_', ' ')}
                                </span>
                                <div style={{ flex: 1 }} />
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  onClick={e => { e.stopPropagation(); navigate(`/jobs/${job.id}/annotate`); }}
                                >
                                  Open
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      className="btn btn-default btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => navigate(`/projects/${task.projectId}`)}
                    >
                      View in project
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
