import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';

interface Job {
  id: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  totalFrames: number;
  annotatedFrames: number;
  shapeCount: number;
  lastAnnotatedAt: string | null;
  assignee: string | null;
}

interface Task {
  id: string;
  name: string;
  jobs: Job[];
}

interface Project {
  id: string;
  name: string;
  dataType: string;
  tasks: Task[];
}

interface Tenant {
  id: string;
  name: string;
  projects: Project[];
}

interface JobAnnotationDoc {
  jobId: string;
  exportedAt: string;
  frameCount: number;
  frames: {
    frameNumber: number;
    annotationId: string;
    fileName: string | null;
    fileUrl: string | null;
    status: string;
    updatedAt: string;
    shapes: any[];
    tags: any[];
    tracks: any[];
    notes: string | null;
  }[];
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

function timeAgo(date: string | null) {
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── JSON Viewer Modal ──────────────────────────────────────────────────────────

function JsonModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [doc, setDoc] = useState<JobAnnotationDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [frameIdx, setFrameIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    client.get(`/annotations/job/${jobId}`)
      .then(r => { setDoc(r.data); setLoading(false); })
      .catch(() => { setError('Failed to load annotation data'); setLoading(false); });
  }, [jobId]);

  const currentFrame = doc?.frames[frameIdx];
  const jsonText = currentFrame ? JSON.stringify({
    frameNumber: currentFrame.frameNumber,
    fileName: currentFrame.fileName,
    status: currentFrame.status,
    updatedAt: currentFrame.updatedAt,
    shapes: currentFrame.shapes,
    tags: currentFrame.tags,
    tracks: currentFrame.tracks,
    notes: currentFrame.notes,
  }, null, 2) : '';

  const fullJson = doc ? JSON.stringify(doc, null, 2) : '';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([fullJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-${jobId.slice(0, 8)}-annotations.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#1a1a2e', borderRadius: 12, width: '85vw', maxWidth: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #2a2a4a', background: '#141428' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4dabf7" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 14 }}>
              Annotation JSON — job <code style={{ background: '#2a2a4a', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{jobId.slice(0, 8)}…</code>
            </span>
            {doc && <span style={{ color: '#6c6c8a', fontSize: 12 }}>{doc.frameCount} frame{doc.frameCount !== 1 ? 's' : ''}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleCopy(fullJson)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: '#2a2a4a', border: 'none', cursor: 'pointer', fontSize: 12, color: copied ? '#52c41a' : '#a0a0c0' }}>
              {copied ? '✓ Copied' : 'Copy all'}
            </button>
            <button onClick={handleDownload} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: '#1890ff', border: 'none', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download JSON
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: '#2a2a4a', border: 'none', cursor: 'pointer', color: '#a0a0c0', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c8a' }}>
            <span className="spinner" />
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4f' }}>{error}</div>
        ) : doc && doc.frameCount === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c8a', flexDirection: 'column', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>No annotation data saved yet for this job</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* Frame list sidebar */}
            <div style={{ width: 180, borderRight: '1px solid #2a2a4a', overflowY: 'auto', background: '#141428' }}>
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#6c6c8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Frames</div>
              {doc!.frames.map((f, i) => (
                <button key={f.frameNumber} onClick={() => setFrameIdx(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: frameIdx === i ? 'rgba(77,171,247,0.15)' : 'none', border: 'none', cursor: 'pointer', borderLeft: frameIdx === i ? '3px solid #4dabf7' : '3px solid transparent' }}>
                  <div style={{ fontSize: 12, color: frameIdx === i ? '#4dabf7' : '#a0a0c0', fontWeight: frameIdx === i ? 600 : 400 }}>
                    Frame {f.frameNumber}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 10, color: f.shapes?.length > 0 ? '#52c41a' : '#6c6c8a' }}>
                    {f.shapes?.length || 0} shapes
                  </div>
                </button>
              ))}
            </div>

