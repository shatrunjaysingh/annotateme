import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';

const GRAFANA_DASHBOARD = '/grafana/d/annotateme-main/annotateme-analytics?orgId=1&kiosk=tv&refresh=30s';

interface JobStats { total: number; new: number; in_progress: number; completed: number; rejected: number; }
interface Stats {
  projects: number; tasks: number; jobs: JobStats; completionRate: number;
  projectBreakdown: { name: string; id: string; tasks: number; jobs: number }[];
}
interface ClassRow { label: string; count: number; }
interface LeaderRow { id: string; username: string; frames: number; shapes: number; }
interface VelocityRow { date: string; saves: number; }
interface ProjectSummary { tasks: number; jobs: JobStats; }
interface QualityRow { user_id: string; username: string; frames_annotated: number; total_shapes: number; avg_confidence: number; coverage_pct: number | null; }
interface QualityData { gt_shape_count: number; gt_frame_count: number; annotators: QualityRow[]; }

const jobColors: Record<string, string> = { new: '#8c8c8c', in_progress: '#1890ff', completed: '#52c41a', rejected: '#ff4d4f' };

// Simple inline SVG horizontal bar chart
function HBar({ rows, colorFn }: { rows: { label: string; value: number; color?: string }[]; colorFn?: (label: string, i: number) => string }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const PALETTE = ['#1890ff','#52c41a','#fa8c16','#eb2f96','#722ed1','#13c2c2','#ff4d4f','#fadb14','#2f54eb','#389e0d'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={r.label}>{r.label}</span>
            <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{r.value.toLocaleString()}</span>
          </div>
          <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(r.value / max) * 100}%`, background: r.color ?? (colorFn ? colorFn(r.label, i) : PALETTE[i % PALETTE.length]), borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Sparkline SVG line chart
function Sparkline({ data, color = '#1890ff' }: { data: { date: string; value: number }[]; color?: string }) {
  if (!data.length) return <div style={{ color: '#8c8c8c', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No data yet</div>;
  const W = 360, H = 80, PAD = 8;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const xStep = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : W - PAD * 2;
  const pts = data.map((d, i) => ({
    x: PAD + i * xStep,
    y: PAD + (1 - d.value / maxV) * (H - PAD * 2),
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${pts[pts.length - 1].x.toFixed(1)},${(H - PAD).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - PAD).toFixed(1)} Z`;
  const labelStep = Math.ceil(data.length / 5);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#sg)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.filter((_, i) => i % labelStep === 0 || i === data.length - 1).map((p, j) => {
          const origIdx = data.findIndex((_, k) => k % labelStep === 0 || k === data.length - 1);
          const idx = data.findIndex((d, k) => (k % labelStep === 0 || k === data.length - 1) && k >= j * labelStep);
          return (
            <text key={j} x={p.x} y={H} textAnchor="middle" fontSize="9" fill="#8c8c8c">
              {data[Math.min(j * labelStep, data.length - 1)]?.date?.slice(5)}
            </text>
          );
        })}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} opacity="0.7" />
        ))}
      </svg>
    </div>
  );
}

