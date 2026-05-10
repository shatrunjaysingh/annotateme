import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import AnnotationCanvas from '../components/AnnotationCanvas';
import PointCloudCanvas, { Cuboid3D } from '../components/PointCloudCanvas';
import { useAnnotationStore, ToolType } from '../store/annotationStore';

interface JobInfo {
  id: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  task?: { id: string; name: string; frameCount: number; projectId?: string; project?: { id: string; name: string; labelSet: string[] } };
}

interface FileInfo { id: string; url: string; originalName: string; frameNumber: number; }

const DEFAULT_COLORS = ['#1890ff','#52c41a','#fa8c16','#eb2f96','#722ed1','#13c2c2','#ff4d4f','#fadb14','#2f54eb','#389e0d','#d46b08','#c41d7f'];

type ViewMode = '2d' | '3d';

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
  select: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-7 2-4 7z"/></svg>,
  rect: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>,
  polygon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5Z"/></svg>,
  polyline: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,18 9,8 15,14 21,4"/></svg>,
  point: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>,
  ellipse: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>,
};
const TOOL_KEYS: Record<ToolType, string> = { select: 'S', rect: 'R', polygon: 'P', polyline: 'L', point: 'D', ellipse: 'E' };
const TOOL_LABELS: Record<ToolType, string> = { select: 'Select', rect: 'Rectangle', polygon: 'Polygon', polyline: 'Polyline', point: 'Point', ellipse: 'Ellipse' };

type SortBy = 'id' | 'id_desc' | 'label' | 'area';
type ColorBy = 'label' | 'instance';

