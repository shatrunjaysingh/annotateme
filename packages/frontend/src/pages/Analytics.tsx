import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';

const GRAFANA_DASHBOARD = '/grafana/d/annotateme-main/annotateme-analytics?orgId=1&kiosk=tv&refresh=30s';

interface Stats {
  projects: number;
  tasks: number;
  jobs: { total: number; new: number; in_progress: number; completed: number; rejected: number };
  completionRate: number;
  projectBreakdown: { name: string; tasks: number; jobs: number }[];
}

export default function Analytics() {
  const [grafanaUp, setGrafanaUp] = useState<boolean | null>(null); // null = checking
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if Grafana is actually reachable — must return JSON with database:ok,
  // not the React app's index.html fallback which also returns HTTP 200.
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

  // Load built-in stats regardless (used when Grafana is down)
  useEffect(() => {
    const load = async () => {
      try {
        const [projRes, taskRes] = await Promise.all([client.get('/projects'), client.get('/tasks')]);
        const projects = projRes.data;
        const tasks = taskRes.data;
        let total = 0, newJ = 0, inProg = 0, completed = 0, rejected = 0;
        const breakdown: any[] = [];
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
          breakdown.push({ name: p.name, tasks: pTasks.length, jobs: pJobs });
        }
        setStats({ projects: projects.length, tasks: tasks.length, jobs: { total, new: newJ, in_progress: inProg, completed, rejected }, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0, projectBreakdown: breakdown });
      } catch { /* no-op */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const jobColors: Record<string, string> = { new: '#8c8c8c', in_progress: '#1890ff', completed: '#52c41a', rejected: '#ff4d4f' };
  const maxJobs = stats ? Math.max(...stats.projectBreakdown.map(p => p.jobs), 1) : 1;

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

        {/* Grafana iframe — only when confirmed up */}
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

        {/* Built-in charts — shown when Grafana is down or still checking */}
        {grafanaUp !== true && (
          loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
          ) : (
            <>
              {/* Stat cards */}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Job status */}
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Job Status</h3>
                  {stats && Object.entries(stats.jobs).filter(([k]) => k !== 'total').map(([state, count]) => {
                    const pct = stats.jobs.total > 0 ? (count as number / stats.jobs.total * 100) : 0;
                    return (
                      <div key={state} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ textTransform: 'capitalize' }}>{state.replace('_', ' ')}</span>
                          <span style={{ fontWeight: 600, color: jobColors[state] }}>{count as number}</span>
                        </div>
                        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: jobColors[state], borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Jobs per project */}
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Jobs per Project</h3>
                  {!stats?.projectBreakdown.length ? (
                    <div style={{ color: '#8c8c8c', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No data yet</div>
                  ) : stats.projectBreakdown.map(p => (
                    <div key={p.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.name}</span>
                        <span style={{ fontWeight: 600, color: '#1890ff', flexShrink: 0 }}>{p.jobs} jobs</span>
                      </div>
                      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(p.jobs / maxJobs) * 100}%`, background: '#1890ff', borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grafana callout when it's confirmed down */}
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
