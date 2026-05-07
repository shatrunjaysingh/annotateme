import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';

interface Stats {
  projects: number;
  tasks: number;
  jobs: { total: number; new: number; in_progress: number; completed: number; rejected: number };
  annotations: number;
  completionRate: number;
  projectBreakdown: { name: string; tasks: number; jobs: number }[];
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [projRes, taskRes] = await Promise.all([client.get('/projects'), client.get('/tasks')]);
        const projects = projRes.data;
        const tasks = taskRes.data;

        // Compute stats client-side
        let totalJobs = 0, newJobs = 0, inProgressJobs = 0, completedJobs = 0, rejectedJobs = 0;
        const projBreakdown: any[] = [];

        for (const p of projects) {
          const pTasks = tasks.filter((t: any) => t.projectId === p.id);
          let pJobs = 0;
          for (const t of pTasks) {
            const jc = t.jobs?.length || 0;
            pJobs += jc;
            totalJobs += jc;
            t.jobs?.forEach((j: any) => {
              if (j.state === 'new') newJobs++;
              if (j.state === 'in_progress') inProgressJobs++;
              if (j.state === 'completed') completedJobs++;
              if (j.state === 'rejected') rejectedJobs++;
            });
          }
          projBreakdown.push({ name: p.name, tasks: pTasks.length, jobs: pJobs });
        }

        setStats({
          projects: projects.length,
          tasks: tasks.length,
          jobs: { total: totalJobs, new: newJobs, in_progress: inProgressJobs, completed: completedJobs, rejected: rejectedJobs },
          annotations: 0,
          completionRate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0,
          projectBreakdown: projBreakdown,
        });
      } catch { /* no-op */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const statCards = stats ? [
    { label: 'Projects', value: stats.projects, color: '#1890ff', icon: '📁' },
    { label: 'Tasks', value: stats.tasks, color: '#52c41a', icon: '📋' },
    { label: 'Total Jobs', value: stats.jobs.total, color: '#fa8c16', icon: '💼' },
    { label: 'Completion Rate', value: `${stats.completionRate}%`, color: '#722ed1', icon: '📈' },
  ] : [];

  const maxJobs = stats ? Math.max(...stats.projectBreakdown.map(p => p.jobs), 1) : 1;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Analytics</h1>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              {statCards.map(card => (
                <div key={card.label} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>{card.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
                    </div>
                    <span style={{ fontSize: 24 }}>{card.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Job status breakdown */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Job Status Distribution</h3>
                  {Object.entries(stats.jobs).filter(([k]) => k !== 'total').map(([state, count]) => {
                    const colors: Record<string, string> = { new: '#8c8c8c', in_progress: '#1890ff', completed: '#52c41a', rejected: '#ff4d4f' };
                    const pct = stats.jobs.total > 0 ? (count as number / stats.jobs.total * 100) : 0;
                    return (
                      <div key={state} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ textTransform: 'capitalize' }}>{state.replace('_', ' ')}</span>
                          <span style={{ fontWeight: 600, color: colors[state] }}>{count}</span>
                        </div>
                        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: colors[state], borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Jobs per Project</h3>
                  {stats.projectBreakdown.length === 0 ? (
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
            )}

            {/* Activity table */}
            {stats && stats.projectBreakdown.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Project Summary</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Project</th><th>Tasks</th><th>Jobs</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {stats.projectBreakdown.map(p => (
                        <tr key={p.name}>
                          <td style={{ fontWeight: 500 }}>{p.name}</td>
                          <td>{p.tasks}</td>
                          <td>{p.jobs}</td>
                          <td><span className="badge badge-blue">active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
