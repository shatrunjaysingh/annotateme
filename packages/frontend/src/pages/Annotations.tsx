import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';

interface AnnotationRow {
  jobId: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  totalFrames: number;
  annotatedFrames: number;
  shapeCount: number;
  lastAnnotatedAt: string;
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  dataType: string;
  assignee: string | null;
}

const STAGE_COLOR: Record<string, { bg: string; color: string }> = {
  annotation:  { bg: '#e6f4ff', color: '#1890ff' },
  validation:  { bg: '#fff7e6', color: '#fa8c16' },
  acceptance:  { bg: '#f6ffed', color: '#52c41a' },
};

const STATE_COLOR: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#f5f5f5',  color: '#8c8c8c' },
  in_progress: { bg: '#e6f4ff',  color: '#1890ff' },
  completed:   { bg: '#f6ffed',  color: '#52c41a' },
  rejected:    { bg: '#fff1f0',  color: '#ff4d4f' },
};

function timeAgo(date: string) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Badge({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, background: style.bg, color: style.color, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {label.replace('_', ' ')}
    </span>
  );
}

export default function Annotations() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AnnotationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterState, setFilterState] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/annotations/summary');
      setRows(Array.isArray(data) ? data : []);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    if (q && !r.projectName.toLowerCase().includes(q) && !r.taskName.toLowerCase().includes(q)) return false;
    if (filterStage && r.stage !== filterStage) return false;
    if (filterState && r.state !== filterState) return false;
    return true;
  });

  // Group by project
  const grouped = filtered.reduce<Record<string, AnnotationRow[]>>((acc, r) => {
    if (!acc[r.projectId]) acc[r.projectId] = [];
    acc[r.projectId].push(r);
    return acc;
  }, {});

  const totalShapes = filtered.reduce((s, r) => s + r.shapeCount, 0);
  const totalFrames = filtered.reduce((s, r) => s + r.annotatedFrames, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Annotations</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>
              All annotated jobs — click Open to resume in the editor
            </p>
          </div>
          {!loading && (
            <div style={{ display: 'flex', gap: 20 }}>
              <Stat label="Annotated jobs" value={filtered.length} color="#1890ff" />
              <Stat label="Total frames" value={totalFrames} color="#722ed1" />
              <Stat label="Total shapes" value={totalShapes} color="#52c41a" />
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 280 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search project or task..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="input" style={{ width: 140, padding: '4px 10px', fontSize: 13 }}
            value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All stages</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
          </select>

          <select className="input" style={{ width: 140, padding: '4px 10px', fontSize: 13 }}
            value={filterState} onChange={e => setFilterState(e.target.value)}>
            <option value="">All states</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="empty-state">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <p>{search || filterStage || filterState ? 'No annotations match your filters' : 'No annotations yet'}</p>
            <span>Open a job in the editor and draw shapes to see them here</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(grouped).map(([projectId, jobRows]) => {
              const first = jobRows[0];
              return (
                <div key={projectId} className="card" style={{ overflow: 'hidden' }}>
                  {/* Project header */}
                  <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1890ff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{first.projectName}</span>
                    <span className="badge badge-gray" style={{ fontSize: 11 }}>{first.dataType}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>{jobRows.length} job{jobRows.length !== 1 ? 's' : ''}</span>
                    <button className="btn btn-default btn-sm" onClick={() => navigate(`/projects/${projectId}`)}>View project</button>
                  </div>

                  {/* Jobs table */}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>Stage</th>
                          <th>State</th>
                          <th>Frames annotated</th>
                          <th>Shapes</th>
                          <th>Assignee</th>
                          <th>Last annotated</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobRows.map(r => (
                          <tr key={r.jobId} style={{ cursor: 'default' }}>
                            <td style={{ fontWeight: 500, maxWidth: 200 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.taskName}</div>
                              <div style={{ fontSize: 11, color: '#8c8c8c' }}>frames {r.frameStart ?? 0}–{r.frameEnd ?? r.totalFrames - 1}</div>
                            </td>
                            <td><Badge label={r.stage} style={STAGE_COLOR[r.stage] || STAGE_COLOR.annotation} /></td>
                            <td><Badge label={r.state} style={STATE_COLOR[r.state] || STATE_COLOR.new} /></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600 }}>{r.annotatedFrames}</span>
                                <span style={{ color: '#8c8c8c', fontSize: 12 }}>/ {r.totalFrames}</span>
                                <div style={{ flex: 1, maxWidth: 80, height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${r.totalFrames > 0 ? (r.annotatedFrames / r.totalFrames) * 100 : 0}%`, background: '#1890ff', borderRadius: 2 }} />
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: '#262626' }}>{r.shapeCount.toLocaleString()}</td>
                            <td style={{ color: '#8c8c8c', fontSize: 13 }}>{r.assignee || '—'}</td>
                            <td style={{ color: '#8c8c8c', fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(r.lastAnnotatedAt)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="btn btn-primary btn-sm"
                                onClick={() => navigate(`/jobs/${r.jobId}/annotate`)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Open Editor
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>{label}</div>
    </div>
  );
}
