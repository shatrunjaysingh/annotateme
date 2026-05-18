import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

interface Task {
  id: string;
  name: string;
  status: string;
  subset: string;
  frameCount: number;
  annotatedFrames: number;
  thumbnailUrl?: string;
  assignee?: { id: string; username: string };
  issueTracker?: string;
  jobs: Job[];
  createdAt: string;
  updatedAt: string;
}

interface Job {
  id: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  assignee?: { id: string; username: string };
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  dataType: string;
  labelSet: string[];
  assigneeId?: string;
  issueTracker?: string;
  createdAt?: string;
  owner?: string;
}
interface User { id: string; username: string; }

// ── Label types ───────────────────────────────────────────────────────────
const LABEL_TYPES = ['any', 'rectangle', 'polygon', 'polyline', 'points', 'ellipse', 'cuboid', 'skeleton', 'mask', 'tag'] as const;
const ATTR_INPUT_TYPES = ['select', 'radio', 'checkbox', 'text', 'number'] as const;
type AttrInputType = typeof ATTR_INPUT_TYPES[number];

interface LabelAttribute {
  id: string;
  name: string;
  input_type: AttrInputType;
  mutable: boolean;
  values: string[];
  default_value?: string;
}

interface SkeletonPoint { id: number; name: string; x: number; y: number; }
interface SkeletonDef { points: SkeletonPoint[]; edges: [number, number][]; }

interface LabelForm {
  name: string;
  type: string;
  color: string;
  attributes: LabelAttribute[];
  skeleton?: SkeletonDef;
}

interface LabelRecord {
  id: string;
  name: string;
  type: string;
  color: string;
  attributes: LabelAttribute[];
  metadata?: { skeleton?: SkeletonDef } | null;
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

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function durationHours(job: Job) {
  const ms = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime();
  return Math.max(0, Math.round(ms / 3600000));
}

// ── Shared dropdown helpers ────────────────────────────────────────────────
function DropMenu({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'absolute', background: '#fff', border: '1px solid #e8e8e8',
      borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
      minWidth: 210, zIndex: 9999, overflow: 'visible', ...style,
    }}>
      {children}
    </div>
  );
}

function MI({ label, icon, onClick, danger }: { label: string; icon?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: danger ? '#ff4d4f' : '#262626', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#fff1f0' : '#f5f5f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}>
      {icon && <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>}
      {label}
    </button>
  );
}
function MDivider() { return <div style={{ height: 1, background: '#f0f0f0', margin: '3px 0' }} />; }