export default function AnnotationEditor() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobInfo | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [frameNum, setFrameNum] = useState(0);
  const [labels, setLabels] = useState<{ name: string; color: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'objects' | 'labels'>('objects');

  // Menu / panel state
  const [menuOpen, setMenuOpen] = useState(false);
  const [stateSubmenu, setStateSubmenu] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Objects panel
  const [sortBy, setSortBy] = useState<SortBy>('id');
  const [hiddenLabelsFilter, setHiddenLabelsFilter] = useState<Set<string>>(new Set());
  const [allHidden, setAllHidden] = useState(false);
  const [allLocked, setAllLocked] = useState(false);

  // Appearance
  const [colorBy, setColorBy] = useState<ColorBy>('label');
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const [selectedOpacity, setSelectedOpacity] = useState(0.55);
  const [outlinedBorders, setOutlinedBorders] = useState(false);
  const [cuboidOrientation, setCuboidOrientation] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(true);

  // 3D / point cloud
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [cuboids, setCuboids] = useState<Cuboid3D[]>([]);
  const [selectedCuboidId, setSelectedCuboidId] = useState<string | null>(null);
  const [expandedView, setExpandedView] = useState<'top' | 'side' | 'front' | null>(null);
  const [pcTool, setPcTool] = useState<'select' | 'cuboid'>('select');
  const [pcdPoints, setPcdPoints] = useState<Float32Array | undefined>(undefined);
  const [pcdColors, setPcdColors] = useState<Float32Array | undefined>(undefined);
  const [pcdLoading, setPcdLoading] = useState(false);
  const [pcdError, setPcdError] = useState<string | null>(null);

  // Video extraction
  const [videoModal, setVideoModal] = useState<{ file: File; fps: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');

  // Label creation
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [addingLabel, setAddingLabel] = useState(false);

  // AI auto-annotation
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'ok' | 'unavailable'>('idle');
  const [aiToast, setAiToast] = useState<string | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const {
    currentTool, setTool, setLabel, selectedLabel, selectedLabelColor,
    shapes, setShapes, addShape, updateShape, deleteShape, selectShape, selectedShapeId,
    toggleHidden, toggleLocked, undo, redo, clearShapes,
  } = useAnnotationStore();

  // Load job info
  useEffect(() => {
    if (!jobId) return;
    const load = async () => {
      try {
        const { data: j } = await client.get(`/jobs/${jobId}`);
        setJob(j);
        const labelSet = j.task?.project?.labelSet || [];
        const lbls = labelSet.map((name: string, i: number) => ({ name, color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
        setLabels(lbls);
        if (lbls.length > 0) setLabel(lbls[0].name, lbls[0].color);
        const dt = (j.task?.project as any)?.dataType || '';
        if (dt.toLowerCase().includes('point') || dt.toLowerCase().includes('3d')) {
          setViewMode('3d');
        }
        if (j.task?.id) {
          const { data: f } = await client.get(`/files/task/${j.task.id}`);
          setFiles(f);
        }
      } catch { navigate(-1); }
    };
    load();
  }, [jobId, navigate, setLabel]);

  // Load frame annotations
  useEffect(() => {
    if (!jobId) return;
    clearShapes();
    const load = async () => {
      try {
        const { data } = await client.get(`/jobs/${jobId}/frame/${frameNum}`);
        setShapes(data.shapes || []);
        setCuboids(data.cuboids || []);
      } catch { /* cleared above */ }
    };
    load();
  }, [jobId, frameNum, setShapes, clearShapes]);

  // Load PCD point cloud for current frame when in 3D mode
  useEffect(() => {
    if (viewMode !== '3d') return;
    const f = files[frameNum];
    if (!f) return;
    const isPCD = f.originalName?.toLowerCase().endsWith('.pcd') || f.url?.toLowerCase().endsWith('.pcd');
    if (!isPCD) return;

    setPcdPoints(undefined);
    setPcdColors(undefined);
    setPcdError(null);
    setPcdLoading(true);

    client.get(`/files/${f.id}/points`)
      .then(({ data }) => {
        const decode = (b64: string): Float32Array => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Float32Array(bytes.buffer);
        };
        setPcdPoints(decode(data.points));
        setPcdColors(decode(data.colors));
      })
      .catch((err) => { setPcdError(err?.response?.data?.error || 'Failed to load point cloud'); })
      .finally(() => setPcdLoading(false));
  }, [viewMode, files, frameNum]);

  // Auto-save
  const saveAnnotations = useCallback(async (silent = false) => {
    if (!jobId) return;
    if (!silent) setSaving(true);
    try {
      await client.post(`/jobs/${jobId}/frame/${frameNum}`, { shapes, cuboids, tags: [], tracks: [] });
      if (!silent) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* no-op */ }
    finally { if (!silent) setSaving(false); }
  }, [jobId, frameNum, shapes, cuboids]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveAnnotations(true), 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [shapes, saveAnnotations]);

  // Cuboid nudge via U/I/O J/K/L when in 3D mode with a cuboid selected
  useEffect(() => {
    if (viewMode !== '3d') return;
    const STEP = 0.1; // metres per keypress; hold Shift for ×5
    const handler = (e: KeyboardEvent) => {
      if (!selectedCuboidId) return;
      // Ignore when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const step = e.shiftKey ? STEP * 5 : STEP;
      const deltas: Record<string, [number, number, number]> = {
        u: [0,  step, 0],   // up   (+Y)
        j: [0, -step, 0],   // down (-Y)
        i: [0, 0, -step],   // forward  (-Z)
        k: [0, 0,  step],   // backward (+Z)
        o: [ step, 0, 0],   // right (+X)
        l: [-step, 0, 0],   // left  (-X)
      };
      const d = deltas[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      setCuboids(prev => prev.map(c =>
        c.id !== selectedCuboidId ? c : {
          ...c,
          center: { x: c.center.x + d[0], y: c.center.y + d[1], z: c.center.z + d[2] },
        }
      ));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, selectedCuboidId]);

  // Auto-switch to Objects tab when something gets selected on canvas
  useEffect(() => {
    if (selectedShapeId && viewMode === '2d') setActiveTab('objects');
  }, [selectedShapeId, viewMode]);

  // Frame navigation
  const goToFrame = useCallback(async (n: number) => {
    const clamped = Math.max(0, Math.min(n, files.length - 1));
    if (clamped === frameNum) return;
    if (jobId) {
      try { await client.post(`/jobs/${jobId}/frame/${frameNum}`, { shapes, cuboids, tags: [], tracks: [] }); } catch { /* no-op */ }
    }
    setFrameNum(clamped);
  }, [jobId, frameNum, shapes, cuboids, files.length]);

  // Play mode
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      setFrameNum(n => {
        if (n >= files.length - 1) { setIsPlaying(false); return n; }
        return n + 1;
      });
    }, 500);
    return () => clearInterval(t);
  }, [isPlaying, files.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // 2D tool keys only fire in 2D mode (avoids conflict with 3D nudge keys)
      if (viewMode === '2d') {
        const toolMap: Record<string, ToolType> = { s: 'select', r: 'rect', p: 'polygon', l: 'polyline', d: 'point', e: 'ellipse' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) setTool(tool);
      }
      if (e.key === 'ArrowLeft') goToFrame(frameNum - 1);
      if (e.key === 'ArrowRight') goToFrame(frameNum + 1);
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveAnnotations(); }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, setTool, goToFrame, saveAnnotations, frameNum]);

  // Click outside menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false); setStateSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sort shapes for Objects list
  const sortedShapes = useMemo(() => {
    const s = [...shapes];
    if (sortBy === 'label') s.sort((a, b) => a.label.localeCompare(b.label));
    if (sortBy === 'area') s.sort((a, b) => {
      const area = (sh: typeof a) => {
        if (sh.type === 'rect' && sh.points.length >= 2) return Math.abs(sh.points[1].x - sh.points[0].x) * Math.abs(sh.points[1].y - sh.points[0].y);
        if (sh.type === 'ellipse' && sh.points.length >= 2) return Math.PI * Math.abs(sh.points[1].x) * Math.abs(sh.points[1].y);
        return 0;
      };
      return area(b) - area(a);
    });
    if (sortBy === 'id_desc') s.reverse();
    return s;
  }, [shapes, sortBy]);

  // Menu actions
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !jobId) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      for (const frame of (data.frames || [])) {
        await client.post(`/jobs/${jobId}/frame/${frame.frameNumber}`, { shapes: frame.shapes || [], tags: frame.tags || [], tracks: frame.tracks || [] });
      }
      const { data: fd } = await client.get(`/jobs/${jobId}/frame/${frameNum}`);
      setShapes(fd.shapes || []);
    } catch { alert('Failed to import annotations. Check the file format.'); }
    setMenuOpen(false);
    e.target.value = '';
  }, [jobId, frameNum, setShapes]);

  const handleExport = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await client.get(`/jobs/${jobId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `job-${jobId}-annotations.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
    setMenuOpen(false);
  }, [jobId]);

  const handleAutoAnnotate = useCallback(async () => {
    if (!jobId) return;
    setAiLoading(true);
    setAiToast(null);
    try {
      const { data } = await client.post('/ai/annotate', { jobId, frameIndex: frameNum });
      const newShapes: any[] = data.shapes || [];
      newShapes.forEach(s => addShape(s));
      setAiToast(`${newShapes.length} object${newShapes.length !== 1 ? 's' : ''} detected by ${data.model}`);
      setTimeout(() => setAiToast(null), 4000);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'AI service unavailable';
      setAiToast(`Error: ${msg}`);
      setTimeout(() => setAiToast(null), 5000);
    } finally {
      setAiLoading(false);
    }
  }, [jobId, frameNum, addShape]);

  const handleRemoveAll = useCallback(async () => {
    if (!jobId) return;
    if (!confirm('Remove ALL annotations from this job? This cannot be undone.')) return;
    try {
      await client.delete(`/jobs/${jobId}/annotations`);
      clearShapes();
    } catch { alert('Failed to remove annotations'); }
    setMenuOpen(false);
  }, [jobId, clearShapes]);

  const handleChangeState = useCallback(async (state: string) => {
    if (!jobId) return;
    setMenuOpen(false); setStateSubmenu(false);
    try {
      await client.patch(`/jobs/${jobId}`, { state });
      setJob(j => j ? { ...j, state } : j);
    } catch (err: any) {
      alert(`Failed to change state: ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
    }
  }, [jobId]);

  const handleFinishJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await saveAnnotations(true);
      await client.patch(`/jobs/${jobId}`, { state: 'completed' });
      navigate(-1);
    } catch { navigate(-1); }
  }, [jobId, saveAnnotations, navigate]);

  const handleOpenTask = useCallback(() => {
    const pid = job?.task?.project?.id;
    if (pid) navigate(`/projects/${pid}`);
    setMenuOpen(false);
  }, [job, navigate]);

  // Add label dynamically
  const addLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (!name || !job?.task?.project?.id) return;
    setAddingLabel(true);
    try {
      const { data } = await client.post(`/labels/${job.task.project.id}/create`, { name });
      const color = data.label?.color || DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length];
      const newLbl = { name: data.label?.name || name, color };
      setLabels(prev => [...prev, newLbl]);
      setLabel(newLbl.name, newLbl.color);
      setNewLabelName(''); setShowAddLabel(false);
    } catch { /* no-op */ }
    setAddingLabel(false);
  }, [newLabelName, job, labels.length, setLabel]);

  // Hide/lock all
  const toggleAllHidden = useCallback(() => {
    const next = !allHidden;
    setAllHidden(next);
    shapes.forEach(s => { if (s.hidden !== next) toggleHidden(s.id); });
  }, [allHidden, shapes, toggleHidden]);

  const toggleAllLocked = useCallback(() => {
    const next = !allLocked;
    setAllLocked(next);
    shapes.forEach(s => { if (s.locked !== next) toggleLocked(s.id); });
  }, [allLocked, shapes, toggleLocked]);

  const toggleLabelFilter = (label: string) => {
    setHiddenLabelsFilter(prev => {
      const s = new Set(prev);
      if (s.has(label)) s.delete(label); else s.add(label);
      return s;
    });
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const currentImage = files.find(f => f.frameNumber === frameNum) || files[frameNum];
  const imageUrl = currentImage?.url || null;
  const selectedShape = shapes.find(s => s.id === selectedShapeId);

  const STATE_COLORS: Record<string, string> = { new: '#8c8c8c', in_progress: '#1890ff', completed: '#52c41a', rejected: '#ff4d4f' };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a1a', overflow: 'hidden' }} id="annotation-editor">

      {/* TOP TOOLBAR */}
      <div style={{ height: 48, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative', zIndex: 100 }}>

        {/* BACK button */}
        <button
          onClick={async () => { await saveAnnotations(true); navigate(-1); }}
          title="Back"
          style={{ height: '100%', padding: '0 14px', background: 'transparent', border: 'none', borderRight: '1px solid #e8e8e8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#595959', transition: 'all 0.15s', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#262626'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#595959'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          Back
        </button>

        {/* MENU button */}
        <div ref={menuRef} style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => { setMenuOpen(m => !m); setStateSubmenu(false); }}
            style={{ height: '100%', padding: '0 14px', background: menuOpen ? '#1890ff' : 'transparent', border: 'none', borderRight: '1px solid #e8e8e8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: menuOpen ? '#fff' : '#262626', transition: 'all 0.15s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect y="4" width="24" height="2"/><rect y="11" width="24" height="2"/><rect y="18" width="24" height="2"/></svg>
            Menu
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
          </button>

          {menuOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: '0 0 8px 8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 200, zIndex: 200, overflow: 'visible' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 14, color: '#262626' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                Upload annotations
              </label>
              <button style={menuItemStyle} onClick={handleExport}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Export job dataset
              </button>
              <button style={{ ...menuItemStyle, color: '#ff4d4f' }} onClick={handleRemoveAll}
                onMouseEnter={e => (e.currentTarget.style.background = '#fff1f0')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Remove annotations
              </button>
              <button style={menuItemStyle}
                onClick={() => { alert('Run actions: no automated actions configured for this job.'); setMenuOpen(false); }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Run actions
              </button>
              <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
              <button style={menuItemStyle} onClick={handleOpenTask}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open the task
              </button>
              <div style={{ position: 'relative' }}>
                <button style={menuItemStyle}
                  onClick={() => setStateSubmenu(s => !s)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Change job state
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: 'auto' }}><path d="M7 5L3 1v8z"/></svg>
                </button>
                {stateSubmenu && (
                  <div style={{ position: 'absolute', left: '100%', top: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 140, zIndex: 9999 }}>
                    {['new', 'in_progress', 'completed', 'rejected'].map(s => (
                      <button key={s} style={{ ...menuItemStyle, color: STATE_COLORS[s] || '#262626', justifyContent: 'flex-start' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                        onClick={() => handleChangeState(s)}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[s] || '#8c8c8c', display: 'inline-block' }} />
                        {s.replace('_', ' ')}
                        {job?.state === s && <svg width="12" height="12" viewBox="0 0 24 24" fill={STATE_COLORS[s]} style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
              <button style={{ ...menuItemStyle, color: '#52c41a', fontWeight: 600 }} onClick={handleFinishJob}
                onMouseEnter={e => (e.currentTarget.style.background = '#f6ffed')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                Finish the job
              </button>
            </div>
          )}
        </div>

        {/* Save / Undo / Redo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 10px', borderRight: '1px solid #e8e8e8', height: '100%' }}>
          <ToolbarBtn onClick={() => saveAnnotations()} title="Save (Ctrl+S)" active={saving}>
            {saving
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            }
            <span style={{ fontSize: 12 }}>{saving ? 'Saving' : saved ? 'Saved' : 'Save'}</span>
          </ToolbarBtn>
          <ToolbarBtn onClick={undo} title="Undo (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
            <span style={{ fontSize: 12 }}>Undo</span>
          </ToolbarBtn>
          <ToolbarBtn onClick={redo} title="Redo (Ctrl+Y)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
            <span style={{ fontSize: 12 }}>Redo</span>
          </ToolbarBtn>
        </div>

        {/* AI Auto-annotate */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: '1px solid #e8e8e8', height: '100%' }}>
          <ToolbarBtn
            onClick={handleAutoAnnotate}
            title="Auto-annotate this frame with AI"
            active={aiLoading}
          >
            {aiLoading
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2"/></svg>
            }
            <span style={{ fontSize: 12 }}>{aiLoading ? 'Detecting…' : 'AI Annotate'}</span>
          </ToolbarBtn>
        </div>

        {/* Frame Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '0 8px', borderRight: '1px solid #e8e8e8', height: '100%' }}>
          {/* First */}
          <NavBtn onClick={() => goToFrame(0)} title="First frame (Home)" disabled={frameNum === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,5 19,19 13,12"/><rect x="5" y="5" width="3" height="14"/></svg>
          </NavBtn>
          {/* -10 */}
          <NavBtn onClick={() => goToFrame(frameNum - 10)} title="-10 frames" disabled={frameNum === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18,5 11,12 18,19"/><polyline points="11,5 4,12 11,19"/></svg>
          </NavBtn>
          {/* Prev */}
          <NavBtn onClick={() => goToFrame(frameNum - 1)} title="Previous frame (←)" disabled={frameNum === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </NavBtn>
          {/* Play/Pause */}
          <NavBtn onClick={() => setIsPlaying(p => !p)} title={isPlaying ? 'Pause' : 'Play'} active={isPlaying}>
            {isPlaying
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
          </NavBtn>
          {/* Next */}
          <NavBtn onClick={() => goToFrame(frameNum + 1)} title="Next frame (→)" disabled={frameNum >= files.length - 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9,18 15,12 9,6"/></svg>
          </NavBtn>
          {/* +10 */}
          <NavBtn onClick={() => goToFrame(frameNum + 10)} title="+10 frames" disabled={frameNum >= files.length - 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6,5 13,12 6,19"/><polyline points="13,5 20,12 13,19"/></svg>
          </NavBtn>
          {/* Last */}
          <NavBtn onClick={() => goToFrame(files.length - 1)} title="Last frame (End)" disabled={frameNum >= files.length - 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,5 5,19 11,12"/><rect x="16" y="5" width="3" height="14"/></svg>
          </NavBtn>
        </div>

        {/* Image path + frame input - center */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', minWidth: 0 }}>
          <span style={{ fontSize: 12, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }} title={currentImage?.originalName || ''}>
            {currentImage?.originalName || 'No image'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, background: '#f5f5f5', borderRadius: 4, padding: '2px 8px', border: '1px solid #e8e8e8' }}>
            <input type="number" value={frameNum} min={0} max={files.length - 1}
              onChange={e => goToFrame(parseInt(e.target.value) || 0)}
              style={{ width: 40, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, textAlign: 'center', color: '#262626' }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>/ {Math.max(0, files.length - 1)}</span>
          </div>
        </div>

        {/* Right icons: Fullscreen / Info / Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 12px', height: '100%', borderLeft: '1px solid #e8e8e8' }}>
          <ToolbarBtn onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFullscreen
                ? <><path d="M8 3v3a2 2 0 01-2 2H3"/><path d="M21 8h-3a2 2 0 01-2-2V3"/><path d="M3 16h3a2 2 0 012 2v3"/><path d="M16 21v-3a2 2 0 012-2h3"/></>
                : <><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M21 8V5a2 2 0 00-2-2h-3"/><path d="M3 16v3a2 2 0 002 2h3"/><path d="M16 21h3a2 2 0 002-2v-3"/></>
              }
            </svg>
            <span style={{ fontSize: 12 }}>Full</span>
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setInfoOpen(o => !o)} title="Job info" active={infoOpen}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span style={{ fontSize: 12 }}>Info</span>
          </ToolbarBtn>
          <div style={{ position: 'relative' }}>
            <ToolbarBtn onClick={() => setFiltersOpen(o => !o)} title="Filter objects" active={filtersOpen || hiddenLabelsFilter.size > 0}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span style={{ fontSize: 12 }}>Filters{hiddenLabelsFilter.size > 0 ? ` (${hiddenLabelsFilter.size})` : ''}</span>
            </ToolbarBtn>
            {filtersOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 200, padding: '8px 0', zIndex: 200 }}>
                <div style={{ padding: '6px 14px', fontSize: 11, color: '#8c8c8c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Show labels</div>
                {labels.map(lbl => (
                  <label key={lbl.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <input type="checkbox" checked={!hiddenLabelsFilter.has(lbl.name)} onChange={() => toggleLabelFilter(lbl.name)} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: lbl.color, display: 'inline-block', flexShrink: 0 }} />
                    {lbl.name}
                  </label>
                ))}
                {labels.length === 0 && <div style={{ padding: '8px 14px', color: '#8c8c8c', fontSize: 13 }}>No labels defined</div>}
                {hiddenLabelsFilter.size > 0 && (
                  <div style={{ padding: '4px 14px', borderTop: '1px solid #f0f0f0', marginTop: 4 }}>
                    <button style={{ fontSize: 12, color: '#1890ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setHiddenLabelsFilter(new Set())}>
                      Show all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* View mode: 2D / Standard 3D */}
          <div style={{ padding: '0 8px', borderLeft: '1px solid #e8e8e8', height: '100%', display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => setViewMode('2d')}
              title="2D Image annotation"
              style={{ padding: '4px 10px', borderRadius: '4px 0 0 4px', border: '1px solid #d9d9d9', borderRight: 'none', cursor: 'pointer', fontSize: 12, fontWeight: viewMode === '2d' ? 600 : 400, background: viewMode === '2d' ? '#1890ff' : '#fff', color: viewMode === '2d' ? '#fff' : '#595959', transition: 'all 0.15s' }}>
              2D
            </button>
            <button
              onClick={() => setViewMode('3d')}
              title="Standard 3D point cloud annotation"
              style={{ padding: '4px 10px', borderRadius: '0 4px 4px 0', border: '1px solid #d9d9d9', cursor: 'pointer', fontSize: 12, fontWeight: viewMode === '3d' ? 600 : 400, background: viewMode === '3d' ? '#1890ff' : '#fff', color: viewMode === '3d' ? '#fff' : '#595959', transition: 'all 0.15s' }}>
              Standard 3D
            </button>
          </div>
          {/* Job state badge */}
          {job && (
            <div style={{ padding: '0 10px', borderLeft: '1px solid #e8e8e8', height: '100%', display: 'flex', alignItems: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: `${STATE_COLORS[job.state] || '#8c8c8c'}18`, color: STATE_COLORS[job.state] || '#8c8c8c' }}>
                {job.state?.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT TOOLBAR */}
        <div style={{ width: 48, background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 2, flexShrink: 0 }}>
          {viewMode === '2d' ? (
            (Object.keys(TOOL_ICONS) as ToolType[]).map(tool => (
              <button key={tool} title={tool === 'select' ? 'Select (S) — click a shape to select it, drag to move, drag handles to resize' : `${TOOL_LABELS[tool]} (${TOOL_KEYS[tool]})`}
                style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentTool === tool ? '#e6f4ff' : 'transparent', color: currentTool === tool ? '#1890ff' : '#595959', transition: 'all 0.15s', position: 'relative' }}
                onClick={() => setTool(tool)}>
                {TOOL_ICONS[tool]}
                {currentTool === tool && <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#1890ff', borderRadius: 2 }} />}
              </button>
            ))
          ) : (
            <>
              {/* 3D: Select */}
              <button title="Select (S)" onClick={() => setPcTool('select')}
                style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pcTool === 'select' ? '#e6f4ff' : 'transparent', color: pcTool === 'select' ? '#1890ff' : '#595959', transition: 'all 0.15s', position: 'relative' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-7 2-4 7z"/></svg>
                {pcTool === 'select' && <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#1890ff', borderRadius: 2 }} />}
              </button>
              {/* 3D: Cuboid */}
              <button title="Draw Cuboid (C)" onClick={() => setPcTool('cuboid')}
                style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pcTool === 'cuboid' ? '#e6f4ff' : 'transparent', color: pcTool === 'cuboid' ? '#1890ff' : '#595959', transition: 'all 0.15s', position: 'relative' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                {pcTool === 'cuboid' && <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#1890ff', borderRadius: 2 }} />}
              </button>
              <div style={{ width: 28, height: 1, background: '#f0f0f0', margin: '4px 0' }} />
              {/* Cuboid nudge keys */}
              <div title="Nudge selected cuboid&#10;U/J = up/down&#10;I/K = fwd/back&#10;O/L = right/left&#10;Hold Shift for ×5 step" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {([
                  [{ k: 'U', label: 'Up'      }, { k: 'I', label: 'Forward'  }, { k: 'O', label: 'Right' }],
                  [{ k: 'J', label: 'Down'    }, { k: 'K', label: 'Backward' }, { k: 'L', label: 'Left'  }],
                ] as { k: string; label: string }[][]).map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 1 }}>
                    {row.map(({ k, label }) => (
                      <kbd key={k} title={label} style={{ width: 14, height: 14, background: '#e8e8e8', borderRadius: 2, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959', fontFamily: 'monospace', cursor: 'default' }}>{k}</kbd>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ width: 28, height: 1, background: '#f0f0f0', margin: '6px 0' }} />
          {/* Upload files */}
          <label title={viewMode === '3d' ? 'Upload .pcd files' : 'Upload images or video'} style={{ width: 36, height: 36, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959', transition: 'all 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <input ref={uploadRef} type="file" multiple
              accept={viewMode === '3d' ? '.pcd' : 'image/*,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm'}
              style={{ display: 'none' }}
              onChange={async (e) => {
                if (!e.target.files || !job?.task?.id) return;
                const allFiles = Array.from(e.target.files);
                const videoFiles = allFiles.filter(f => f.type.startsWith('video/'));
                const imageFiles = allFiles.filter(f => !f.type.startsWith('video/'));

                // Upload images immediately (existing behaviour)
                if (imageFiles.length > 0) {
                  const fd = new FormData();
                  fd.append('taskId', job.task.id);
                  imageFiles.forEach(f => fd.append('files', f));
                  try {
                    await client.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    const { data: updated } = await client.get(`/files/task/${job.task.id}`);
                    setFiles(updated);
                  } catch { /* no-op */ }
                }

                // Video files → show FPS picker modal (one at a time)
                if (videoFiles.length > 0) {
                  setVideoModal({ file: videoFiles[0], fps: 1 });
                }
                e.target.value = '';
              }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          </label>
          {/* Selected label color swatch */}
          {selectedLabel && (
            <div style={{ marginTop: 8, width: 28, height: 28, borderRadius: 6, background: selectedLabelColor, border: '2px solid rgba(0,0,0,0.15)', flexShrink: 0 }} title={`Active label: ${selectedLabel}`} />
          )}
        </div>

        {/* CANVAS AREA */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === '3d' ? (
            <>
              {pcdLoading && (
                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Loading point cloud…
                </div>
              )}
              {pcdError && !pcdLoading && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, background: 'rgba(220,38,38,0.9)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to load point cloud</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{pcdError}</div>
                </div>
              )}
              <PointCloudCanvas
                points={pcdPoints}
                pointColors={pcdColors}
                cuboids={cuboids}
                labels={labels}
                currentTool={pcTool}
                selectedLabel={selectedLabel}
                selectedLabelColor={selectedLabelColor}
                colorBy={colorBy}
                selectedCuboidId={selectedCuboidId}
                cuboidOrientation={cuboidOrientation}
                onAddCuboid={c => { setCuboids(prev => [...prev, c]); setSelectedCuboidId(c.id); }}
                onSelectCuboid={setSelectedCuboidId}
                subViewHeight={200}
                expandedView={expandedView}
                onExpandView={setExpandedView}
              />
            </>
          ) : (
            <AnnotationCanvas
              imageUrl={imageUrl}
              jobId={jobId || ''}
              frameNum={frameNum}
              labels={labels}
              colorBy={colorBy}
              hiddenLabels={hiddenLabelsFilter}
              outlinedBorders={outlinedBorders}
              fillOpacity={fillOpacity}
              selectedOpacity={selectedOpacity}
            />
          )}

          {/* AI toast */}
          {aiToast && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: aiToast.startsWith('Error') ? '#fff1f0' : '#f0f9ff',
              border: `1px solid ${aiToast.startsWith('Error') ? '#ffa39e' : '#bae6fd'}`,
              color: aiToast.startsWith('Error') ? '#cf1322' : '#0369a1',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              {aiToast.startsWith('Error')
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>}
              {aiToast}
            </div>
          )}

          {/* Info overlay */}
          {infoOpen && job && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: 16, minWidth: 260, zIndex: 50 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Job Information</span>
                <button onClick={() => setInfoOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 18, lineHeight: 1 }}>x</button>
              </div>
              {([
                ['Job ID', job.id.slice(0, 8) + '...'],
                ['Task', job.task?.name || '—'],
                ['Project', job.task?.project?.name || '—'],
                ['Stage', job.stage],
                ['State', job.state?.replace('_', ' ')],
                ['Frames', `${job.frameStart} – ${job.frameEnd}`],
                ['Total files', files.length],
                ['Objects', shapes.length],
              ] as [string, string | number][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                  <span style={{ color: '#8c8c8c' }}>{k}</span>
                  <span style={{ color: '#262626', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
            {(['objects', 'labels'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #1890ff' : '2px solid transparent', color: activeTab === tab ? '#1890ff' : '#8c8c8c', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {tab === 'objects'
                  ? `Objects (${viewMode === '3d' ? cuboids.length : shapes.length})`
                  : `Labels (${labels.length})`}
              </button>
            ))}
          </div>

          {/* Objects tab header */}
          {activeTab === 'objects' && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginRight: 4 }}>Items: <b style={{ color: '#262626' }}>{viewMode === '3d' ? cuboids.length : shapes.length}</b></span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                style={{ flex: 1, fontSize: 11, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 4px', color: '#595959', background: '#fff', cursor: 'pointer' }}>
                <option value="id">ID - ascent</option>
                <option value="id_desc">ID - descent</option>
                <option value="label">Label</option>
                <option value="area">Area</option>
              </select>
              <button title={allLocked ? 'Unlock all' : 'Lock all'} onClick={toggleAllLocked}
                style={{ width: 26, height: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: allLocked ? '#fff7e6' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: allLocked ? '#fa8c16' : '#8c8c8c', fontSize: 13 }}>
                {allLocked ? '🔒' : '🔓'}
              </button>
              <button title={allHidden ? 'Show all' : 'Hide all'} onClick={toggleAllHidden}
                style={{ width: 26, height: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: allHidden ? '#f5f5f5' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: allHidden ? '#bfbfbf' : '#8c8c8c', fontSize: 13 }}>
                {allHidden ? '🙈' : '👁'}
              </button>
            </div>
          )}

          {/* Selected shape card — shows when a 2D shape is selected */}
          {selectedShape && viewMode === '2d' && (
            <div style={{ margin: '8px 8px 0', padding: '10px 12px', background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: labels.find(l => l.name === selectedShape.label)?.color || '#1890ff' }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#1890ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedShape.type} — {selectedShape.label}
                </span>
                <button onClick={() => { deleteShape(selectedShapeId!); }} title="Delete shape"
                  style={{ border: 'none', background: '#fff1f0', borderRadius: 4, color: '#ff4d4f', cursor: 'pointer', padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                  Delete
                </button>
                <button onClick={() => selectShape(null)} title="Deselect"
                  style={{ border: 'none', background: '#f0f0f0', borderRadius: 4, color: '#595959', cursor: 'pointer', padding: '2px 6px', fontSize: 13 }}>
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#595959', lineHeight: 1.5 }}>
                Drag shape body to <b>move</b> · Drag corner handles to <b>resize</b><br/>
                Click a label below to <b>reassign</b>
              </div>
            </div>
          )}

          {/* Hint when select tool active but nothing drawn yet */}
          {currentTool === 'select' && shapes.length === 0 && viewMode === '2d' && (
            <div style={{ margin: '8px 8px 0', padding: '10px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, fontSize: 12, color: '#874d00', flexShrink: 0 }}>
              <b>Select tool active</b><br/>
              No shapes on this frame yet. Use Rectangle (R), Polygon (P), or other drawing tools to create shapes, then switch back to Select to move or resize them.
            </div>
          )}

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px' }}>
            {activeTab === 'objects' && viewMode === '3d' && (
              cuboids.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8c8c8c', fontSize: 13 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                  No cuboids annotated
                </div>
              ) : cuboids.map((c, i) => (
                <div key={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: selectedCuboidId === c.id ? '#e6f4ff' : 'transparent', border: `1px solid ${selectedCuboidId === c.id ? '#91caff' : 'transparent'}`, transition: 'all 0.1s', opacity: c.hidden ? 0.4 : 1 }}
                  onClick={() => setSelectedCuboidId(selectedCuboidId === c.id ? null : c.id)}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: selectedCuboidId === c.id ? '#1890ff' : '#262626', fontWeight: selectedCuboidId === c.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    cuboid #{i + 1} — {c.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#8c8c8c' }}>
                    {c.dimensions.w.toFixed(1)}×{c.dimensions.d.toFixed(1)}×{c.dimensions.h.toFixed(1)}m
                  </span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: c.hidden ? '#bfbfbf' : '#8c8c8c', fontSize: 12 }}
                    onClick={e => { e.stopPropagation(); setCuboids(prev => prev.map(x => x.id === c.id ? { ...x, hidden: !x.hidden } : x)); }}>
                    {c.hidden ? '🙈' : '👁'}
                  </button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: '#ff4d4f', fontSize: 14, fontWeight: 600 }}
                    onClick={e => { e.stopPropagation(); setCuboids(prev => prev.filter(x => x.id !== c.id)); if (selectedCuboidId === c.id) setSelectedCuboidId(null); }}>
                    ×
                  </button>
                </div>
              ))
            )}

            {activeTab === 'objects' && viewMode === '2d' && (
              sortedShapes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8c8c8c', fontSize: 13 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  No objects annotated
                </div>
              ) : sortedShapes.map((shape, i) => {
                const lbl = labels.find(l => l.name === shape.label);
                const color = colorBy === 'instance' ? DEFAULT_COLORS[shapes.indexOf(shape) % DEFAULT_COLORS.length] : (lbl?.color || '#1890ff');
                return (
                  <div key={shape.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: selectedShapeId === shape.id ? '#e6f4ff' : 'transparent', border: `1px solid ${selectedShapeId === shape.id ? '#91caff' : 'transparent'}`, borderLeft: outlinedBorders ? `3px solid ${color}` : undefined, transition: 'all 0.1s', opacity: shape.hidden ? 0.4 : 1 }}
                    onClick={() => selectShape(selectedShapeId === shape.id ? null : shape.id)}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: selectedShapeId === shape.id ? '#1890ff' : '#262626', fontWeight: selectedShapeId === shape.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shape.type} #{i + 1} &mdash; {shape.label}
                    </span>
                    {shape.locked && <span style={{ fontSize: 10, color: '#fa8c16' }}>🔒</span>}
                    <div style={{ display: 'flex', gap: 1 }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: shape.hidden ? '#bfbfbf' : '#8c8c8c', fontSize: 12 }}
                        onClick={e => { e.stopPropagation(); toggleHidden(shape.id); }}>
                        {shape.hidden ? '🙈' : '👁'}
                      </button>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: shape.locked ? '#fa8c16' : '#8c8c8c', fontSize: 12 }}
                        onClick={e => { e.stopPropagation(); toggleLocked(shape.id); }}>
                        {shape.locked ? '🔒' : '🔓'}
                      </button>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: '#ff4d4f', fontSize: 14, fontWeight: 600 }}
                        onClick={e => { e.stopPropagation(); deleteShape(shape.id); }}>x</button>
                    </div>
                  </div>
                );
              })
            )}

            {activeTab === 'labels' && (
              <div>
                {labels.map((lbl) => (
                  <div key={lbl.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: selectedLabel === lbl.name ? '#e6f4ff' : 'transparent', border: `1px solid ${selectedLabel === lbl.name ? '#91caff' : 'transparent'}`, transition: 'all 0.1s' }}
                    onClick={() => {
                      if (selectedShapeId) {
                        updateShape(selectedShapeId, { label: lbl.name, color: lbl.color });
                      }
                      setLabel(lbl.name, lbl.color);
                    }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: lbl.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: selectedLabel === lbl.name ? 600 : 400, color: selectedLabel === lbl.name ? '#1890ff' : '#262626' }}>{lbl.name}</span>
                    {selectedShapeId && selectedShapeId && shapes.find(s => s.id === selectedShapeId)?.label === lbl.name
                      ? <span style={{ fontSize: 10, color: '#722ed1' }}>selected</span>
                      : selectedLabel === lbl.name && !selectedShapeId && <span style={{ fontSize: 10, color: '#1890ff' }}>active</span>}
                  </div>
                ))}
                {showAddLabel ? (
                  <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input autoFocus type="text" value={newLabelName}
                      onChange={e => setNewLabelName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addLabel(); if (e.key === 'Escape') { setShowAddLabel(false); setNewLabelName(''); } }}
                      placeholder="Label name..." style={{ width: '100%', padding: '6px 8px', border: '1px solid #1890ff', borderRadius: 4, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={addLabel} disabled={addingLabel || !newLabelName.trim()} style={{ flex: 1 }}>{addingLabel ? '...' : 'Add'}</button>
                      <button className="btn btn-default btn-sm" onClick={() => { setShowAddLabel(false); setNewLabelName(''); }} style={{ flex: 1 }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddLabel(true)}
                    style={{ width: '100%', marginTop: 6, padding: '6px 8px', background: 'none', border: '1px dashed #d9d9d9', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#8c8c8c', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1890ff'; (e.currentTarget as HTMLElement).style.color = '#1890ff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLElement).style.color = '#8c8c8c'; }}>
                    + Add Label
                  </button>
                )}
              </div>
            )}
          </div>

          {/* APPEARANCE SECTION */}
          <div style={{ borderTop: '1px solid #e8e8e8', flexShrink: 0 }}>
            <button onClick={() => setAppearanceOpen(o => !o)}
              style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#595959', textTransform: 'uppercase', letterSpacing: '0.5px', justifyContent: 'space-between' }}>
              <span>Appearance</span>
              <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: appearanceOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>v</span>
            </button>
            {appearanceOpen && (
              <div style={{ padding: '0 14px 14px' }}>
                {/* Color by */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>Color by</div>
                  <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                    {(['label', 'instance'] as ColorBy[]).map(cb => (
                      <button key={cb} onClick={() => setColorBy(cb)}
                        style={{ flex: 1, padding: '5px 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: colorBy === cb ? 600 : 400, background: colorBy === cb ? '#1890ff' : '#fff', color: colorBy === cb ? '#fff' : '#595959', transition: 'all 0.15s', textTransform: 'capitalize' }}>
                        {cb}
                      </button>
                    ))}
                    <button style={{ flex: 1, padding: '5px 0', border: 'none', cursor: 'not-allowed', fontSize: 12, background: '#f5f5f5', color: '#bfbfbf' }} disabled>
                      Group
                    </button>
                  </div>
                </div>
                {/* Opacity */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                    <span>Opacity</span><span>{Math.round(fillOpacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={Math.round(fillOpacity * 100)} onChange={e => setFillOpacity(parseInt(e.target.value) / 100)} style={{ width: '100%' }} />
                </div>
                {/* Selected opacity */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                    <span>Selected opacity</span><span>{Math.round(selectedOpacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={Math.round(selectedOpacity * 100)} onChange={e => setSelectedOpacity(parseInt(e.target.value) / 100)} style={{ width: '100%' }} />
                </div>
                {/* Outlined borders */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#262626', marginBottom: 6 }}>
                  <input type="checkbox" checked={outlinedBorders} onChange={e => setOutlinedBorders(e.target.checked)} />
                  Outlined borders
                </label>
                {/* Cuboid orientation */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#262626' }}>
                  <input type="checkbox" checked={cuboidOrientation} onChange={e => setCuboidOrientation(e.target.checked)} />
                  Cuboid orientation
                </label>
              </div>
            )}
          </div>

          {/* KEYBOARD SHORTCUTS */}
          <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px 14px', flexShrink: 0, background: '#fafafa' }}>
            <div style={{ fontSize: 10, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 6 }}>Shortcuts</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: 11, color: '#595959' }}>
              {Object.entries(TOOL_KEYS).map(([tool, key]) => (
                <div key={tool}><kbd style={{ background: currentTool === tool ? '#1890ff' : '#e8e8e8', color: currentTool === tool ? '#fff' : '#262626', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>{key}</kbd> {tool}</div>
              ))}
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Del</kbd> delete</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Esc</kbd> cancel</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>left/right</kbd> frames</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>F</kbd> fit view</div>
            </div>
          </div>
        </div>
      </div>

      {/* VIDEO EXTRACTION MODAL */}
      {videoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Extract frames from video</div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 20 }}>{videoModal.file.name}</div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Frames per second</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 5, 10, 25].map(fps => (
                  <button key={fps} onClick={() => setVideoModal(v => v ? { ...v, fps } : v)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1.5px solid ${videoModal.fps === fps ? '#1890ff' : '#d9d9d9'}`, background: videoModal.fps === fps ? '#e6f4ff' : '#fff', color: videoModal.fps === fps ? '#1890ff' : '#595959', fontWeight: videoModal.fps === fps ? 600 : 400, cursor: 'pointer', fontSize: 13 }}>
                    {fps}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 8 }}>
                Higher FPS = more frames to annotate. For most annotation tasks, 1–5 fps is sufficient.
              </div>
            </div>

            {extracting && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f7ff', borderRadius: 8, fontSize: 13, color: '#1890ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                {extractProgress || 'Uploading video…'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { if (!extracting) setVideoModal(null); }}
                disabled={extracting}
                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #d9d9d9', background: '#fff', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: 13, opacity: extracting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button
                disabled={extracting}
                onClick={async () => {
                  if (!job?.task?.id || !videoModal) return;
                  setExtracting(true);
                  setExtractProgress('Uploading video…');
                  try {
                    // 1. Upload the video file
                    const fd = new FormData();
                    fd.append('taskId', job.task.id);
                    fd.append('files', videoModal.file);
                    const { data: uploaded } = await client.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    const videoFileId = uploaded[0]?.id;
                    if (!videoFileId) throw new Error('Upload failed');

                    // 2. Extract frames
                    setExtractProgress(`Extracting frames at ${videoModal.fps} fps…`);
                    const { data: result } = await client.post(`/files/${videoFileId}/extract-frames`, { fps: videoModal.fps });

                    // 3. Reload file list
                    setExtractProgress(`Done — ${result.framesExtracted} frames extracted`);
                    const { data: updated } = await client.get(`/files/task/${job.task.id}`);
                    setFiles(updated);
                    setTimeout(() => { setVideoModal(null); setExtracting(false); setExtractProgress(''); }, 800);
                  } catch (err: any) {
                    setExtractProgress('');
                    setExtracting(false);
                    alert(err?.response?.data?.error || err?.message || 'Extraction failed');
                  }
                }}
                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: extracting ? '#91caff' : '#1890ff', color: '#fff', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                {extracting ? 'Working…' : 'Extract frames'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS BAR */}
      <div style={{ height: 24, background: '#1f1f1f', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16, flexShrink: 0, borderTop: '1px solid #333' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Frame {frameNum + 1}/{files.length}
        </span>
        {currentImage && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{currentImage.originalName}</span>}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {viewMode === '3d'
            ? `${cuboids.length} cuboid${cuboids.length !== 1 ? 's' : ''}`
            : `${shapes.length} object${shapes.length !== 1 ? 's' : ''}`}
        </span>
        {selectedShape && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Selected: {selectedShape.type} &mdash; {selectedShape.label}
          </span>
        )}
        {isPlaying && <span style={{ fontSize: 11, color: '#52c41a' }}>Playing</span>}
        {saving && <span style={{ fontSize: 11, color: '#fa8c16' }}>Saving...</span>}
        {saved && <span style={{ fontSize: 11, color: '#52c41a' }}>Saved</span>}
      </div>
    </div>
  );
}

// Small helper components
function ToolbarBtn({ children, onClick, title, active = false, disabled = false }: { children: React.ReactNode; onClick?: () => void; title?: string; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{ height: 32, padding: '0 8px', border: 'none', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: active ? '#e6f4ff' : 'transparent', color: active ? '#1890ff' : '#595959', fontSize: 13, fontWeight: active ? 600 : 400, opacity: disabled ? 0.4 : 1, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function NavBtn({ children, onClick, title, disabled = false, active = false }: { children: React.ReactNode; onClick?: () => void; title?: string; disabled?: boolean; active?: boolean }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, border: '1px solid transparent', borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? '#1890ff' : hovered && !disabled ? '#f0f0f0' : 'transparent',
        color: active ? '#fff' : disabled ? '#d0d0d0' : '#444',
        transition: 'all 0.12s',
      }}>
      {children}
    </button>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none',
  background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#262626', textAlign: 'left',
};
