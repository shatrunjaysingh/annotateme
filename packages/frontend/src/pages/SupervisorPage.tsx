import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import client from '../api/client';

interface User { id: string; username: string; email: string; role: string; }
interface Project { id: string; name: string; }
interface Task {
  id: string; name: string; subset: string; frameCount: number; annotatedFrames: number;
  projectId: string; assigneeId?: string;
  jobs: Job[];
}
interface Job {
  id: string; state: string; stage: string; frameStart: number; frameEnd: number;
  assigneeId?: string; assignee?: User;
  createdAt: string; updatedAt: string;
}

const STATE_COLOR: Record<string, string> = { new: '#8c8c8c', in_progress: '#1890ff', completed: '#52c41a', rejected: '#ff4d4f' };
const STAGE_COLOR: Record<string, string> = { annotation: '#1890ff', validation: '#fa8c16', acceptance: '#52c41a' };

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function ProgressBar({ value, color = '#1890ff', height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: '#f0f0f0', borderRadius: height }}>
      <div style={{ height, width: `${Math.min(100, value)}%`, background: color, borderRadius: height, transition: 'width 0.4s' }} />
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function SupervisorPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tasks' | 'jobs'>('overview');
  const [assigningJob, setAssigningJob] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, projectsRes, tasksRes] = await Promise.all([
        client.get('/users').catch(() => ({ data: [] })),
        client.get('/projects').catch(() => ({ data: [] })),
        client.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
      const rawTasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      setTasks(rawTasks);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssignJob = async (jobId: string, assigneeId: string) => {
    try {
      await client.patch(`/jobs/${jobId}`, { assigneeId: assigneeId || null });
      load();
    } catch { /* no-op */ }
  };

  const handleAssignTask = async (taskId: string, assigneeId: string) => {
    try {
      await client.patch(`/tasks/${taskId}`, { assigneeId: assigneeId || null });
      load();
    } catch { /* no-op */ }
  };

  const allJobs: (Job & { task: Task; project: Project })[] = tasks.flatMap(t =>
    (t.jobs || []).map(j => ({
      ...j,
      task: t,
      project: projects.find(p => p.id === t.projectId) || { id: '', name: 'Unknown' },
    }))
  );

  // Overview stats
  const totalJobs = allJobs.length;
  const completedJobs = allJobs.filter(j => j.state === 'completed').length;
  const inProgressJobs = allJobs.filter(j => j.state === 'in_progress').length;
  const newJobs = allJobs.filter(j => j.state === 'new').length;
  const rejectedJobs = allJobs.filter(j => j.state === 'rejected').length;
  const unassignedJobs = allJobs.filter(j => !j.assigneeId).length;

  // Per-user stats
  const userStats = users.map(u => {
    const myJobs = allJobs.filter(j => j.assigneeId === u.id);
    const myCompleted = myJobs.filter(j => j.state === 'completed').length;
    const myInProgress = myJobs.filter(j => j.state === 'in_progress').length;
    const myFrames = myJobs.reduce((acc, j) => acc + (j.frameEnd - j.frameStart + 1), 0);
    return { user: u, jobs: myJobs.length, completed: myCompleted, inProgress: myInProgress, frames: myFrames };
  });

  const filteredTasks = tasks.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || t.projectId === filterProject;
    return matchSearch && matchProject;
  });

  const filteredJobs = allJobs.filter(j => {
    const matchSearch = !search || j.task?.name?.toLowerCase().includes(search.toLowerCase()) || j.project?.name?.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || j.project?.id === filterProject;
    return matchSearch && matchProject;
  });

  const Tab = ({ id, label, icon }: { id: typeof activeTab; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setActiveTab(id)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', border: 'none', borderBottom: `2px solid ${activeTab === id ? '#1890ff' : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === id ? 600 : 400, color: activeTab === id ? '#1890ff' : '#595959', transition: 'all 0.15s' }}>
      {icon}{label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#262626' }}>Supervisor Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#8c8c8c', fontSize: 14 }}>Monitor teams, assign work, and track annotation progress</p>
        </div>

        {/* Tabs */}
        <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '0 4px' }}>
            <Tab id="overview" label="Overview" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>} />
            <Tab id="users" label={`Team (${users.length})`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg>} />
            <Tab id="tasks" label={`Tasks (${tasks.length})`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>} />
            <Tab id="jobs" label={`Jobs (${totalJobs})`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>} />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div>
                {/* KPI row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
                  <StatCard label="Total Jobs" value={totalJobs} color="#262626" />
                  <StatCard label="Completed" value={completedJobs} sub={`${pct(completedJobs, totalJobs)}%`} color="#52c41a" />
                  <StatCard label="In Progress" value={inProgressJobs} sub={`${pct(inProgressJobs, totalJobs)}%`} color="#1890ff" />
                  <StatCard label="New" value={newJobs} sub="not started" color="#8c8c8c" />
                  <StatCard label="Rejected" value={rejectedJobs} sub={`${pct(rejectedJobs, totalJobs)}%`} color="#ff4d4f" />
                  <StatCard label="Unassigned" value={unassignedJobs} sub="need assignee" color="#fa8c16" />
                </div>

                {/* Project progress */}
                <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Project Progress</h3>
                  {projects.length === 0
                    ? <div style={{ color: '#bfbfbf', fontSize: 14 }}>No projects</div>
                    : projects.map(p => {
                      const ptasks = tasks.filter(t => t.projectId === p.id);
                      const pjobs = allJobs.filter(j => j.project.id === p.id);
                      const pdone = pjobs.filter(j => j.state === 'completed').length;
                      const ppct = pct(pdone, pjobs.length);
                      return (
                        <div key={p.id} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 500, fontSize: 13, cursor: 'pointer', color: '#1890ff' }} onClick={() => navigate(`/projects/${p.id}`)}>{p.name}</span>
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{pdone}/{pjobs.length} jobs · {ptasks.length} tasks</span>
                          </div>
                          <ProgressBar value={ppct} color={ppct === 100 ? '#52c41a' : '#1890ff'} height={8} />
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 3, textAlign: 'right' }}>{ppct}% complete</div>
                        </div>
                      );
                    })}
                </div>

                {/* Job state breakdown */}
                <div className="card" style={{ padding: '20px 24px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Job State Breakdown</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(STATE_COLOR).map(([state, color]) => {
                      const count = allJobs.filter(j => j.state === state).length;
                      return (
                        <div key={state} style={{ flex: '1 1 120px', padding: '14px 16px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
                          <div style={{ fontSize: 12, color: '#595959', marginTop: 4, textTransform: 'capitalize' }}>{state.replace('_', ' ')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── USERS TAB ── */}
            {activeTab === 'users' && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Team Performance</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Annotator</th>
                      <th>Role</th>
                      <th>Assigned Jobs</th>
                      <th>Completed</th>
                      <th>In Progress</th>
                      <th>Total Frames</th>
                      <th>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userStats.map(({ user: u, jobs, completed, inProgress, frames }) => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e6f4ff', color: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                              {u.username[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                              <div style={{ fontSize: 11, color: '#8c8c8c' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: u.role === 'admin' ? '#fff0f6' : u.role === 'manager' ? '#f9f0ff' : '#e6f4ff', color: u.role === 'admin' ? '#eb2f96' : u.role === 'manager' ? '#722ed1' : '#1890ff', fontWeight: 600 }}>{u.role}</span></td>
                        <td style={{ fontWeight: 600 }}>{jobs}</td>
                        <td style={{ color: '#52c41a', fontWeight: 600 }}>{completed}</td>
                        <td style={{ color: '#1890ff', fontWeight: 600 }}>{inProgress}</td>
                        <td style={{ color: '#595959' }}>{frames.toLocaleString()}</td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1 }}><ProgressBar value={pct(completed, jobs)} color="#52c41a" /></div>
                            <span style={{ fontSize: 12, color: '#8c8c8c', width: 34, textAlign: 'right' }}>{pct(completed, jobs)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {userStats.length === 0 && <div className="empty-state"><p>No users found</p></div>}
              </div>
            )}

            {/* ── TASKS TAB ── */}
            {activeTab === 'tasks' && (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="search-bar" style={{ width: 240 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <select className="input" style={{ width: 200 }} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                    <option value="">All projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Project</th>
                        <th>Subset</th>
                        <th>Assignee</th>
                        <th>Jobs</th>
                        <th>Progress</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map(t => {
                        const proj = projects.find(p => p.id === t.projectId);
                        const tjobs = t.jobs || [];
                        const tdone = tjobs.filter(j => j.state === 'completed').length;
                        return (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</td>
                            <td>
                              <span style={{ fontSize: 12, color: '#1890ff', cursor: 'pointer' }} onClick={() => navigate(`/projects/${t.projectId}`)}>
                                {proj?.name || '—'}
                              </span>
                            </td>
                            <td><span className="badge badge-blue" style={{ fontSize: 11 }}>{t.subset || 'Train'}</span></td>
                            <td>
                              <select className="input" style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
                                value={t.assigneeId || ''}
                                onChange={e => handleAssignTask(t.id, e.target.value)}>
                                <option value="">Unassigned</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                              </select>
                            </td>
                            <td style={{ fontSize: 13 }}>{tdone}/{tjobs.length}</td>
                            <td style={{ minWidth: 140 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1 }}><ProgressBar value={pct(tdone, tjobs.length)} color={pct(tdone, tjobs.length) === 100 ? '#52c41a' : '#1890ff'} /></div>
                                <span style={{ fontSize: 12, color: '#8c8c8c', width: 34, textAlign: 'right' }}>{pct(tdone, tjobs.length)}%</span>
                              </div>
                            </td>
                            <td>
                              <button className="btn btn-default btn-sm" onClick={() => navigate(`/projects/${t.projectId}`)}>View</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredTasks.length === 0 && <div className="empty-state"><p>No tasks found</p></div>}
                </div>
              </div>
            )}

            {/* ── JOBS TAB ── */}
            {activeTab === 'jobs' && (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="search-bar" style={{ width: 240 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input placeholder="Search by task or project..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <select className="input" style={{ width: 200 }} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                    <option value="">All projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Task / Project</th>
                        <th>Stage</th>
                        <th>State</th>
                        <th>Assignee</th>
                        <th>Frames</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((j, idx) => (
                        <tr key={j.id}>
                          <td style={{ fontWeight: 600, fontSize: 13, color: '#1890ff', cursor: 'pointer' }} onClick={() => navigate(`/jobs/${j.id}/annotate`)}>
                            Job #{idx + 1}
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{j.task?.name}</div>
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{j.project?.name}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${STAGE_COLOR[j.stage] || '#8c8c8c'}18`, color: STAGE_COLOR[j.stage] || '#8c8c8c', fontWeight: 600, textTransform: 'capitalize' }}>
                              {j.stage}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${STATE_COLOR[j.state] || '#8c8c8c'}18`, color: STATE_COLOR[j.state] || '#8c8c8c', fontWeight: 600, textTransform: 'capitalize' }}>
                              {j.state?.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <select className="input" style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
                              value={j.assigneeId || ''}
                              onChange={e => handleAssignJob(j.id, e.target.value)}>
                              <option value="">Unassigned</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                            </select>
                          </td>
                          <td style={{ fontSize: 12, color: '#595959' }}>{j.frameStart}–{j.frameEnd} ({j.frameEnd - j.frameStart + 1} frames)</td>
                          <td>
                            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/jobs/${j.id}/annotate`)}>Open</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredJobs.length === 0 && <div className="empty-state"><p>No jobs found</p></div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