// ──────────────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskSearch, setTaskSearch] = useState('');

  // Editing state
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const [editingIssue, setEditingIssue] = useState(false);
  const [issueVal, setIssueVal] = useState('');
  const [labelTab, setLabelTab] = useState<'raw' | 'constructor'>('constructor');

  // Menus open
  const [actionsOpen, setActionsOpen] = useState(false);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [jobMenuId, setJobMenuId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'coco' | 'yolo' | 'pascal_voc'>('coco');
  const [exporting, setExporting] = useState(false);

  // Modals
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAddJob, setShowAddJob] = useState<string | null>(null);
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [labelForm, setLabelForm] = useState<LabelForm>({ name: '', type: 'any', color: '#1890ff', attributes: [] });
  const [editingLabel, setEditingLabel] = useState<LabelRecord | null>(null);
  const [projectLabels, setProjectLabels] = useState<LabelRecord[]>([]);
  const [showSkeletonModal, setShowSkeletonModal] = useState(false);
  const [skeletonTargetLabel, setSkeletonTargetLabel] = useState<LabelRecord | null>(null);
  const [skeletonDef, setSkeletonDef] = useState<SkeletonDef>({ points: [], edges: [] });
  const [skeletonConnecting, setSkeletonConnecting] = useState<number | null>(null);

  const [taskForm, setTaskForm] = useState({ name: '', subset: 'Train', assigneeId: '' });
  const [jobForm, setJobForm] = useState({ jobType: 'Ground truth', frameSelection: 'Random', quantity: 5, frameCount: 1, seed: '' });
  const [saving, setSaving] = useState(false);

  const actionsRef = useRef<HTMLDivElement>(null);
  const importTaskRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
      if (!(e.target as HTMLElement).closest('.task-menu-wrap')) setTaskMenuId(null);
      if (!(e.target as HTMLElement).closest('.job-menu-wrap')) setJobMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projRes, taskRes] = await Promise.all([
        client.get(`/projects/${id}`),
        client.get(`/tasks?projectId=${id}`),
      ]);
      setProject(projRes.data);
      setTasks(taskRes.data);
      try { const { data: u } = await client.get('/users'); setUsers(u); } catch { /* non-admin */ }
    } catch { navigate('/projects'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  // ── Project-level saves ────────────────────────────────────────────────
  const saveProjectField = async (fields: Partial<Project>) => {
    try { await client.patch(`/projects/${id}`, fields); load(); } catch { /* no-op */ }
  };

  const handleSaveName = async () => {
    if (nameVal.trim()) await saveProjectField({ name: nameVal.trim() });
    setEditingName(false);
  };

  const handleSaveDesc = async () => {
    await saveProjectField({ description: descVal });
    setEditingDesc(false);
  };

  const handleSaveIssue = async () => {
    await saveProjectField({ issueTracker: issueVal });
    setEditingIssue(false);
  };

  const handleAssignProject = async (assigneeId: string) => {
    await saveProjectField({ assigneeId: assigneeId || undefined });
  };

  const loadLabels = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await client.get(`/labels/${id}`);
      setProjectLabels(data.labels || []);
    } catch { /* no-op */ }
  }, [id]);

  useEffect(() => { loadLabels(); }, [loadLabels]);

  const openAddLabel = () => {
    setEditingLabel(null);
    setLabelForm({ name: '', type: 'any', color: '#1890ff', attributes: [] });
    setShowAddLabel(true);
  };

  const openEditLabel = (lbl: LabelRecord) => {
    setEditingLabel(lbl);
    setLabelForm({ name: lbl.name, type: lbl.type || 'any', color: lbl.color || '#1890ff', attributes: lbl.attributes || [] });
    setShowAddLabel(true);
  };

  const handleSaveLabel = async () => {
    const name = labelForm.name.trim();
    if (!name || !project) return;
    setSaving(true);
    try {
      if (editingLabel) {
        await client.patch(`/labels/${id}/labels/${editingLabel.id}`, {
          name, type: labelForm.type, color: labelForm.color, attributes: labelForm.attributes,
        });
      } else {
        await client.post(`/labels/${id}/create`, {
          name, type: labelForm.type, color: labelForm.color, attributes: labelForm.attributes,
        });
      }
      setShowAddLabel(false); loadLabels(); load();
    } catch { /* no-op */ }
    finally { setSaving(false); }
  };

  const handleDeleteLabel = async (labelId: string) => {
    const ok = await confirm({ title: 'Delete label?', message: 'This label will be permanently removed from the project.', confirmLabel: 'Delete label', variant: 'danger' });
    if (!ok) return;
    try {
      await client.delete(`/labels/${id}/labels/${labelId}`);
      toast.success('Label deleted');
      loadLabels(); load();
    } catch { toast.error('Failed to delete label'); }
  };

  const openSkeletonModal = (lbl?: LabelRecord) => {
    const target = lbl || null;
    setSkeletonTargetLabel(target);
    const existing = target?.metadata?.skeleton;
    setSkeletonDef(existing ? { points: [...existing.points], edges: [...existing.edges] } : { points: [], edges: [] });
    setSkeletonConnecting(null);
    setShowSkeletonModal(true);
  };

  const skeletonAddPoint = () => {
    const id = skeletonDef.points.length > 0 ? Math.max(...skeletonDef.points.map(p => p.id)) + 1 : 0;
    const angle = (skeletonDef.points.length * 45 * Math.PI) / 180;
    const cx = 0.5 + 0.35 * Math.cos(angle);
    const cy = 0.5 + 0.35 * Math.sin(angle);
    setSkeletonDef(d => ({ ...d, points: [...d.points, { id, name: `point_${id}`, x: cx, y: cy }] }));
  };

  const skeletonRemovePoint = (pid: number) => {
    setSkeletonDef(d => ({
      points: d.points.filter(p => p.id !== pid),
      edges: d.edges.filter(([a, b]) => a !== pid && b !== pid),
    }));
    if (skeletonConnecting === pid) setSkeletonConnecting(null);
  };

  const skeletonClickPoint = (pid: number) => {
    if (skeletonConnecting === null) {
      setSkeletonConnecting(pid);
    } else if (skeletonConnecting === pid) {
      setSkeletonConnecting(null);
    } else {
      const a = Math.min(skeletonConnecting, pid);
      const b = Math.max(skeletonConnecting, pid);
      const exists = skeletonDef.edges.some(([ea, eb]) => ea === a && eb === b);
      setSkeletonDef(d => ({
        ...d,
        edges: exists ? d.edges.filter(([ea, eb]) => !(ea === a && eb === b)) : [...d.edges, [a, b]],
      }));
      setSkeletonConnecting(null);
    }
  };

  const handleSaveSkeleton = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const metadata = { skeleton: skeletonDef };
      if (skeletonTargetLabel) {
        await client.patch(`/labels/${id}/labels/${skeletonTargetLabel.id}`, {
          type: 'skeleton', metadata,
        });
      } else {
        await client.post(`/labels/${id}/create`, {
          name: 'skeleton', type: 'skeleton', color: '#722ed1',
          attributes: [], metadata,
        });
      }
      setShowSkeletonModal(false);
      loadLabels();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to save skeleton');
    } finally { setSaving(false); }
  };

  const addAttribute = () => {
    const newAttr: LabelAttribute = {
      id: `new_${Date.now()}`, name: '', input_type: 'select', mutable: false, values: [],
    };
    setLabelForm(f => ({ ...f, attributes: [...f.attributes, newAttr] }));
  };

  const updateAttribute = (idx: number, patch: Partial<LabelAttribute>) => {
    setLabelForm(f => {
      const attrs = [...f.attributes];
      attrs[idx] = { ...attrs[idx], ...patch };
      return { ...f, attributes: attrs };
    });
  };

  const removeAttribute = (idx: number) => {
    setLabelForm(f => ({ ...f, attributes: f.attributes.filter((_, i) => i !== idx) }));
  };

  // ── Project actions ────────────────────────────────────────────────────
  const handleOpenExportModal = () => { setActionsOpen(false); setShowExportModal(true); };

  const handleExportForTraining = async () => {
    setExporting(true);
    try {
      const res = await client.get(`/import-export/${id}/export?format=${exportFormat}&download=true`, { responseType: 'blob' });
      const ext = exportFormat === 'pascal_voc' ? 'xml.json' : 'json';
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name ?? 'project'}-${exportFormat}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      toast.success('Export downloaded', `${exportFormat.toUpperCase()} format ready.`);
    } catch {
      toast.error('Export failed', 'Could not export in this format.');
    } finally { setExporting(false); }
  };

  const handleDownloadAnnotations = async () => {
    setActionsOpen(false);
    try {
      const res = await client.get(`/import-export/${id}/annotations/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name ?? 'project'}-annotations.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Annotations downloaded');
    } catch (err: any) {
      // Parse error body from blob response
      let msg = 'Could not export annotations.';
      try {
        const text = await err?.response?.data?.text?.();
        const parsed = text ? JSON.parse(text) : null;
        if (parsed?.error) msg = parsed.error;
      } catch { /* ignore parse failure */ }
      toast.error('Download failed', msg);
    }
  };

  const handleProjectImport = () => { setActionsOpen(false); document.getElementById('proj-import-inp')?.click(); };

  const handleProjectImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await client.post(`/import-export/import?projectId=${id}`, data);
      alert('Imported.'); load();
    } catch { alert('Import failed.'); }
    e.target.value = '';
  };

  const handleProjectBackup = async () => {
    setActionsOpen(false);
    try {
      const [p, t] = await Promise.all([client.get(`/projects/${id}`), client.get(`/tasks?projectId=${id}`)]);
      const blob = new Blob([JSON.stringify({ project: p.data, tasks: t.data, exportedAt: new Date().toISOString() }, null, 2)]);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-${project?.name}-${Date.now()}.json`; a.click();
    } catch { toast.error('Backup failed'); }
  };

  const handleProjectDelete = async () => {
    setActionsOpen(false);
    const ok = await confirm({ title: `Delete project?`, message: `"${project?.name}" and all its tasks will be permanently deleted.`, confirmLabel: 'Delete project', variant: 'danger' });
    if (!ok) return;
    try { await client.delete(`/projects/${id}`); navigate('/projects'); } catch { toast.error('Delete failed'); }
  };

  // ── Task actions ───────────────────────────────────────────────────────
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault(); if (!taskForm.name) return;
    setSaving(true);
    try {
      await client.post('/tasks', { projectId: id, name: taskForm.name, subset: taskForm.subset, assigneeId: taskForm.assigneeId || undefined });
      setShowCreateTask(false); setTaskForm({ name: '', subset: 'Train', assigneeId: '' }); load();
    } catch { /* no-op */ } finally { setSaving(false); }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTaskMenuId(null);
    const ok = await confirm({ title: 'Delete task?', message: 'This task and all its jobs and annotations will be deleted.', confirmLabel: 'Delete task', variant: 'danger' });
    if (!ok) return;
    try { await client.delete(`/tasks/${taskId}`); toast.success('Task deleted'); load(); } catch { toast.error('Failed to delete task'); }
  };

  const handleTaskExport = async (taskId: string, name: string) => {
    setTaskMenuId(null);
    try {
      const res = await client.get(`/import-export/export?taskId=${taskId}&format=json`, { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([res.data])); a.download = `task-${name}.json`; a.click();
    } catch { toast.error('Export failed'); }
  };

  const handleTaskImport = (taskId: string) => { setTaskMenuId(null); importTaskRef.current[taskId]?.click(); };

  const handleTaskImportFile = async (taskId: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const data = JSON.parse(await files[0].text());
      for (const frame of (data.frames || [])) {
        await client.post(`/jobs/${frame.jobId}/frame/${frame.frameNumber}`, { shapes: frame.shapes || [], tags: [], tracks: [] });
      }
      alert('Imported.'); load();
    } catch { alert('Import failed.'); }
  };

  const handleAssignTask = async (taskId: string, assigneeId: string) => {
    try { await client.patch(`/tasks/${taskId}`, { assigneeId: assigneeId || null }); load(); } catch { /* no-op */ }
  };

  const handleFileUpload = async (taskId: string, files: FileList) => {
    if (!files.length) return;
    setUploadingTaskId(taskId);
    const form = new FormData();
    form.append('taskId', taskId);
    for (const f of Array.from(files)) form.append('files', f);
    try { await client.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }); load(); }
    catch { /* no-op */ } finally { setUploadingTaskId(null); }
  };

  // ── Job actions ────────────────────────────────────────────────────────
  const handleAssignJob = async (jobId: string, assigneeId: string) => {
    try { await client.patch(`/jobs/${jobId}`, { assigneeId: assigneeId || null }); load(); } catch { /* no-op */ }
  };
  const handleJobStage = async (jobId: string, stage: string) => {
    try { await client.patch(`/jobs/${jobId}`, { stage }); load(); } catch { /* no-op */ }
  };
  const handleJobState = async (jobId: string, state: string) => {
    try { await client.patch(`/jobs/${jobId}`, { state }); load(); } catch { /* no-op */ }
  };
  const handleJobExport = async (jobId: string) => {
    setJobMenuId(null);
    try {
      const res = await client.get(`/jobs/${jobId}/export`, { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([res.data])); a.download = `job-${jobId}.json`; a.click();
    } catch { toast.error('Export failed'); }
  };
  const handleDeleteJob = async (jobId: string) => {
    setJobMenuId(null);
    const ok = await confirm({ title: 'Delete job?', message: 'This job and all its annotations will be permanently deleted.', confirmLabel: 'Delete job', variant: 'danger' });
    if (!ok) return;
    try { await client.delete(`/jobs/${jobId}`); toast.success('Job deleted'); load(); } catch { toast.error('Failed to delete job'); }
  };
  const handleAddJob = async (taskId: string) => {
    setSaving(true);
    try {
      const task = tasks.find(t => t.id === taskId);
      const totalFrames = task?.frameCount || 10;
      const framesPerJob = Math.max(1, jobForm.frameCount);
      const qty = Math.max(1, jobForm.quantity);

      // Distribute frames across the requested number of jobs
      const frameSlices: { start: number; end: number }[] = [];
      if (jobForm.frameSelection === 'Manual') {
        // Equal slices across total frames
        const slice = Math.max(1, Math.floor(totalFrames / qty));
        for (let i = 0; i < qty; i++) {
          const start = i * slice;
          const end = Math.min(start + framesPerJob - 1, totalFrames - 1);
          frameSlices.push({ start, end });
        }
      } else {
        // Random: one job covering all frames (or framesPerJob)
        for (let i = 0; i < qty; i++) {
          const start = Math.floor(Math.random() * Math.max(1, totalFrames - framesPerJob));
          frameSlices.push({ start, end: start + framesPerJob - 1 });
        }
      }

      const stage = jobForm.jobType === 'Ground truth' ? 'acceptance' : 'annotation';
      const type = jobForm.jobType === 'Ground truth' ? 'ground_truth' : 'annotation';
      for (const slice of frameSlices) {
        await client.post(`/tasks/${taskId}/jobs`, {
          frameStart: slice.start,
          frameEnd: Math.min(slice.end, totalFrames - 1),
          stage,
          type,
        });
      }

      setShowAddJob(null);
      setJobForm({ jobType: 'Ground truth', frameSelection: 'Random', quantity: 5, frameCount: 1, seed: '' });
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      alert(`Failed to create job: ${msg}`);
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
    </div>
  );

  // Group tasks by subset
  const subsetOrder = ['Train', 'Validation', 'Test'];
  const filteredTasks = tasks.filter(t =>
    !taskSearch || t.name.toLowerCase().includes(taskSearch.toLowerCase())
  );
  const tasksBySubset = subsetOrder
    .map(s => ({ subset: s, tasks: filteredTasks.filter(t => t.subset === s) }))
    .filter(g => g.tasks.length > 0);
  const uncategorized = filteredTasks.filter(t => !subsetOrder.includes(t.subset));

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <input id="proj-import-inp" type="file" accept=".json" style={{ display: 'none' }} onChange={handleProjectImportFile} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>

        {/* ── Top bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Link to="/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1890ff', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to projects
          </Link>

          {/* Actions dropdown */}
          <div ref={actionsRef} style={{ position: 'relative' }}>
            <button onClick={() => setActionsOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Actions
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            {actionsOpen && (
              <DropMenu style={{ top: '100%', right: 0, marginTop: 6 }}>
                <MI icon="↓" label="Download annotations (JSON)" onClick={handleDownloadAnnotations} />
                <MI icon="↓" label="Export for training…" onClick={handleOpenExportModal} />
                <MI icon="↑" label="Import dataset" onClick={handleProjectImport} />
                <MI icon="⊙" label="Backup project" onClick={handleProjectBackup} />
                <MDivider />
                <MI icon="📊" label="View analytics" onClick={() => { setActionsOpen(false); navigate('/analytics'); }} />
                <MI icon="📋" label="View report" onClick={() => { setActionsOpen(false); navigate('/reports'); }} />
                <MDivider />
                <MI icon="🗑" label="Delete project" onClick={handleProjectDelete} danger />
              </DropMenu>
            )}
          </div>
        </div>

        {/* ── Project card ── */}
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: 28, marginBottom: 20, position: 'relative' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ flex: 1, marginRight: 24 }}>
              {editingName ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input autoFocus className="input" value={nameVal} onChange={e => setNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    style={{ fontSize: 22, fontWeight: 700, padding: '2px 8px', width: 320 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleSaveName}>Save</button>
                  <button className="btn btn-default btn-sm" onClick={() => setEditingName(false)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{project?.name}</h1>
                  <button onClick={() => { setNameVal(project?.name || ''); setEditingName(true); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1890ff', padding: 2 }} title="Edit name">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8c8c8c' }}>
                Project #{project?.id?.slice(-4)} created by {project?.owner || 'admin'} on {fmtDate(project?.createdAt)}
              </p>
            </div>

            {/* Assigned to (project level) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>Assigned to</span>
              <select className="input" style={{ minWidth: 160, fontSize: 13 }}
                value={(project as any)?.assigneeId || ''}
                onChange={e => handleAssignProject(e.target.value)}>
                <option value="">Select a user</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginTop: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Project description</div>
            {editingDesc ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea className="input" rows={3} autoFocus value={descVal} onChange={e => setDescVal(e.target.value)}
                  style={{ fontSize: 13, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveDesc}>Save</button>
                  <button className="btn btn-default btn-sm" onClick={() => setEditingDesc(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {project?.description
                  ? <p style={{ margin: 0, fontSize: 13, color: '#595959' }}>{project.description}</p>
                  : null}
                <button className="btn btn-default btn-sm"
                  onClick={() => { setDescVal(project?.description || ''); setEditingDesc(true); }}>
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Issue Tracker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Issue Tracker</span>
              <button onClick={() => { setIssueVal((project as any)?.issueTracker || ''); setEditingIssue(true); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1890ff', padding: 2 }} title="Edit issue tracker">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            {editingIssue ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input autoFocus className="input" type="url" value={issueVal} onChange={e => setIssueVal(e.target.value)}
                  placeholder="https://github.com/org/repo/issues/1" style={{ flex: 1, fontSize: 13 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveIssue(); if (e.key === 'Escape') setEditingIssue(false); }} />
                <button className="btn btn-primary btn-sm" onClick={handleSaveIssue}>Save</button>
                <button className="btn btn-default btn-sm" onClick={() => setEditingIssue(false)}>Cancel</button>
              </div>
            ) : (
              (project as any)?.issueTracker &&
              <a href={(project as any).issueTracker} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1890ff' }}>
                {(project as any).issueTracker}
              </a>
            )}
          </div>

          {/* Label Constructor */}
          <div>
            <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', marginBottom: 16 }}>
              {(['raw', 'constructor'] as const).map(tab => (
                <button key={tab} onClick={() => setLabelTab(tab)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderBottom: `2px solid ${labelTab === tab ? '#1890ff' : 'transparent'}`, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: labelTab === tab ? 600 : 400, color: labelTab === tab ? '#1890ff' : '#595959', marginBottom: -1 }}>
                  {tab === 'raw'
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {labelTab === 'constructor' ? (
              <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 16, minHeight: 80 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={openAddLabel}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#262626' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    Add label
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  </button>
                  <button onClick={() => openSkeletonModal()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#262626' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    Setup skeleton
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  </button>
                  {/* Existing labels as chips */}
                  {projectLabels.map(lbl => (
                    <span key={lbl.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 6px', background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 20, fontSize: 12, color: '#262626' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: lbl.color || '#1890ff', flexShrink: 0 }} />
                      {lbl.name}
                      {lbl.type && lbl.type !== 'any' && <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>({lbl.type})</span>}
                      {lbl.type === 'skeleton' && <button onClick={() => openSkeletonModal(lbl)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', color: '#722ed1', fontSize: 11, lineHeight: 1 }} title="Edit skeleton">⬡</button>}
                      <button onClick={() => openEditLabel(lbl)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', color: '#8c8c8c', fontSize: 11, lineHeight: 1 }} title="Edit">✎</button>
                      <button onClick={() => handleDeleteLabel(lbl.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', color: '#ff4d4f', fontSize: 11, lineHeight: 1 }} title="Delete">✕</button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 16, minHeight: 80, fontFamily: 'monospace', fontSize: 12, color: '#595959', background: '#fafafa', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {projectLabels.length
                  ? JSON.stringify(projectLabels.map(l => ({ name: l.name, type: l.type, color: l.color, attributes: l.attributes })), null, 2)
                  : <span style={{ color: '#bfbfbf' }}>No labels defined</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Tasks toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 240 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search tasks..." value={taskSearch} onChange={e => setTaskSearch(e.target.value)} />
          </div>
          <button className="btn btn-default btn-sm">Select all</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-default btn-sm">Sort by ☰</button>
          <button className="btn btn-default btn-sm">Quick filters ▾</button>
          <button className="btn btn-default btn-sm">Filter ▾</button>
          <button className="btn btn-default btn-sm" style={{ color: '#bfbfbf' }}>Clear filters</button>
          <button className="btn btn-default btn-sm" title="Download all annotations">↓</button>
          <button className="btn btn-primary btn-sm" style={{ borderRadius: 6, padding: '5px 14px', fontWeight: 600 }} onClick={() => setShowCreateTask(true)}>+</button>
        </div>

        {/* ── Tasks grouped by Subset ── */}
        {filteredTasks.length === 0 ? (
          <div className="empty-state" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: 60 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            <p>No tasks yet</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreateTask(true)}>Create Task</button>
          </div>
        ) : (
          <>
            {[...tasksBySubset, ...(uncategorized.length ? [{ subset: 'Other', tasks: uncategorized }] : [])].map(group => (
              <div key={group.subset} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#262626', marginBottom: 10 }}>{group.subset}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {group.tasks.map((task, ti) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      taskIndex={ti}
                      users={users}
                      expandedTaskId={expandedTaskId}
                      setExpandedTaskId={setExpandedTaskId}
                      taskMenuId={taskMenuId}
                      setTaskMenuId={setTaskMenuId}
                      jobMenuId={jobMenuId}
                      setJobMenuId={setJobMenuId}
                      uploadingTaskId={uploadingTaskId}
                      importTaskRef={importTaskRef}
                      project={project}
                      onFileUpload={handleFileUpload}
                      onTaskImportFile={handleTaskImportFile}
                      onTaskImport={handleTaskImport}
                      onTaskExport={handleTaskExport}
                      onDeleteTask={handleDeleteTask}
                      onAssignTask={handleAssignTask}
                      onAssignJob={handleAssignJob}
                      onJobStage={handleJobStage}
                      onJobState={handleJobState}
                      onJobExport={handleJobExport}
                      onDeleteJob={handleDeleteJob}
                      onAddJob={(taskId: string) => { setShowAddJob(taskId); setJobForm({ jobType: 'Ground truth', frameSelection: 'Random', quantity: 5, frameCount: 1, seed: '' }); }}
                      navigate={navigate}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showExportModal && (
        <Modal
          title="Export for Training"
          onClose={() => setShowExportModal(false)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExportForTraining} disabled={exporting}>
                {exporting ? <><span className="spinner spinner-sm" /> Exporting…</> : 'Download'}
              </button>
            </>
          }>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            Choose the format your ML framework expects. The file will download immediately.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              { value: 'coco',       label: 'COCO JSON',    desc: 'Detectron2, MMDetection, COCO API' },
              { value: 'yolo',       label: 'YOLO',         desc: 'Ultralytics YOLOv5/v8, Darknet' },
              { value: 'pascal_voc', label: 'Pascal VOC',   desc: 'Older pipelines, LabelImg' },
            ] as const).map(opt => (
              <label key={opt.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 8, border: `2px solid ${exportFormat === opt.value ? '#2563eb' : '#e5e7eb'}`,
                background: exportFormat === opt.value ? '#eff6ff' : '#fff',
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}>
                <input
                  type="radio"
                  name="export-format"
                  value={opt.value}
                  checked={exportFormat === opt.value}
                  onChange={() => setExportFormat(opt.value)}
                  style={{ marginTop: 2, accentColor: '#2563eb' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {showCreateTask && (
        <Modal title="Create New Task" onClose={() => setShowCreateTask(false)}
          footer={<><button className="btn btn-default" onClick={() => setShowCreateTask(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateTask} disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button></>}>
          <form onSubmit={handleCreateTask}>
            <div className="form-group"><label className="form-label required">Task Name</label><input className="input" value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Batch 1" required autoFocus /></div>
            <div className="form-group"><label className="form-label">Subset</label>
              <select className="input" value={taskForm.subset} onChange={e => setTaskForm(f => ({ ...f, subset: e.target.value }))}>
                <option value="Train">Train</option><option value="Test">Test</option><option value="Validation">Validation</option>
              </select>
            </div>
            {users.length > 0 && <div className="form-group"><label className="form-label">Assign to</label>
              <select className="input" value={taskForm.assigneeId} onChange={e => setTaskForm(f => ({ ...f, assigneeId: e.target.value }))}>
                <option value="">Select user...</option>{users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select></div>}
          </form>
        </Modal>
      )}

      {showAddJob && (
        <Modal title="Add a new job" onClose={() => setShowAddJob(null)}
          footer={<><button className="btn btn-default" onClick={() => setShowAddJob(null)}>Cancel</button><button className="btn btn-primary" onClick={() => handleAddJob(showAddJob!)} disabled={saving}>{saving ? <span className="spinner" /> : 'Submit'}</button></>}>
          <div className="form-group"><label className="form-label required">Job type</label>
            <select className="input" value={jobForm.jobType} onChange={e => setJobForm(f => ({ ...f, jobType: e.target.value }))}>
              <option>Ground truth</option><option>Regular</option><option>Honeypot</option>
            </select></div>
          <div className="form-group"><label className="form-label required">Frame selection method</label>
            <select className="input" value={jobForm.frameSelection} onChange={e => setJobForm(f => ({ ...f, frameSelection: e.target.value }))}>
              <option>Random</option><option>Manual</option>
            </select></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="form-label required">Quantity <span title="Number of jobs" style={{ color: '#8c8c8c', cursor: 'help' }}>ⓘ</span></label><input className="input" type="number" min={1} value={jobForm.quantity} onChange={e => setJobForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} /></div>
            <div className="form-group"><label className="form-label required">Frame count <span title="Frames per job" style={{ color: '#8c8c8c', cursor: 'help' }}>ⓘ</span></label><input className="input" type="number" min={1} value={jobForm.frameCount} onChange={e => setJobForm(f => ({ ...f, frameCount: parseInt(e.target.value) || 1 }))} /></div>
            <div className="form-group"><label className="form-label">Seed</label><input className="input" value={jobForm.seed} onChange={e => setJobForm(f => ({ ...f, seed: e.target.value }))} placeholder="Optional" /></div>
          </div>
        </Modal>
      )}

      {showAddLabel && (
        <Modal
          title={editingLabel ? `Edit Label: ${editingLabel.name}` : 'Add Label'}
          onClose={() => setShowAddLabel(false)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setShowAddLabel(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveLabel} disabled={saving || !labelForm.name.trim()}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editingLabel ? 'Save' : 'Add')}
              </button>
            </>
          }>
          <LabelFormUI form={labelForm} onChange={setLabelForm} onAddAttr={addAttribute} onUpdateAttr={updateAttribute} onRemoveAttr={removeAttribute} />
        </Modal>
      )}

      {showSkeletonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Setup Skeleton{skeletonTargetLabel ? `: ${skeletonTargetLabel.name}` : ''}</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>Define keypoints and connections. Click a point then another to connect/disconnect.</div>
              </div>
              <button onClick={() => setShowSkeletonModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#8c8c8c', lineHeight: 1 }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: keypoint list */}
              <div style={{ width: 220, borderRight: '1px solid #f0f0f0', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Keypoints ({skeletonDef.points.length})</div>
                {skeletonDef.points.map(pt => (
                  <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: skeletonConnecting === pt.id ? '#f0e6ff' : '#fafafa', border: `1px solid ${skeletonConnecting === pt.id ? '#722ed1' : '#e8e8e8'}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#722ed1', flexShrink: 0 }} />
                    <input
                      value={pt.name}
                      onChange={e => setSkeletonDef(d => ({ ...d, points: d.points.map(p => p.id === pt.id ? { ...p, name: e.target.value } : p) }))}
                      style={{ flex: 1, border: 'none', background: 'none', fontSize: 12, outline: 'none', minWidth: 0 }}
                    />
                    <button onClick={() => skeletonRemovePoint(pt.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                <button onClick={skeletonAddPoint}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px', border: '1px dashed #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#595959' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#722ed1')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#d9d9d9')}>
                  + Add keypoint
                </button>
                <div style={{ marginTop: 12, fontSize: 11, color: '#8c8c8c' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Edges ({skeletonDef.edges.length})</div>
                  {skeletonDef.edges.map(([a, b], i) => {
                    const pa = skeletonDef.points.find(p => p.id === a);
                    const pb = skeletonDef.points.find(p => p.id === b);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span style={{ flex: 1 }}>{pa?.name} – {pb?.name}</span>
                        <button onClick={() => setSkeletonDef(d => ({ ...d, edges: d.edges.filter((_, ei) => ei !== i) }))}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 11, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                  {skeletonDef.edges.length === 0 && <span style={{ color: '#bfbfbf' }}>No connections yet</span>}
                </div>
              </div>

              {/* Right: visual canvas */}
              <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {skeletonConnecting !== null
                    ? `Connecting from "${skeletonDef.points.find(p => p.id === skeletonConnecting)?.name}" — click another point to connect/disconnect, or click same to cancel`
                    : 'Click a point to start connecting. Drag points to reposition them.'}
                </div>
                <div style={{ flex: 1, position: 'relative', border: '1px solid #e8e8e8', borderRadius: 8, background: '#fafafa', overflow: 'hidden' }}>
                  <svg
                    width="100%" height="100%"
                    viewBox="0 0 400 360"
                    style={{ display: 'block' }}
                    onMouseMove={e => {
                      // drag support via data attribute
                      const dragging = (e.currentTarget as any)._dragging;
                      if (dragging == null) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const nx = (e.clientX - rect.left) / rect.width;
                      const ny = (e.clientY - rect.top) / rect.height;
                      setSkeletonDef(d => ({ ...d, points: d.points.map(p => p.id === dragging ? { ...p, x: Math.max(0.05, Math.min(0.95, nx)), y: Math.max(0.05, Math.min(0.95, ny)) } : p) }));
                    }}
                    onMouseUp={e => { (e.currentTarget as any)._dragging = null; }}
                    onMouseLeave={e => { (e.currentTarget as any)._dragging = null; }}>

                    {/* Edges */}
                    {skeletonDef.edges.map(([a, b], i) => {
                      const pa = skeletonDef.points.find(p => p.id === a);
                      const pb = skeletonDef.points.find(p => p.id === b);
                      if (!pa || !pb) return null;
                      return <line key={i} x1={pa.x * 400} y1={pa.y * 360} x2={pb.x * 400} y2={pb.y * 360} stroke="#722ed1" strokeWidth={2} strokeOpacity={0.7} />;
                    })}

                    {/* Points */}
                    {skeletonDef.points.map(pt => (
                      <g key={pt.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => skeletonClickPoint(pt.id)}
                        onMouseDown={e => { e.stopPropagation(); (e.currentTarget.closest('svg') as any)._dragging = pt.id; }}>
                        <circle cx={pt.x * 400} cy={pt.y * 360} r={skeletonConnecting === pt.id ? 12 : 9}
                          fill={skeletonConnecting === pt.id ? '#722ed1' : '#fff'}
                          stroke="#722ed1" strokeWidth={2} />
                        <text x={pt.x * 400} y={pt.y * 360 - 13} textAnchor="middle" fontSize={10} fill="#434343">{pt.name}</text>
                      </g>
                    ))}

                    {skeletonDef.points.length === 0 && (
                      <text x={200} y={185} textAnchor="middle" fontSize={13} fill="#bfbfbf">Add keypoints from the left panel</text>
                    )}
                  </svg>
                </div>

                {/* Label name field when creating new */}
                {!skeletonTargetLabel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>Label name:</span>
                    <input
                      id="skeleton-label-name"
                      defaultValue="skeleton"
                      style={{ flex: 1, padding: '5px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 24px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => setShowSkeletonModal(false)}
                style={{ padding: '7px 18px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!skeletonTargetLabel) {
                    const nameEl = document.getElementById('skeleton-label-name') as HTMLInputElement;
                    const labelName = nameEl?.value?.trim() || 'skeleton';
                    if (!id) return;
                    setSaving(true);
                    try {
                      await client.post(`/labels/${id}/create`, {
                        name: labelName, type: 'skeleton', color: '#722ed1',
                        attributes: [], metadata: { skeleton: skeletonDef },
                      });
                      setShowSkeletonModal(false); loadLabels();
                    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to save'); }
                    finally { setSaving(false); }
                  } else {
                    handleSaveSkeleton();
                  }
                }}
                disabled={saving}
                style={{ padding: '7px 18px', border: 'none', borderRadius: 6, background: '#722ed1', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                {saving ? 'Saving…' : (skeletonTargetLabel ? 'Update Skeleton' : 'Create Skeleton Label')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskCard sub-component ─────────────────────────────────────────────────
function TaskCard({ task, taskIndex, users, expandedTaskId, setExpandedTaskId, taskMenuId, setTaskMenuId, jobMenuId, setJobMenuId, uploadingTaskId, importTaskRef, project, onFileUpload, onTaskImportFile, onTaskImport, onTaskExport, onDeleteTask, onAssignTask, onAssignJob, onJobStage, onJobState, onJobExport, onDeleteJob, onAddJob, navigate }: any) {
  const frameCount = task.frameCount || 0;
  const annotated = task.annotatedFrames || 0;
  const pct = frameCount > 0 ? Math.round((annotated / frameCount) * 100) : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, position: 'relative' }}>
      {/* Hidden import input */}
      <input ref={(el: HTMLInputElement | null) => importTaskRef.current[task.id] = el} type="file" accept=".json" style={{ display: 'none' }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTaskImportFile(task.id, e.target.files)} />

      {/* Task header */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Thumbnail */}
        <div onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
          style={{ width: 80, height: 64, borderRadius: 6, flexShrink: 0, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
          {task.thumbnailUrl
            ? <img src={task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
          <div style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(24,144,255,0.85)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>
            {project?.dataType?.toLowerCase() === 'pointcloud' ? '3D' : '2D'}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2, color: '#262626' }}>
            {task.name}
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>
            Task #{taskIndex + 1} · Created {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>

          {/* Assignee */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Assigned to</span>
            <select className="input" style={{ fontSize: 12, padding: '2px 6px', minWidth: 140 }}
              value={task.assignee?.id || ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onAssignTask(task.id, e.target.value)}>
              <option value="">Select a user</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>

          {/* Subset + status badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>Subset: {task.subset}</span>
            <span className="badge badge-blue" style={{ fontSize: 11 }}>{task.status || 'annotation'}</span>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>{frameCount} frames</span>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>{task.jobs?.length || 0} jobs</span>
          </div>

          {/* Progress bar */}
          {frameCount > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: '#f0f0f0', borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#52c41a' : '#1890ff', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{annotated}/{frameCount} ({pct}%)</span>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <label style={{ cursor: 'pointer' }} title="Upload files">
            <input type="file" multiple accept="image/*,video/*,.pcd" style={{ display: 'none' }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.files && onFileUpload(task.id, e.target.files)} />
            <div className="btn btn-default btn-sm" style={{ pointerEvents: 'none' }}>
              {uploadingTaskId === task.id ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '↑ Upload'}
            </div>
          </label>

          {/* Task ⋮ */}
          <div className="task-menu-wrap" style={{ position: 'relative' }}>
            <button style={{ width: 30, height: 30, borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959' }}
              onClick={(e) => { e.stopPropagation(); setTaskMenuId(taskMenuId === task.id ? null : task.id); }}>⋮</button>
            {taskMenuId === task.id && (
              <DropMenu style={{ top: '100%', right: 0, marginTop: 4 }}>
                <MI icon="↓" label="Export dataset" onClick={() => onTaskExport(task.id, task.name)} />
                <MI icon="↑" label="Import dataset" onClick={() => onTaskImport(task.id)} />
                <MDivider />
                <MI icon="📊" label="View report" onClick={() => { setTaskMenuId(null); navigate('/reports'); }} />
                <MDivider />
                <MI icon="🗑" label="Delete task" onClick={() => onDeleteTask(task.id)} danger />
              </DropMenu>
            )}
          </div>

          {/* Expand */}
          <button onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
            style={{ width: 30, height: 30, borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959' }}>
            {expandedTaskId === task.id ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Jobs section */}
      {expandedTaskId === task.id && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          {/* Jobs toolbar */}
          <div style={{ padding: '9px 18px', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>
              Jobs <span style={{ color: '#8c8c8c', fontWeight: 400 }}>({task.jobs?.length || 0})</span>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-default btn-sm">Sort by ☰</button>
              <button className="btn btn-default btn-sm">Quick filters ▾</button>
              <button className="btn btn-default btn-sm">Filter ▾</button>
              <button className="btn btn-default btn-sm">Clear filters</button>
              <button className="btn btn-default btn-sm" title="Download">↓</button>
              <button className="btn btn-primary btn-sm" onClick={() => onAddJob(task.id)}>+</button>
            </div>
          </div>

          {/* Column headers */}
          {task.jobs?.length > 0 && (
            <div style={{ padding: '7px 18px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#8c8c8c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#fafafa' }}>
              <span style={{ width: 70 }}>Job</span>
              <span style={{ flex: 1 }}>Dates</span>
              <span style={{ width: 150 }}>Assignee</span>
              <span style={{ width: 140 }}>Stage</span>
              <span style={{ width: 140 }}>State</span>
              <span style={{ width: 190 }}>Info</span>
              <span style={{ width: 70 }}>Actions</span>
            </div>
          )}

          {/* Job rows */}
          {task.jobs?.length > 0 ? task.jobs.map((job: Job, idx: number) => {
            const jfc = job.frameEnd - job.frameStart + 1;
            const jpct = frameCount > 0 ? Math.round((jfc / frameCount) * 100) : 100;
            return (
              <div key={job.id} className="job-menu-wrap" style={{ padding: '11px 18px', borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <div style={{ width: 70 }}>
                  <button onClick={() => navigate(`/jobs/${job.id}/annotate`)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1890ff', fontWeight: 600, fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Job #{idx + 1}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </button>
                </div>
                <div style={{ flex: 1, fontSize: 11, color: '#8c8c8c', lineHeight: 1.7 }}>
                  <div>Created: {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  <div>Updated: {new Date(job.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ width: 150 }}>
                  <select className="input" style={{ fontSize: 12, padding: '3px 6px' }}
                    value={job.assignee?.id || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onAssignJob(job.id, e.target.value)}>
                    <option value="">Unassigned</option>
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </div>
                <div style={{ width: 140 }}>
                  <select className="input" style={{ fontSize: 12, padding: '3px 6px' }}
                    value={job.stage} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onJobStage(job.id, e.target.value)}>
                    <option value="annotation">annotation</option>
                    <option value="validation">validation</option>
                    <option value="acceptance">acceptance</option>
                  </select>
                </div>
                <div style={{ width: 140 }}>
                  <select className="input" style={{ fontSize: 12, padding: '3px 6px' }}
                    value={job.state} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onJobState(job.id, e.target.value)}>
                    <option value="new">new</option>
                    <option value="in_progress">in progress</option>
                    <option value="completed">completed</option>
                    <option value="rejected">rejected</option>
                  </select>
                </div>
                <div style={{ width: 190, fontSize: 11, color: '#595959', lineHeight: 1.9 }}>
                  <div>⏱ Duration: {durationHours(job)}h</div>
                  <div>▣ Frame count: {jfc} ({jpct}%)</div>
                  <div>≡ Frame range: {job.frameStart}–{job.frameEnd}</div>
                </div>
                <div style={{ width: 70, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => navigate(`/jobs/${job.id}/annotate`)}>Open</button>
                  <div className="job-menu-wrap" style={{ position: 'relative' }}>
                    <button style={{ width: 24, height: 24, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959' }}
                      onClick={(e) => { e.stopPropagation(); setJobMenuId(jobMenuId === job.id ? null : job.id); }}>⋮</button>
                    {jobMenuId === job.id && (
                      <DropMenu style={{ top: '100%', right: 0, marginTop: 4, minWidth: 190 }}>
                        <MI icon="↗" label="Open in editor" onClick={() => { navigate(`/jobs/${job.id}/annotate`); setJobMenuId(null); }} />
                        <MDivider />
                        <MI icon="↓" label="Export annotations" onClick={() => onJobExport(job.id)} />
                        <MDivider />
                        <MI icon="🗑" label="Delete job" onClick={() => onDeleteJob(job.id)} danger />
                      </DropMenu>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: '20px 18px', textAlign: 'center', color: '#8c8c8c', fontSize: 13 }}>
              No jobs yet — upload files or click <strong>+</strong> to add a job.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LabelFormUI component ──────────────────────────────────────────────────
function LabelFormUI({
  form, onChange, onAddAttr, onUpdateAttr, onRemoveAttr,
}: {
  form: LabelForm;
  onChange: (f: LabelForm) => void;
  onAddAttr: () => void;
  onUpdateAttr: (idx: number, patch: Partial<LabelAttribute>) => void;
  onRemoveAttr: (idx: number) => void;
}) {
  return (
    <div>
      {/* Name + Type + Color row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>
          <label className="form-label required">Label name</label>
          <input autoFocus className="input" value={form.name}
            onChange={e => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. car, person..." />
        </div>
        <div style={{ flex: 1 }}>
          <label className="form-label">Type</label>
          <select className="input" value={form.type} onChange={e => onChange({ ...form, type: e.target.value })}>
            {LABEL_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Color</label>
          <input type="color" value={form.color}
            onChange={e => onChange({ ...form, color: e.target.value })}
            style={{ width: 44, height: 34, border: '1px solid #d9d9d9', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
        </div>
      </div>

      {/* Attributes */}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label className="form-label" style={{ margin: 0 }}>Attributes</label>
        <button className="btn btn-default btn-sm" onClick={onAddAttr} style={{ fontSize: 12, padding: '3px 10px' }}>
          + Add attribute
        </button>
      </div>

      {form.attributes.length === 0 && (
        <div style={{ padding: '14px 0', textAlign: 'center', color: '#bfbfbf', fontSize: 13, border: '1px dashed #e8e8e8', borderRadius: 6 }}>
          No attributes. Click "Add attribute" to add one.
        </div>
      )}

      {form.attributes.map((attr, idx) => (
        <AttrRow key={attr.id} attr={attr} idx={idx} onUpdate={onUpdateAttr} onRemove={onRemoveAttr} />
      ))}
    </div>
  );
}

function AttrRow({ attr, idx, onUpdate, onRemove }: {
  attr: LabelAttribute;
  idx: number;
  onUpdate: (idx: number, patch: Partial<LabelAttribute>) => void;
  onRemove: (idx: number) => void;
}) {
  const [valuesInput, setValuesInput] = useState(attr.values.join(', '));

  const commitValues = () => {
    const vals = valuesInput.split(',').map((v: string) => v.trim()).filter(Boolean);
    onUpdate(idx, { values: vals, default_value: vals[0] });
  };

  const showValues = ['select', 'radio'].includes(attr.input_type);
  const showBool = attr.input_type === 'checkbox';
  const showNumber = attr.input_type === 'number';
  const showText = attr.input_type === 'text';

  return (
    <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 12, marginBottom: 8, background: '#fafafa' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Name */}
        <div style={{ flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>Name</div>
          <input className="input" style={{ fontSize: 13 }} value={attr.name}
            placeholder="Attribute name"
            onChange={e => onUpdate(idx, { name: e.target.value })} />
        </div>
        {/* Input type */}
        <div style={{ flex: '0 0 110px' }}>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>Input type</div>
          <select className="input" style={{ fontSize: 13 }} value={attr.input_type}
            onChange={e => {
              const it = e.target.value as AttrInputType;
              const vals = it === 'checkbox' ? ['false'] : it === 'text' ? [''] : [];
              onUpdate(idx, { input_type: it, values: vals, default_value: vals[0] });
              setValuesInput(vals.join(', '));
            }}>
            {ATTR_INPUT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        {/* Values */}
        <div style={{ flex: '2 1 180px' }}>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>
            {showValues ? 'Values (comma-separated)' : showBool ? 'Default' : showNumber ? 'Min;Max;Step' : 'Default value'}
          </div>
          {showBool ? (
            <select className="input" style={{ fontSize: 13 }} value={attr.values[0] || 'false'}
              onChange={e => onUpdate(idx, { values: [e.target.value], default_value: e.target.value })}>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : showText ? (
            <input className="input" style={{ fontSize: 13 }} value={attr.values[0] || ''}
              placeholder="Default text..."
              onChange={e => onUpdate(idx, { values: [e.target.value], default_value: e.target.value })} />
          ) : showNumber ? (
            <input className="input" style={{ fontSize: 13 }} value={valuesInput}
              placeholder="0;100;1"
              onChange={e => setValuesInput(e.target.value)}
              onBlur={commitValues} />
          ) : (
            <input className="input" style={{ fontSize: 13 }} value={valuesInput}
              placeholder="option1, option2, ..."
              onChange={e => setValuesInput(e.target.value)}
              onBlur={commitValues} />
          )}
        </div>
        {/* Mutable */}
        <div style={{ flex: '0 0 80px', paddingTop: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={attr.mutable} onChange={e => onUpdate(idx, { mutable: e.target.checked })} />
            Mutable
          </label>
        </div>
        {/* Delete */}
        <div style={{ paddingTop: 16 }}>
          <button onClick={() => onRemove(idx)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 16, padding: '2px 4px' }}
            title="Remove attribute">✕</button>
        </div>
      </div>
    </div>
  );
}