export default function Analytics() {
  const [grafanaUp, setGrafanaUp] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Project-level analytics
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [classDist, setClassDist] = useState<ClassRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [velocity, setVelocity] = useState<VelocityRow[]>([]);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null);
  const [qualityData, setQualityData] = useState<QualityData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch('/grafana/api/health', { signal: AbortSignal.timeout(3000) })
      .then(async r => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('application/json')) return setGrafanaUp(false);
        const body = await r.json();
        setGrafanaUp(body?.database === 'ok');
      })
      .catch(() => setGrafanaUp(false));
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [projRes, taskRes] = await Promise.all([client.get('/projects'), client.get('/tasks')]);
        const projects = projRes.data;
        const tasks = taskRes.data;
        let total = 0, newJ = 0, inProg = 0, completed = 0, rejected = 0;
        const breakdown: { name: string; id: string; tasks: number; jobs: number }[] = [];
        for (const p of projects) {
          const pTasks = tasks.filter((t: any) => t.projectId === p.id);
          let pJobs = 0;
          for (const t of pTasks) {
            const jc = t.jobs?.length || 0;
            pJobs += jc; total += jc;
            t.jobs?.forEach((j: any) => {
              if (j.state === 'new') newJ++;
              if (j.state === 'in_progress') inProg++;
              if (j.state === 'completed') completed++;
              if (j.state === 'rejected') rejected++;
            });
          }
          breakdown.push({ name: p.name, id: p.id, tasks: pTasks.length, jobs: pJobs });
        }
        setStats({ projects: projects.length, tasks: tasks.length, jobs: { total, new: newJ, in_progress: inProg, completed, rejected }, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0, projectBreakdown: breakdown });
        if (projects.length > 0 && !selectedProject) setSelectedProject(projects[0].id);
      } catch { /* no-op */ }
      finally { setLoading(false); }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjectDetail = useCallback(async (pid: string) => {
    if (!pid) return;
    setDetailLoading(true);
    try {
      const [cdRes, lbRes, velRes, sumRes, qualRes] = await Promise.all([
        client.get(`/analytics/class-distribution/${pid}`),
        client.get(`/analytics/leaderboard/${pid}`),
        client.get(`/analytics/velocity/${pid}`),
        client.get(`/analytics/summary/${pid}`),
        client.get(`/analytics/quality/${pid}`),
      ]);
      setClassDist(cdRes.data);
      setLeaderboard(lbRes.data);
      setVelocity(velRes.data);
      setProjectSummary(sumRes.data);
      setQualityData(qualRes.data);
    } catch { /* no-op */ }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedProject) loadProjectDetail(selectedProject);
  }, [selectedProject, loadProjectDetail]);

  const maxJobs = stats ? Math.max(...stats.projectBreakdown.map(p => p.jobs), 1) : 1;
  const selectedProjectName = stats?.projectBreakdown.find(p => p.id === selectedProject)?.name;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Analytics</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>
              {grafanaUp ? 'Grafana dashboard — live data' : 'Built-in overview'}
            </p>
          </div>
          {grafanaUp !== null && (
            <a href="/grafana" target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, background: grafanaUp ? '#fa8c16' : '#f0f0f0', color: grafanaUp ? '#fff' : '#8c8c8c', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              {grafanaUp ? 'Open in Grafana' : 'Grafana not running'}
            </a>
          )}
        </div>

        {/* Grafana iframe */}
        {grafanaUp === true && (
          <div className="card" style={{ flex: 1, minHeight: 700, padding: 0, overflow: 'hidden' }}>
            <iframe
              src={GRAFANA_DASHBOARD}
              style={{ width: '100%', height: '100%', minHeight: 700, border: 'none', display: 'block' }}
              title="AnnotateMe Analytics"
              allowFullScreen
            />
          </div>
        )}

        {/* Built-in dashboard */}
        {grafanaUp !== true && (
          loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
          ) : (
            <>
              {/* Top stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {[
                  { label: 'Projects', value: stats?.projects ?? 0, color: '#1890ff' },
                  { label: 'Tasks', value: stats?.tasks ?? 0, color: '#722ed1' },
                  { label: 'Total Jobs', value: stats?.jobs.total ?? 0, color: '#fa8c16' },
                  { label: 'Completed Jobs', value: stats?.jobs.completed ?? 0, color: '#52c41a' },
                  { label: 'Completion Rate', value: `${stats?.completionRate ?? 0}%`, color: '#13c2c2' },
                ].map(c => (
                  <div key={c.label} className="card" style={{ padding: 20, borderTop: `3px solid ${c.color}` }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Row 2: job status + jobs per project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Job Status (all projects)</h3>
                  {stats && (
                    <HBar
                      rows={Object.entries(stats.jobs)
                        .filter(([k]) => k !== 'total')
                        .map(([state, count]) => ({ label: state.replace('_', ' '), value: count as number, color: jobColors[state] }))}
                    />
                  )}
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Jobs per Project</h3>
                  {!stats?.projectBreakdown.length ? (
                    <div style={{ color: '#8c8c8c', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No data yet</div>
                  ) : (
                    <HBar rows={stats.projectBreakdown.map(p => ({ label: p.name, value: p.jobs }))} />
                  )}
                </div>
              </div>

              {/* Project selector */}
              {stats && stats.projectBreakdown.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#595959' }}>Project detail:</span>
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 200 }}>
                    {stats.projectBreakdown.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {detailLoading && <span className="spinner" style={{ width: 16, height: 16 }} />}
                </div>
              )}

              {/* Project detail cards */}
              {selectedProject && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

                  {/* Class distribution */}
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, marginTop: 0, color: '#262626' }}>
                      Label Distribution
                      <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 400, marginLeft: 6 }}>shapes per class</span>
                    </h3>
                    {detailLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
                    ) : !classDist.length ? (
                      <div style={{ color: '#8c8c8c', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No annotations yet</div>
                    ) : (
                      <HBar rows={classDist.map(r => ({ label: r.label, value: r.count }))} />
                    )}
                  </div>

                  {/* Annotator leaderboard */}
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, marginTop: 0, color: '#262626' }}>
                      Annotator Leaderboard
                      <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 400, marginLeft: 6 }}>top contributors</span>
                    </h3>
                    {detailLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
                    ) : !leaderboard.length ? (
                      <div style={{ color: '#8c8c8c', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No data yet</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {leaderboard.map((r, i) => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#fadb14' : i === 1 ? '#d9d9d9' : i === 2 ? '#fa8c16' : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, color: i < 3 ? '#262626' : '#8c8c8c' }}>
                              {i + 1}
                            </div>
                            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</span>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1890ff' }}>{r.shapes.toLocaleString()}</div>
                              <div style={{ fontSize: 10, color: '#8c8c8c' }}>{r.frames} frames</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Annotation velocity */}
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, marginTop: 0, color: '#262626' }}>
                      Annotation Velocity
                      <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 400, marginLeft: 6 }}>saves / day (30d)</span>
                    </h3>
                    {detailLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" /></div>
                    ) : (
                      <Sparkline data={velocity.map(r => ({ date: r.date, value: r.saves }))} />
                    )}
                    {velocity.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{velocity.reduce((s, r) => s + r.saves, 0)}</div>
                          <div style={{ fontSize: 10, color: '#8c8c8c' }}>total saves</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>{Math.round(velocity.reduce((s, r) => s + r.saves, 0) / velocity.length)}</div>
                          <div style={{ fontSize: 10, color: '#8c8c8c' }}>avg / day</div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Quality report */}
              {selectedProject && qualityData && !detailLoading && qualityData.annotators.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>
                    Annotator Quality Report
                    <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 400, marginLeft: 6 }}>vs. ground truth</span>
                  </h3>
                  {qualityData.gt_frame_count === 0 && (
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12, padding: '6px 10px', background: '#fffbe6', borderRadius: 6, border: '1px solid #ffe58f' }}>
                      No ground truth jobs in this project yet — create a job with type "Ground truth" to enable quality scoring.
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                          {['Annotator', 'Frames', 'Shapes', 'Coverage vs GT', 'Avg Confidence'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {qualityData.annotators.map((r, i) => (
                          <tr key={r.user_id} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1890ff', flexShrink: 0 }}>
                                  {r.username.charAt(0).toUpperCase()}
                                </div>
                                {r.username}
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#595959' }}>{r.frames_annotated}</td>
                            <td style={{ padding: '8px 10px', color: '#595959' }}>{r.total_shapes.toLocaleString()}</td>
                            <td style={{ padding: '8px 10px' }}>
                              {r.coverage_pct !== null ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                                    <div style={{ height: '100%', width: `${r.coverage_pct}%`, background: r.coverage_pct >= 80 ? '#52c41a' : r.coverage_pct >= 50 ? '#fa8c16' : '#ff4d4f', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontWeight: 600, fontSize: 12, color: r.coverage_pct >= 80 ? '#389e0d' : r.coverage_pct >= 50 ? '#d46b08' : '#cf1322', flexShrink: 0 }}>{r.coverage_pct}%</span>
                                </div>
                              ) : <span style={{ color: '#bfbfbf', fontSize: 11 }}>No GT</span>}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {r.avg_confidence > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                    <div style={{ height: '100%', width: `${r.avg_confidence}%`, background: '#722ed1', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontWeight: 600, fontSize: 12, color: '#722ed1', flexShrink: 0 }}>{r.avg_confidence}%</span>
                                </div>
                              ) : <span style={{ color: '#bfbfbf', fontSize: 11 }}>Manual</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Job status for selected project */}
              {selectedProject && projectSummary && !detailLoading && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, marginTop: 0 }}>
                    Job Status — {selectedProjectName}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Tasks', value: projectSummary.tasks, color: '#722ed1' },
                      { label: 'New', value: projectSummary.jobs.new, color: '#8c8c8c' },
                      { label: 'In Progress', value: projectSummary.jobs.in_progress, color: '#1890ff' },
                      { label: 'Completed', value: projectSummary.jobs.completed, color: '#52c41a' },
                      { label: 'Rejected', value: projectSummary.jobs.rejected, color: '#ff4d4f' },
                    ].map(c => (
                      <div key={c.label} style={{ padding: '12px 14px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0', borderLeft: `3px solid ${c.color}` }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {grafanaUp === false && (
                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fa8c16" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div style={{ fontSize: 13 }}>
                    <strong>Grafana is not running.</strong> Start it for advanced charts, time-series graphs, and tenant analytics:
                    <code style={{ marginLeft: 10, background: '#fff3cd', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>docker compose up -d grafana</code>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