            {/* JSON pane */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {currentFrame && (
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #2a2a4a', display: 'flex', alignItems: 'center', gap: 12, background: '#111124' }}>
                  <span style={{ fontSize: 12, color: '#6c6c8a' }}>Frame {currentFrame.frameNumber}</span>
                  {currentFrame.fileName && <span style={{ fontSize: 12, color: '#a0a0c0' }}>{currentFrame.fileName}</span>}
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: STATE_COLOR[currentFrame.status]?.bg || '#f5f5f5', color: STATE_COLOR[currentFrame.status]?.color || '#8c8c8c', fontWeight: 600, textTransform: 'capitalize' }}>
                    {currentFrame.status}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6c6c8a' }}>{currentFrame.shapes?.length || 0} shapes · updated {timeAgo(currentFrame.updatedAt)}</span>
                  <button onClick={() => handleCopy(jsonText)}
                    style={{ padding: '3px 10px', borderRadius: 5, background: '#2a2a4a', border: 'none', cursor: 'pointer', fontSize: 11, color: '#a0a0c0' }}>
                    Copy frame
                  </button>
                </div>
              )}
              <pre style={{ flex: 1, margin: 0, padding: '16px 20px', overflowY: 'auto', fontSize: 12.5, lineHeight: 1.6, color: '#c9d1d9', background: '#0d0d1a', fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace' }}>
                {jsonText}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Jobs table ─────────────────────────────────────────────────────────────────

function JobsTable({ jobs }: { jobs: Job[] }) {
  const navigate = useNavigate();
  const [viewJsonJobId, setViewJsonJobId] = useState<string | null>(null);

  return (
    <>
      {viewJsonJobId && <JsonModal jobId={viewJsonJobId} onClose={() => setViewJsonJobId(null)} />}
      <div className="table-wrap" style={{ margin: '0 0 0 24px' }}>
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
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
            {jobs.map(j => (
              <tr key={j.id}>
                <td style={{ fontWeight: 500, fontSize: 12, color: '#8c8c8c', fontFamily: 'monospace' }}>
                  <div>{j.id.slice(0, 8)}…</div>
                  <div style={{ fontSize: 11 }}>frames {j.frameStart ?? 0}–{j.frameEnd ?? j.totalFrames - 1}</div>
                </td>
                <td><Badge label={j.stage} style={STAGE_COLOR[j.stage] || STAGE_COLOR.annotation} /></td>
                <td><Badge label={j.state} style={STATE_COLOR[j.state] || STATE_COLOR.new} /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{j.annotatedFrames}</span>
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>/ {j.totalFrames}</span>
                    <div style={{ flex: 1, maxWidth: 80, height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${j.totalFrames > 0 ? (j.annotatedFrames / j.totalFrames) * 100 : 0}%`, background: '#1890ff', borderRadius: 2 }} />
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight: 600 }}>{j.shapeCount.toLocaleString()}</td>
                <td style={{ color: '#8c8c8c', fontSize: 13 }}>{j.assignee || '—'}</td>
                <td style={{ color: '#8c8c8c', fontSize: 13, whiteSpace: 'nowrap' }}>{timeAgo(j.lastAnnotatedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {j.annotatedFrames > 0 && (
                      <button className="btn btn-default btn-sm"
                        onClick={() => setViewJsonJobId(j.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        View JSON
                      </button>
                    )}
                    <button className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/jobs/${j.id}/annotate`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Open Editor
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Tree nodes ─────────────────────────────────────────────────────────────────

function TaskNode({ task }: { task: Task }) {
  const [open, setOpen] = useState(true);
  const totalAnnotated = task.jobs.reduce((s, j) => s + j.annotatedFrames, 0);
  const totalShapes = task.jobs.reduce((s, j) => s + j.shapeCount, 0);

  return (
    <div style={{ borderLeft: '2px solid #e8e8e8', marginLeft: 24, marginBottom: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', color: '#595959', fontSize: 13, fontWeight: 500 }}>
        <ChevronIcon open={open} />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#722ed1" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span>{task.name}</span>
        <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4 }}>{task.jobs.length} job{task.jobs.length !== 1 ? 's' : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8c8c8c' }}>{totalAnnotated} frames · {totalShapes.toLocaleString()} shapes</span>
      </button>
      {open && <JobsTable jobs={task.jobs} />}
    </div>
  );
}

function ProjectNode({ project, navigate }: { project: Project; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(true);
  const totalJobs = project.tasks.reduce((s, t) => s + t.jobs.length, 0);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', gap: 10 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#595959', display: 'flex', alignItems: 'center' }}>
          <ChevronIcon open={open} />
        </button>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1890ff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{project.name}</span>
        <span className="badge badge-gray" style={{ fontSize: 11 }}>{project.dataType}</span>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>{project.tasks.length} task{project.tasks.length !== 1 ? 's' : ''} · {totalJobs} job{totalJobs !== 1 ? 's' : ''}</span>
        <button className="btn btn-default btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/projects/${project.id}`)}>View project</button>
      </div>
      {open && (
        <div style={{ padding: '8px 0' }}>
          {project.tasks.map(task => <TaskNode key={task.id} task={task} />)}
        </div>
      )}
    </div>
  );
}

function TenantNode({ tenant, navigate }: { tenant: Tenant; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(true);
  const totalProjects = tenant.projects.length;
  const totalJobs = tenant.projects.reduce((s, p) => s + p.tasks.reduce((ts, t) => ts + t.jobs.length, 0), 0);

  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: '#f5f5f5', border: 'none', borderBottom: '1px solid #e8e8e8', cursor: 'pointer', padding: '12px 16px', color: '#141414', fontSize: 14, fontWeight: 600 }}>
        <ChevronIcon open={open} />
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fa8c16" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        </svg>
        <span>{tenant.name}</span>
        <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 4 }}>{totalProjects} project{totalProjects !== 1 ? 's' : ''} · {totalJobs} job{totalJobs !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div>
          {tenant.projects.map(project => (
            <ProjectNode key={project.id} project={project} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Annotations() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterState, setFilterState] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/annotations/tree');
      setTree(Array.isArray(data) ? data : []);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered: Tenant[] = tree.map(tenant => ({
    ...tenant,
    projects: tenant.projects.map(project => ({
      ...project,
      tasks: project.tasks.map(task => ({
        ...task,
        jobs: task.jobs.filter(j => {
          if (filterStage && j.stage !== filterStage) return false;
          if (filterState && j.state !== filterState) return false;
          if (q && !project.name.toLowerCase().includes(q) && !task.name.toLowerCase().includes(q)) return false;
          return true;
        }),
      })).filter(t => t.jobs.length > 0),
    })).filter(p => p.tasks.length > 0),
  })).filter(t => t.projects.length > 0);

  const totalJobs   = filtered.reduce((s, t) => s + t.projects.reduce((ps, p) => ps + p.tasks.reduce((ts, tk) => ts + tk.jobs.length, 0), 0), 0);
  const totalFrames = filtered.reduce((s, t) => s + t.projects.reduce((ps, p) => ps + p.tasks.reduce((ts, tk) => ts + tk.jobs.reduce((js, j) => js + j.annotatedFrames, 0), 0), 0), 0);
  const totalShapes = filtered.reduce((s, t) => s + t.projects.reduce((ps, p) => ps + p.tasks.reduce((ts, tk) => ts + tk.jobs.reduce((js, j) => js + j.shapeCount, 0), 0), 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Annotations</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>
              Tenant → Project → Task → Job — click View JSON to inspect annotation data
            </p>
          </div>
          {!loading && (
            <div style={{ display: 'flex', gap: 20 }}>
              <Stat label="Annotated jobs" value={totalJobs} color="#1890ff" />
              <Stat label="Annotated frames" value={totalFrames} color="#722ed1" />
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
          <button className="btn btn-default" style={{ marginLeft: 'auto' }} onClick={load}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <p>{search || filterStage || filterState ? 'No annotations match your filters' : 'No annotations yet'}</p>
            <span>Open a job in the editor and draw shapes to see them here</span>
          </div>
        ) : (
          <div>
            {filtered.map(tenant => (
              <TenantNode key={tenant.id} tenant={tenant} navigate={navigate} />
            ))}
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
