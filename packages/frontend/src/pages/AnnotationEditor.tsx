import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import AnnotationCanvas from '../components/AnnotationCanvas';
import PointCloudCanvas, { Cuboid3D } from '../components/PointCloudCanvas';
import { useAnnotationStore, ToolType } from '../store/annotationStore';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuthStore } from '../store/authStore';
import TextAnnotationCanvas, { TextSpan } from '../components/TextAnnotationCanvas';

interface JobInfo {
  id: string;
  stage: string;
  state: string;
  type?: string;
  frameStart: number;
  frameEnd: number;
  reviewNote?: string;
  assignee?: { id: string; username: string };
  validatedBy?: { id: string; username: string };
  acceptedBy?: { id: string; username: string };
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
  segment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>,
};
const TOOL_KEYS: Record<ToolType, string> = { select: 'S', rect: 'R', polygon: 'P', polyline: 'L', point: 'D', ellipse: 'E', segment: 'M' };
const TOOL_LABELS: Record<ToolType, string> = { select: 'Select', rect: 'Rectangle', polygon: 'Polygon', polyline: 'Polyline', point: 'Point', ellipse: 'Ellipse', segment: 'Segment (SAM)' };

type SortBy = 'id' | 'id_desc' | 'label' | 'area';
type ColorBy = 'label' | 'instance';

// ─── Track interpolation utilities ───────────────────────────────────────────
function lerpPts(a: { x: number; y: number }[], b: { x: number; y: number }[], t: number) {
  if (a.length !== b.length) return a;
  return a.map((pt, i) => ({ x: pt.x + (b[i].x - pt.x) * t, y: pt.y + (b[i].y - pt.y) * t }));
}

interface TrackShape {
  id: string; type: 'rect'; label: string; color: string;
  points: { x: number; y: number }[];
  occluded?: boolean; attributes: Record<string, unknown>;
  trackId: string; isInterpolated: boolean;
}

function computeTrackShapes(
  tracks: { id: string; label: string; color: string; keyframes: Record<string, { points: { x: number; y: number }[]; occluded?: boolean; attributes?: Record<string, unknown> }> }[],
  frame: number
): TrackShape[] {
  return tracks.flatMap(tr => {
    const kfNums = Object.keys(tr.keyframes).map(Number).sort((a, b) => a - b);
    if (!kfNums.length) return [];
    const exact = tr.keyframes[frame];
    if (exact) return [{ id: `track_${tr.id}_${frame}`, type: 'rect' as const, label: tr.label, color: tr.color, points: exact.points, occluded: exact.occluded, attributes: (exact.attributes || {}) as Record<string, unknown>, trackId: tr.id, isInterpolated: false } as TrackShape];
    const prev = [...kfNums].filter(f => f < frame).pop();
    const next = kfNums.find(f => f > frame);
    if (prev === undefined || next === undefined) return [];
    const t = (frame - prev) / (next - prev);
    const pk = tr.keyframes[prev], nk = tr.keyframes[next];
    if (pk.points.length !== nk.points.length) return [];
    return [{ id: `track_${tr.id}_${frame}`, type: 'rect' as const, label: tr.label, color: tr.color, points: lerpPts(pk.points, nk.points, t), occluded: undefined, attributes: {} as Record<string, unknown>, trackId: tr.id, isInterpolated: true } as TrackShape];
  });
}

// ─── Automated QA utilities ───────────────────────────────────────────────────
function rectBounds(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return null;
  return { x1: Math.min(pts[0].x, pts[1].x), y1: Math.min(pts[0].y, pts[1].y), x2: Math.max(pts[0].x, pts[1].x), y2: Math.max(pts[0].y, pts[1].y) };
}
function shapeIoU(a: { type: string; points: { x: number; y: number }[] }, b: { type: string; points: { x: number; y: number }[] }): number {
  if (a.type !== 'rect' || b.type !== 'rect') return 0;
  const ar = rectBounds(a.points), br = rectBounds(b.points);
  if (!ar || !br) return 0;
  const ix1 = Math.max(ar.x1, br.x1), iy1 = Math.max(ar.y1, br.y1);
  const ix2 = Math.min(ar.x2, br.x2), iy2 = Math.min(ar.y2, br.y2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  return inter / ((ar.x2 - ar.x1) * (ar.y2 - ar.y1) + (br.x2 - br.x1) * (br.y2 - br.y1) - inter);
}

export default function AnnotationEditor() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobInfo | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [frameNum, setFrameNum] = useState(0);
  const [labels, setLabels] = useState<{ name: string; color: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'objects' | 'labels' | 'audit'>('objects');

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

  // SAM interactive segmentation
  const [segmenting, setSegmenting] = useState(false);

  // AI auto-annotation
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'ok' | 'unavailable'>('idle');
  const [aiToast, setAiToast] = useState<string | null>(null);
  const [aiConf, setAiConf] = useState(0.15);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiModelName, setAiModelName] = useState('mock');
  const [aiModels, setAiModels] = useState<any[]>([]);
  const [aiInfoOpen, setAiInfoOpen] = useState<string | null>(null); // model id with info expanded
  const [aiClasses, setAiClasses] = useState(''); // comma-separated classes for YOLO-World

  // Copy/paste & help
  const [clipboardShape, setClipboardShape] = useState<any | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');

  // Batch AI annotation
  const [batchAiLoading, setBatchAiLoading] = useState(false);
  const [batchAiProgress, setBatchAiProgress] = useState({ done: 0, total: 0 });

  // Text annotation (for text/csv dataTypes)
  const [textContent, setTextContent] = useState('');
  const [textSpans, setTextSpans] = useState<TextSpan[]>([]);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  // Image enhancement
  const [imgBrightness, setImgBrightness] = useState(100);
  const [imgContrast, setImgContrast]    = useState(100);
  const [imgSaturation, setImgSaturation] = useState(100);
  const [enhanceOpen, setEnhanceOpen]    = useState(false);
  const imgFilterStyle = (imgBrightness !== 100 || imgContrast !== 100 || imgSaturation !== 100)
    ? `brightness(${imgBrightness / 100}) contrast(${imgContrast / 100}) saturate(${imgSaturation / 100})`
    : undefined;

  // Full label objects (with attributes + descriptions)
  interface LabelAttrDef { id?: number; name: string; input_type: string; mutable: boolean; values: string[]; default_value?: string; }
  interface FullLabel { id: string; name: string; color?: string; description?: string; type?: string; attributes?: LabelAttrDef[]; }
  const [fullLabels, setFullLabels] = useState<FullLabel[]>([]);

  // Review / validation mode
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [annotationSummary, setAnnotationSummary] = useState<{ frameCount: number; totalShapes: number } | null>(null);

  // Audit trail
  interface AuditEntry {
    id: string; action: string; note: string | null;
    changes: Record<string, { from: unknown; to: unknown }> | null;
    user: { id: string; username: string } | null;
    createdAt: string;
  }
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const AUDIT_PAGE = 30;
  const dataType = (job?.task?.project as any)?.dataType?.toLowerCase() || '';
  const isTextMode = dataType === 'text' || dataType === 'csv';

  // Frame-level tags
  const [frameTags, setFrameTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Object tracking
  interface TrackKeyframe { points: { x: number; y: number }[]; occluded?: boolean; attributes?: Record<string, unknown>; }
  interface Track { id: string; label: string; color: string; keyframes: Record<string, TrackKeyframe>; }
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoaded, setTracksLoaded] = useState(false);

  // QA (automated quality checks)
  const [qaOpen, setQaOpen] = useState(false);

  // Shape issues
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  type ShapeIssueItem = { id: string; shapeId: string | null; comment: string; status: string; authorId: string; author?: { username: string }; createdAt: string; };
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issues, setIssues] = useState<ShapeIssueItem[]>([]);
  const [issueInput, setIssueInput] = useState('');
  const [issuePending, setIssuePending] = useState(false);

  // Active learning — per-frame min confidence from AI shapes
  const [frameConfidence, setFrameConfidence] = useState<Record<number, number>>({});
  const [sortByUncertainty, setSortByUncertainty] = useState(false);

  // Time-per-frame tracking
  const frameStartTime = useRef<number>(Date.now());

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameLoadingRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  // Track IDs of shapes added by the last AI Annotate run so we can replace them next time
  const aiShapeIds = useRef<string[]>([]);

  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  const confirm = useConfirm();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isEditable = !job || job.stage === 'annotation';

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
        if (j.state === 'new') {
          client.patch(`/jobs/${jobId}`, { state: 'in_progress' }).then(() => {
            setJob(prev => prev ? { ...prev, state: 'in_progress' } : prev);
          }).catch(() => {});
        }
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
        // Start on the job's assigned first frame, not frame 0
        setFrameNum(j.frameStart ?? 0);
      } catch { navigate(-1); }
    };
    load();
  }, [jobId, navigate, setLabel]);

  // Fetch AI model catalog
  useEffect(() => {
    client.get('/ai/models').then(({ data }) => {
      setAiModels(data.models || []);
    }).catch(() => {});
  }, []);

  // Load annotation summary for validation/acceptance mode
  useEffect(() => {
    if (!jobId || !job || job.stage === 'annotation') return;
    client.get(`/annotations/job/${jobId}`).then(({ data }) => {
      const totalShapes = (data.frames || []).reduce((sum: number, f: any) => sum + (f.shapes?.length || 0), 0);
      setAnnotationSummary({ frameCount: data.frameCount || 0, totalShapes });
    }).catch(() => {});
  }, [jobId, job?.stage]);

  // Load full label objects (with attributes + descriptions) for the current project
  useEffect(() => {
    const pid = job?.task?.project?.id;
    if (!pid) return;
    client.get(`/labels/${pid}`).then(({ data }) => setFullLabels(data.labels || [])).catch(() => {});
  }, [job?.task?.project?.id]);

  // Load audit entries when the audit tab is opened (or on first open)
  const fetchAudit = useCallback(async (offset = 0, append = false) => {
    if (!jobId) return;
    setAuditLoading(true);
    try {
      const { data } = await client.get(`/audits/jobs/${jobId}`, { params: { limit: AUDIT_PAGE, offset } });
      setAuditTotal(data.total);
      setAuditOffset(offset + data.entries.length);
      setAuditEntries(prev => append ? [...prev, ...data.entries] : data.entries);
    } catch { /* no-op */ }
    finally { setAuditLoading(false); }
  }, [jobId]);

  useEffect(() => {
    if (activeTab === 'audit' && jobId && auditEntries.length === 0) {
      fetchAudit(0, false);
    }
  }, [activeTab, jobId]);

  // Load frame annotations — isCurrent prevents stale responses from overwriting a later frame
  useEffect(() => {
    if (!jobId) return;
    let isCurrent = true;
    frameLoadingRef.current = true;
    clearShapes();
    aiShapeIds.current = [];
    const load = async () => {
      try {
        const { data } = await client.get(`/jobs/${jobId}/frame/${frameNum}`);
        if (!isCurrent) return;
        // Merge saved shapes with interpolated track shapes
        const trackShapes = computeTrackShapes(tracks, frameNum) as any[];
        // Don't add track shapes whose track already has a keyframe saved in data.shapes
        const savedTrackIds = new Set((data.shapes || []).map((s: any) => s.trackId).filter(Boolean));
        const filteredTrackShapes = trackShapes.filter(ts => !savedTrackIds.has(ts.trackId));
        setShapes([...(data.shapes || []), ...filteredTrackShapes]);
        setFrameTags(data.tags || []);
        setCuboids(data.cuboids || []);
        if (data.textSpans) setTextSpans(data.textSpans);
      } catch (err: any) {
        if (isCurrent && err?.response?.status !== 404) {
          toastRef.current.error('Failed to load annotations', 'Could not fetch frame data from the server.');
        }
      } finally {
        if (isCurrent) frameLoadingRef.current = false;
      }
    };
    load();
    return () => { isCurrent = false; };
  }, [jobId, frameNum, setShapes, clearShapes, tracks]);

  // Load text content for text/csv frames
  useEffect(() => {
    if (!isTextMode) return;
    const f = files[frameNum];
    if (!f) { setTextContent(''); return; }
    client.get(`/files/${f.id}/text`).then(({ data }) => {
      setTextContent(data.content || '');
    }).catch(() => setTextContent(''));
  }, [isTextMode, files, frameNum]);

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
    if (!jobId || !isEditable) return;
    if (!silent) setSaving(true);
    try {
      const timeSpentMs = Date.now() - frameStartTime.current;

      // Separate track shapes from regular shapes
      const regularShapes = shapes.filter(s => !s.trackId);
      const trackedShapes = shapes.filter(s => s.trackId);

      // If tracked shapes exist on this frame, update their track keyframes
      if (trackedShapes.length > 0) {
        const updatedTracks = tracks.map(tr => {
          const ts = trackedShapes.find(s => s.trackId === tr.id);
          if (!ts) return tr;
          return { ...tr, keyframes: { ...tr.keyframes, [frameNum]: { points: ts.points, occluded: ts.occluded, attributes: ts.attributes } } };
        });
        setTracks(updatedTracks);
        client.put(`/jobs/${jobId}/tracks`, { tracks: updatedTracks }).catch(() => {});
      }

      await client.post(`/jobs/${jobId}/frame/${frameNum}`, { shapes: regularShapes, cuboids, tags: frameTags, tracks: [], timeSpentMs });
      // Auto-reopen: annotation stage job that was marked completed gets reset to in_progress
      if (job?.stage === 'annotation' && job?.state === 'completed') {
        setJob(j => j ? { ...j, state: 'in_progress' } : j);
        if (!silent) toastRef.current.info('Job reopened', 'Annotations edited after completion — state reset to in progress.');
      }
      if (!silent) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* no-op */ }
    finally { if (!silent) setSaving(false); }
  }, [jobId, frameNum, shapes, cuboids, frameTags, isEditable, job?.stage, job?.state, setJob, tracks]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!frameLoadingRef.current) saveAnnotations(true);
    }, 3000);
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
    const lo = job?.frameStart ?? 0;
    const hi = job?.frameEnd ?? (files.length - 1);
    const clamped = Math.max(lo, Math.min(n, hi));
    if (clamped === frameNum) return;
    // Only save if the frame has fully loaded — avoids overwriting annotations with an empty array
    if (jobId && !frameLoadingRef.current && isEditable) {
      const regularShapes = shapes.filter(s => !s.trackId);
      const trackedShapes = shapes.filter(s => s.trackId);
      if (trackedShapes.length > 0) {
        const updatedTracks = tracks.map(tr => {
          const ts = trackedShapes.find(s => s.trackId === tr.id);
          if (!ts) return tr;
          return { ...tr, keyframes: { ...tr.keyframes, [frameNum]: { points: ts.points, occluded: ts.occluded, attributes: ts.attributes } } };
        });
        client.put(`/jobs/${jobId}/tracks`, { tracks: updatedTracks }).catch(() => {});
      }
      try { await client.post(`/jobs/${jobId}/frame/${frameNum}`, { shapes: regularShapes, cuboids, tags: frameTags, tracks: [] }); } catch { /* no-op */ }
    }
    setFrameNum(clamped);
  }, [jobId, frameNum, shapes, cuboids, files.length, job?.frameStart, job?.frameEnd, isEditable]);

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

      // Undo / Redo — wired here so they work even when toolbar has focus
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }

      // Copy / Paste selected shape
      if (e.ctrlKey && e.key === 'c') {
        const sel = shapes.find(s => s.id === selectedShapeId);
        if (sel) { setClipboardShape({ ...sel }); toast.info('Copied', `${sel.type} shape copied`); }
        return;
      }
      if (e.ctrlKey && e.key === 'v') {
        setClipboardShape((cb: any) => {
          if (!cb) return cb;
          const newShape = { ...cb, id: crypto.randomUUID(), points: cb.points.map((p: any) => ({ x: p.x + 12, y: p.y + 12 })) };
          addShape(newShape);
          selectShape(newShape.id);
          return cb;
        });
        return;
      }

      // Tab — cycle through shapes
      if (e.key === 'Tab') {
        e.preventDefault();
        if (shapes.length === 0) return;
        const idx = shapes.findIndex(s => s.id === selectedShapeId);
        const next = e.shiftKey
          ? (idx <= 0 ? shapes.length - 1 : idx - 1)
          : (idx >= shapes.length - 1 ? 0 : idx + 1);
        selectShape(shapes[next].id);
        setActiveTab('objects');
        return;
      }

      // Number keys 1-9 — assign label by index to selected shape
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey) {
        const lbl = labels[parseInt(e.key) - 1];
        if (lbl && selectedShapeId) {
          updateShape(selectedShapeId, { label: lbl.name, color: lbl.color });
          setLabel(lbl.name, lbl.color);
          toast.success('Label assigned', `→ ${lbl.name}`);
        }
        return;
      }

      // ? — toggle keyboard help modal
      if (e.key === '?') { setShowHelp(h => !h); return; }

      // 2D tool keys only fire in 2D mode (avoids conflict with 3D nudge keys)
      if (viewMode === '2d') {
        const toolMap: Record<string, ToolType> = { s: 'select', r: 'rect', p: 'polygon', l: 'polyline', d: 'point', e: 'ellipse', m: 'segment' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) { setTool(tool); return; }
      }
      if (e.key === 'ArrowLeft') goToFrame(frameNum - 1);
      if (e.key === 'ArrowRight') goToFrame(frameNum + 1);
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveAnnotations(); }
      if (e.key === 'Escape') { setMenuOpen(false); setShowHelp(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, setTool, goToFrame, saveAnnotations, frameNum, shapes, selectedShapeId, labels, clipboardShape, undo, redo, updateShape, setLabel, addShape, selectShape, toast]);

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

  // Load job tracks when job is ready
  useEffect(() => {
    if (!jobId || tracksLoaded) return;
    client.get(`/jobs/${jobId}/tracks`).then(({ data }) => {
      setTracks(Array.isArray(data) ? data : []);
      setTracksLoaded(true);
    }).catch(() => setTracksLoaded(true));
  }, [jobId, tracksLoaded]);

  // Load shape issues for the current frame
  useEffect(() => {
    if (!jobId) return;
    client.get(`/shape-issues?jobId=${jobId}&frameNumber=${frameNum}`)
      .then(({ data }) => setIssues(Array.isArray(data) ? data : []))
      .catch(() => setIssues([]));
  }, [jobId, frameNum]);

  // Reset per-frame timer whenever we navigate to a new frame
  useEffect(() => { frameStartTime.current = Date.now(); }, [frameNum]);

  // Record per-frame confidence from AI-annotated shapes
  useEffect(() => {
    const aiShapes = shapes.filter(s => s.confidence !== undefined && s.confidence > 0);
    if (aiShapes.length > 0) {
      const minConf = Math.min(...aiShapes.map(s => s.confidence!));
      setFrameConfidence(prev => ({ ...prev, [frameNum]: minConf }));
    }
  }, [shapes, frameNum]);

  // QA issues: overlapping shapes + duplicate labels
  const qaIssues = useMemo(() => {
    const issues: { type: 'overlap' | 'tiny'; id: string; msg: string }[] = [];
    const visibleShapes = shapes.filter(s => !s.hidden);
    for (let i = 0; i < visibleShapes.length; i++) {
      for (let j = i + 1; j < visibleShapes.length; j++) {
        const iou = shapeIoU(visibleShapes[i], visibleShapes[j]);
        if (iou > 0.5) issues.push({ type: 'overlap', id: visibleShapes[i].id, msg: `"${visibleShapes[i].label}" overlaps "${visibleShapes[j].label}" (IoU ${iou.toFixed(2)})` });
      }
      if (visibleShapes[i].type === 'rect') {
        const r = rectBounds(visibleShapes[i].points);
        if (r && (r.x2 - r.x1) < 8 && (r.y2 - r.y1) < 8) issues.push({ type: 'tiny', id: visibleShapes[i].id, msg: `"${visibleShapes[i].label}" is very small (<8px)` });
      }
    }
    return issues;
  }, [shapes]);

  // Sorted frame list for active learning (lowest confidence first)
  const uncertainFrameOrder = useMemo(() => {
    return files.map((_, i) => i).sort((a, b) => {
      const ca = frameConfidence[a] ?? 1;
      const cb = frameConfidence[b] ?? 1;
      return ca - cb;
    });
  }, [files, frameConfidence]);

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
      toast.success('Imported', `Annotations loaded from ${file.name}`);
    } catch { toast.error('Import failed', 'Check the file is a valid AnnotateMe JSON export'); }
    setMenuOpen(false);
    e.target.value = '';
  }, [jobId, frameNum, setShapes, toast]);

  // SAM interactive segmentation handler
  const handleSegmentClick = useCallback(async (imgX: number, imgY: number) => {
    if (!jobId) return;
    setSegmenting(true);
    try {
      const { data } = await client.post('/ai/segment', { jobId, frameIndex: frameNum, x: imgX, y: imgY });
      const pts: { x: number; y: number }[] = data.points || [];
      if (pts.length >= 3) {
        addShape({
          id: crypto.randomUUID(),
          type: 'polygon',
          label: selectedLabel || 'object',
          color: selectedLabelColor,
          points: pts,
        });
        toast.success('Segmented', `${pts.length}-point polygon created`);
      } else {
        toast.warning('No mask found', 'SAM could not find an object at that point — try clicking closer to the center of the object.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail || 'AI service unavailable';
      toast.error('Segmentation failed', msg);
    } finally {
      setSegmenting(false);
    }
  }, [jobId, frameNum, selectedLabel, selectedLabelColor, addShape, toast]);

  const handleExport = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await client.get(`/jobs/${jobId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `job-${jobId}-annotations.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported', 'Annotation file downloaded');
    } catch { toast.error('Export failed', 'Could not download annotations'); }
    setMenuOpen(false);
  }, [jobId, toast]);

  const handleAutoAnnotate = useCallback(async () => {
    if (!jobId) return;
    setAiLoading(true);
    setAiToast(null);
    try {
      // Remove shapes from the previous AI run before adding new ones
      aiShapeIds.current.forEach(id => deleteShape(id));
      aiShapeIds.current = [];

      const { data } = await client.post('/ai/annotate', { jobId, frameIndex: frameNum, confidenceThreshold: aiConf, modelName: aiModelName, classes: aiClasses || undefined });
      const newShapes: any[] = data.shapes || [];
      newShapes.forEach(s => addShape(s));
      aiShapeIds.current = newShapes.map((s: any) => s.id);

      const isMock = data.model === 'MockModel';
      const baseMsg = isMock
        ? `${newShapes.length} demo shape${newShapes.length !== 1 ? 's' : ''} added (MockModel generates random shapes for UI testing — not real detections)`
        : `${newShapes.length} object${newShapes.length !== 1 ? 's' : ''} detected by ${data.model}`;
      const toastMsg = data.note ? `${baseMsg} — ${data.note}` : baseMsg;
      setAiToast(toastMsg);
      setTimeout(() => setAiToast(null), isMock || newShapes.length === 0 ? 8000 : 4000);
    } catch (err: any) {
      const msg = err.response?.data?.error
        || err.response?.data?.detail
        || (err.response ? `HTTP ${err.response.status}` : 'AI service unavailable — is it running?');
      setAiToast(`Error: ${msg}`);
      setTimeout(() => setAiToast(null), 7000);
    } finally {
      setAiLoading(false);
    }
  }, [jobId, frameNum, addShape, deleteShape, aiConf, aiModelName, aiClasses]);

  const handleRemoveAll = useCallback(async () => {
    if (!jobId) return;
    const ok = await confirm({ title: 'Remove all annotations', message: 'Remove ALL annotations from this job? This cannot be undone.', variant: 'danger', confirmLabel: 'Remove all' });
    if (!ok) return;
    try {
      await client.delete(`/jobs/${jobId}/annotations`);
      clearShapes();
      toast.success('Cleared', 'All annotations removed');
    } catch { toast.error('Failed', 'Could not remove annotations'); }
    setMenuOpen(false);
  }, [jobId, clearShapes, confirm, toast]);

  const handleChangeState = useCallback(async (state: string) => {
    if (!jobId) return;
    setMenuOpen(false); setStateSubmenu(false);
    try {
      await client.patch(`/jobs/${jobId}`, { state });
      setJob(j => j ? { ...j, state } : j);
      toast.success('State updated', state.replace('_', ' '));
    } catch (err: any) {
      toast.error('Failed to change state', err?.response?.data?.error || err?.message || 'Unknown error');
    }
  }, [jobId, toast]);

  const handleResetToAnnotation = useCallback(async () => {
    if (!jobId) return;
    const ok = await confirm({
      title: 'Reset job to annotation?',
      message: 'This will move the job back to annotation stage and mark it as in progress. The annotator will need to re-submit through the full review workflow.',
      confirmLabel: 'Reset to annotation',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await client.patch(`/jobs/${jobId}`, { stage: 'annotation', state: 'in_progress' });
      setJob(j => j ? { ...j, stage: 'annotation', state: 'in_progress' } : j);
      toast.success('Job reset', 'Job is now back in annotation stage.');
      setMenuOpen(false);
    } catch { toast.error('Failed to reset', 'Could not reset job to annotation stage.'); }
  }, [jobId, confirm, toast]);

  const handleFinishJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await saveAnnotations(true);
      await client.patch(`/jobs/${jobId}`, { state: 'completed' });
      navigate(-1);
    } catch { navigate(-1); }
  }, [jobId, saveAnnotations, navigate]);

  const handleSubmitForReview = useCallback(async () => {
    if (!jobId) return;
    const ok = await confirm({
      title: 'Submit for review?',
      message: 'This will mark the job as complete and send it to validation. A reviewer will check your annotations.',
      confirmLabel: 'Submit for review',
    });
    if (!ok) return;
    try {
      await saveAnnotations(true);
      await client.patch(`/jobs/${jobId}`, { state: 'completed', stage: 'validation' });
      setJob(j => j ? { ...j, state: 'completed', stage: 'validation' } : j);
      toast.success('Submitted for review', 'A validator will check your annotations.');
      setMenuOpen(false);
      navigate(-1);
    } catch { toast.error('Failed to submit', 'Could not update job state.'); }
  }, [jobId, saveAnnotations, confirm, toast, navigate]);

  const handleApprove = useCallback(async () => {
    if (!jobId || !job) return;
    const isValidation = job.stage === 'validation';
    const ok = await confirm({
      title: isValidation ? 'Approve validation?' : 'Accept annotations?',
      message: isValidation
        ? 'Validation passed. The job will move to acceptance review for final sign-off.'
        : 'Accept these annotations as final. The job will be fully completed.',
      confirmLabel: isValidation ? 'Move to Acceptance' : 'Accept & Complete',
    });
    if (!ok) return;
    try {
      await saveAnnotations(true);
      if (isValidation) {
        // Validation approved → send to acceptance review (not yet completed)
        await client.patch(`/jobs/${jobId}`, { stage: 'acceptance', state: 'new', reviewNote: '', validatedById: user?.id });
        setJob(j => j ? { ...j, stage: 'acceptance', state: 'new', reviewNote: '', validatedBy: user ? { id: user.id, username: user.username } : j?.validatedBy } : j);
        toast.success('Validation approved', 'Job moved to acceptance review.');
      } else {
        // Acceptance approved → job is fully done
        await client.patch(`/jobs/${jobId}`, { stage: 'acceptance', state: 'completed', reviewNote: '', acceptedById: user?.id });
        setJob(j => j ? { ...j, stage: 'acceptance', state: 'completed', reviewNote: '', acceptedBy: user ? { id: user.id, username: user.username } : j?.acceptedBy } : j);
        toast.success('Accepted', 'Job fully accepted and completed.');
      }
      navigate(-1);
    } catch { toast.error('Failed to approve', 'Could not update job state.'); }
  }, [jobId, job, user?.id, saveAnnotations, confirm, toast, navigate]);

  const handleRequestChanges = useCallback(async () => {
    if (!jobId) return;
    setShowReviewDialog(true);
  }, [jobId]);

  const handleSubmitRequestChanges = useCallback(async () => {
    if (!jobId) return;
    try {
      // Always reset to annotation stage so the annotator can edit again
      await client.patch(`/jobs/${jobId}`, { stage: 'annotation', state: 'rejected', reviewNote: reviewNoteInput.trim() });
      setJob(j => j ? { ...j, stage: 'annotation', state: 'rejected', reviewNote: reviewNoteInput.trim() } : j);
      setShowReviewDialog(false);
      setReviewNoteInput('');
      toast.success('Changes requested', 'The annotator will be notified and can now edit the job.');
      navigate(-1);
    } catch { toast.error('Failed to request changes', 'Could not update job state.'); }
  }, [jobId, reviewNoteInput, toast, navigate]);

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

  // Batch AI annotation — annotate every frame in the job
  const handleBatchAutoAnnotate = useCallback(async () => {
    if (!jobId || files.length === 0) return;
    const total = files.length;
    const ok = await confirm({ title: 'Batch AI Annotate', message: `Run AI on all ${total} frames? Existing annotations will be replaced with AI predictions.`, variant: 'warning', confirmLabel: `Annotate ${total} frames` });
    if (!ok) return;
    setBatchAiLoading(true);
    setBatchAiProgress({ done: 0, total });
    setAiPanelOpen(false);
    let succeeded = 0;
    let totalShapes = 0;
    for (let i = 0; i < total; i++) {
      const frameIndex = files[i].frameNumber; // use actual DB frame number, not loop index
      try {
        const { data } = await client.post('/ai/annotate', {
          jobId, frameIndex, confidenceThreshold: aiConf,
          modelName: aiModelName, classes: aiClasses || undefined,
        });
        const aiShapes: any[] = data.shapes || [];
        // Save shapes to this frame — /ai/annotate only returns them, doesn't persist
        await client.post(`/jobs/${jobId}/frame/${frameIndex}`, {
          shapes: aiShapes, cuboids: [], tags: [], tracks: [],
        });
        totalShapes += aiShapes.length;
        succeeded++;
      } catch { /* skip failed frames, continue batch */ }
      setBatchAiProgress({ done: i + 1, total });
    }
    setBatchAiLoading(false);
    setBatchAiProgress({ done: 0, total: 0 });
    // Reload current frame to show its new annotations
    try {
      const { data } = await client.get(`/jobs/${jobId}/frame/${frameNum}`);
      setShapes(data.shapes || []);
    } catch { /* no-op */ }
    toast.success('Batch complete', `${succeeded}/${total} frames — ${totalShapes} shapes created`);
  }, [jobId, files, aiConf, aiModelName, aiClasses, frameNum, setShapes, confirm, toast]);

  // Copy all shapes on current frame to the next frame
  const handleCopyToNextFrame = useCallback(async () => {
    if (!jobId || shapes.length === 0 || frameNum >= files.length - 1) return;
    const nextFrame = frameNum + 1;
    try {
      await client.post(`/jobs/${jobId}/frame/${nextFrame}`, { shapes, cuboids, tags: [], tracks: [] });
      toast.success('Copied to next frame', `${shapes.length} shape${shapes.length !== 1 ? 's' : ''} → frame ${nextFrame + 1}`);
    } catch { toast.error('Copy failed', 'Could not copy shapes to the next frame'); }
  }, [jobId, frameNum, shapes, cuboids, files.length, toast]);

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
                onClick={() => { toast.info('Run actions', 'No automated actions configured for this job'); setMenuOpen(false); }}
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
              {isEditable && (
                <>
                  <button style={{ ...menuItemStyle, color: '#1890ff', fontWeight: 600 }} onClick={handleSubmitForReview}
                    onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                    Submit for validation
                  </button>
                  <button style={{ ...menuItemStyle, color: '#52c41a', fontWeight: 600 }} onClick={handleFinishJob}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f6ffed')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Finish the job
                  </button>
                </>
              )}
              {!isEditable && isAdmin && (
                <>
                  <div style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />
                  <button style={{ ...menuItemStyle, color: '#ff4d4f', fontWeight: 600 }} onClick={handleResetToAnnotation}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fff1f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    Reset to annotation (in progress)
                  </button>
                </>
              )}
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
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%', borderRight: '1px solid #e8e8e8' }}>
          {/* Run button */}
          <button
            onClick={handleAutoAnnotate}
            disabled={aiLoading}
            title="Auto-annotate this frame with AI"
            style={{ height: '100%', padding: '0 10px', border: 'none', background: aiLoading ? '#e6f4ff' : 'transparent', cursor: aiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2563EB', fontWeight: 600, transition: 'background 0.15s' }}
            onMouseEnter={e => { if (!aiLoading) e.currentTarget.style.background = '#e6f4ff'; }}
            onMouseLeave={e => { if (!aiLoading) e.currentTarget.style.background = 'transparent'; }}
          >
            {aiLoading
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
            }
            {aiLoading ? 'Detecting…' : `AI Annotate (${aiModelName})`}
          </button>
          {/* Settings chevron */}
          <button
            onClick={() => setAiPanelOpen(o => !o)}
            title="AI settings"
            style={{ height: '100%', padding: '0 6px', border: 'none', borderLeft: '1px solid #e8e8e8', background: aiPanelOpen ? '#e6f4ff' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#2563EB', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
            onMouseLeave={e => { if (!aiPanelOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="#2563EB"><path d={aiPanelOpen ? 'M5 3L1 7h8z' : 'M5 7L1 3h8z'}/></svg>
          </button>

          {/* Dropdown settings panel */}
          {aiPanelOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #e8e8e8', borderRadius: '0 0 8px 8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 14, zIndex: 200, minWidth: 260, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI Settings</div>

              {/* Model selector */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Model</div>
                {aiModels.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#8c8c8c' }}>Loading models…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {aiModels.map((m: any) => {
                      const isSelected = aiModelName === m.id;
                      const isDisabled = !m.integrated;
                      const badgeColors: Record<string, { bg: string; color: string; border: string }> = {
                        orange: { bg: '#fff7e6', color: '#d46b08', border: '#ffd591' },
                        blue:   { bg: '#e6f7ff', color: '#096dd9', border: '#91d5ff' },
                        green:  { bg: '#f6ffed', color: '#389e0d', border: '#b7eb8f' },
                        purple: { bg: '#f9f0ff', color: '#722ed1', border: '#d3adf7' },
                      };
                      const bc = m.badgeColor ? badgeColors[m.badgeColor] : null;
                      const infoShowing = aiInfoOpen === m.id;
                      return (
                        <div key={m.id}>
                          <div
                            onClick={() => {
                              if (isDisabled) return;
                              setAiModelName(m.id);
                              if (m.defaultConfidence != null) setAiConf(m.defaultConfidence);
                            }}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              padding: '7px 8px', borderRadius: 6,
                              background: isSelected ? '#e6f4ff' : isDisabled ? '#fafafa' : '#fafafa',
                              border: `1px solid ${isSelected ? '#2563EB' : '#e8e8e8'}`,
                              opacity: isDisabled ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="radio" name="aiModel" value={m.id}
                              checked={isSelected} disabled={isDisabled}
                              onChange={() => {
                                if (isDisabled) return;
                                setAiModelName(m.id);
                                if (m.defaultConfidence != null) setAiConf(m.defaultConfidence);
                              }}
                              style={{ marginTop: 3, accentColor: '#2563EB', flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: isDisabled ? '#8c8c8c' : '#262626' }}>{m.name}</span>
                                {m.badge && bc && (
                                  <span style={{ fontSize: 9, fontWeight: 700, background: bc.bg, color: bc.color, border: `1px solid ${bc.border}`, borderRadius: 3, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0 }}>{m.badge}</span>
                                )}
                                {isDisabled && (
                                  <span style={{ fontSize: 9, fontWeight: 700, background: '#f5f5f5', color: '#8c8c8c', border: '1px solid #d9d9d9', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>COMING SOON</span>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 1 }}>{m.tagline}</div>
                            </div>
                            {/* Info icon */}
                            <button
                              onClick={e => { e.stopPropagation(); setAiInfoOpen(infoShowing ? null : m.id); }}
                              title="About this model"
                              style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', border: `1px solid ${infoShowing ? '#2563EB' : '#d9d9d9'}`, background: infoShowing ? '#e6f4ff' : '#fff', color: infoShowing ? '#2563EB' : '#8c8c8c', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                            >
                              i
                            </button>
                          </div>

                          {/* Info panel */}
                          {infoShowing && (
                            <div style={{ margin: '2px 0 4px 26px', padding: '8px 10px', background: '#f8faff', border: '1px solid #d6e4ff', borderRadius: 6, fontSize: 11, color: '#434343', lineHeight: 1.6 }}>
                              <p style={{ margin: '0 0 6px' }}>{m.description}</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div><span style={{ fontWeight: 600, color: '#595959' }}>Best for: </span>{m.bestFor}</div>
                                <div><span style={{ fontWeight: 600, color: '#595959' }}>Works on: </span>{m.domains}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Class input for models that support open-vocabulary detection */}
              {aiModels.find((m: any) => m.id === aiModelName)?.supportsClasses && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Classes to detect</div>
                  <input
                    type="text"
                    value={aiClasses}
                    onChange={e => setAiClasses(e.target.value)}
                    placeholder="e.g. car, person, scratch, tumour…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 11, outline: 'none' }}
                  />
                  <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 3 }}>Comma-separated. Leave empty to use model defaults.</div>
                </div>
              )}

              {/* Confidence slider */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#262626', marginBottom: 4 }}>
                  <span>Confidence threshold</span>
                  <span style={{ fontWeight: 600, color: '#2563EB' }}>{(aiConf * 100).toFixed(0) === '0' ? '<1' : (aiConf * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range" min="0.01" max="0.95" step="0.01"
                  value={aiConf}
                  onChange={e => setAiConf(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563EB' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
                  <span>1% — more detections</span>
                  <span>95% — fewer, surer</span>
                </div>
                {aiConf <= 0.03 && (
                  <div style={{ fontSize: 10, color: '#875500', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, padding: '3px 6px', marginTop: 4 }}>
                    Very low threshold — expect more false positives. Good for YOLO-World.
                  </div>
                )}
              </div>

              {/* Quick presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {([['1%', 0.01], ['5%', 0.05], ['25%', 0.25], ['50%', 0.50]] as [string, number][]).map(([label, v]) => (
                  <button key={String(v)} onClick={() => setAiConf(v)}
                    style={{ fontSize: 11, padding: '3px 8px', border: `1px solid ${aiConf === v ? '#2563EB' : '#d9d9d9'}`, borderRadius: 4, background: aiConf === v ? '#e6f4ff' : '#fff', color: aiConf === v ? '#2563EB' : '#595959', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button
                  onClick={() => { setAiPanelOpen(false); handleAutoAnnotate(); }}
                  disabled={aiLoading || batchAiLoading}
                  style={{ flex: 1, padding: '7px 0', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, cursor: (aiLoading || batchAiLoading) ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {aiLoading ? 'Detecting…' : 'This frame'}
                </button>
                <button
                  onClick={handleBatchAutoAnnotate}
                  disabled={aiLoading || batchAiLoading || files.length === 0}
                  title={`Annotate all ${files.length} frames`}
                  style={{ flex: 1, padding: '7px 0', background: batchAiLoading ? '#f0f0f0' : '#f0fdf4', color: batchAiLoading ? '#8c8c8c' : '#16a34a', border: '1px solid #86efac', borderRadius: 6, cursor: (aiLoading || batchAiLoading) ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {batchAiLoading ? `${batchAiProgress.done}/${batchAiProgress.total}` : `All ${files.length} frames`}
                </button>
              </div>
              {batchAiLoading && batchAiProgress.total > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ height: 4, background: '#e8e8e8', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#16a34a', borderRadius: 2, transition: 'width 0.3s', width: `${(batchAiProgress.done / batchAiProgress.total) * 100}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 3 }}>Annotating frame {batchAiProgress.done} of {batchAiProgress.total}…</div>
                </div>
              )}

              {/* Fine-tune guide */}
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                  How to train on your data
                </summary>
                <div style={{ marginTop: 8, fontSize: 11, color: '#595959', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 6px' }}>
                    The default model is trained on real photos (COCO). If your images are synthetic, cartoons, or a specialised domain it will return 0 detections.
                  </p>
                  <ol style={{ margin: 0, paddingLeft: 16 }}>
                    <li style={{ marginBottom: 4 }}>Annotate <strong>50–200 frames</strong> manually in this editor.</li>
                    <li style={{ marginBottom: 4 }}>Export the project: <em>Project → Export → COCO JSON</em>.</li>
                    <li style={{ marginBottom: 4 }}>
                      Run fine-tuning:
                      <pre style={{ margin: '4px 0', padding: '6px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, overflowX: 'auto', whiteSpace: 'pre' }}>{`cd packages/ai\npython3 train.py train \\\n  --data /path/to/export.json \\\n  --images /path/to/images \\\n  --epochs 50`}</pre>
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      Switch to your fine-tuned weights in <code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: 3 }}>packages/ai/model.py</code>:
                      <pre style={{ margin: '4px 0', padding: '6px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, overflowX: 'auto', whiteSpace: 'pre' }}>{`active_model = ProductionModel(\n  weights="runs/segment/train/\n          weights/best.pt",\n  conf=0.01\n)`}</pre>
                    </li>
                    <li>Restart the AI service — predictions will now match your domain.</li>
                  </ol>
                  <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 10 }}>
                    While training, keep <strong>MockModel</strong> active so the annotation UI still works.
                  </p>
                </div>
              </details>
            </div>
          )}
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
          {/* Image enhancement toggle */}
          <div style={{ padding: '0 8px', borderLeft: '1px solid #e8e8e8', height: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setEnhanceOpen(o => !o)}
              title="Image enhancement (brightness, contrast, saturation)"
              style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d9d9d9', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, background: enhanceOpen || !!imgFilterStyle ? '#e6f4ff' : '#fff', color: enhanceOpen || !!imgFilterStyle ? '#1890ff' : '#595959', fontWeight: enhanceOpen || !!imgFilterStyle ? 600 : 400, transition: 'all 0.15s' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
              Enhance
            </button>
            {/* QA warning badge */}
            <button onClick={() => setQaOpen(o => !o)} title={`${qaIssues.length} QA issue${qaIssues.length !== 1 ? 's' : ''}`}
              style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${qaIssues.length > 0 ? '#ff4d4f' : '#d9d9d9'}`, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, background: qaOpen ? '#fff1f0' : qaIssues.length > 0 ? '#fff1f0' : '#fff', color: qaIssues.length > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: qaIssues.length > 0 ? 600 : 400, transition: 'all 0.15s' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              QA {qaIssues.length > 0 ? `(${qaIssues.length})` : '✓'}
            </button>
            {/* Review Issues button */}
            <button onClick={() => setIssuesOpen(o => !o)}
              title="Review Issues"
              style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${issuesOpen ? '#fa8c16' : '#d9d9d9'}`, background: issuesOpen ? '#fff7e6' : '#fff', color: issuesOpen ? '#fa8c16' : '#595959', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Issues {issues.filter(i => i.status === 'open').length > 0 && <span style={{ background: '#fa8c16', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{issues.filter(i => i.status === 'open').length}</span>}
            </button>
            {/* Active learning: jump to most uncertain frame */}
            {sortByUncertainty && (
              <button onClick={() => { const next = uncertainFrameOrder.find(f => f !== frameNum); if (next !== undefined) goToFrame(next); }}
                title="Jump to most uncertain frame"
                style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #722ed1', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, background: '#f9f0ff', color: '#722ed1', fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Uncertain
              </button>
            )}
          </div>
        </div>
      </div>

      {/* REVIEW MODE BANNER */}
      {job && job.stage !== 'annotation' && (() => {
        const fullyAccepted = job.stage === 'acceptance' && job.state === 'completed';

        // Fully accepted — show audit trail, no action buttons
        if (fullyAccepted) {
          return (
            <div style={{ background: '#f6ffed', borderBottom: '2px solid #52c41a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#389e0d' }}>Fully Accepted</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {job.assignee && (
                  <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #b7eb8f', borderRadius: 4, padding: '2px 8px' }}>
                    Annotated by <strong>{job.assignee.username}</strong>
                  </span>
                )}
                {job.validatedBy && (
                  <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #b7eb8f', borderRadius: 4, padding: '2px 8px' }}>
                    Validated by <strong>{job.validatedBy.username}</strong>
                  </span>
                )}
                {job.acceptedBy && (
                  <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #b7eb8f', borderRadius: 4, padding: '2px 8px' }}>
                    Accepted by <strong>{job.acceptedBy.username}</strong>
                  </span>
                )}
              </div>
            </div>
          );
        }

        // Active review (validation or acceptance pending)
        const isAcceptance = job.stage === 'acceptance';
        const bannerColor = isAcceptance ? '#52c41a' : '#fa8c16';
        const bannerBg = isAcceptance ? '#f6ffed' : '#fff7e6';
        const bannerText = isAcceptance ? '#389e0d' : '#d46b08';
        const reviewLabel = isAcceptance ? 'Acceptance review' : 'Validation review';

        return isAdmin ? (
          <div style={{ background: bannerBg, borderBottom: `2px solid ${bannerColor}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={bannerColor} strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span style={{ fontWeight: 600, fontSize: 13, color: bannerText }}>
              {reviewLabel}{job.assignee ? ` — annotated by ${job.assignee.username}` : ''}
            </span>
            {job.validatedBy && (
              <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }}>
                Validated by <strong>{job.validatedBy.username}</strong>
              </span>
            )}
            {annotationSummary !== null && (
              <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }}>
                {annotationSummary.frameCount === 0
                  ? 'No frames annotated yet'
                  : `${annotationSummary.frameCount} frame${annotationSummary.frameCount !== 1 ? 's' : ''} annotated · ${annotationSummary.totalShapes} shape${annotationSummary.totalShapes !== 1 ? 's' : ''} total`}
              </span>
            )}
            {job.reviewNote && (
              <span style={{ fontSize: 12, color: '#595959', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Note: {job.reviewNote}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={handleRequestChanges}
                style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #ff4d4f', background: '#fff', color: '#ff4d4f', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Request Changes
              </button>
              <button onClick={handleApprove}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#52c41a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {isAcceptance ? 'Accept' : 'Approve'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff1f0', borderBottom: '2px solid #ff4d4f', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#cf1322' }}>
              This job is in {job.stage} review — editing is locked
            </span>
            <span style={{ fontSize: 12, color: '#595959' }}>
              An admin must reset it to annotation stage before you can make changes.
            </span>
          </div>
        );
      })()}

      {/* GROUND TRUTH BANNER */}
      {job && job.type === 'ground_truth' && (
        <div style={{ background: '#fffbe6', borderBottom: '2px solid #ffd666', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, background: '#ffd666', color: '#614700', borderRadius: 4, padding: '1px 7px', letterSpacing: '0.5px' }}>GROUND TRUTH</span>
          <span style={{ fontSize: 13, color: '#614700' }}>Annotations in this job serve as the reference for quality scoring. Annotate with maximum precision.</span>
        </div>
      )}

      {/* REVIEWER FEEDBACK BANNER — shown to annotator when rejected */}
      {job && job.stage === 'annotation' && job.state === 'rejected' && job.reviewNote && (
        <div style={{ background: '#fff1f0', borderBottom: '2px solid #ff4d4f', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#cf1322' }}>Reviewer requested changes:</span>
          <span style={{ fontSize: 13, color: '#595959' }}>{job.reviewNote}</span>
        </div>
      )}

      {/* REQUEST CHANGES DIALOG */}
      {showReviewDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Request Changes</h3>
            <p style={{ margin: '0 0 14px', color: '#595959', fontSize: 13 }}>Describe what needs to be fixed. The annotator will see this feedback.</p>
            <textarea
              autoFocus
              value={reviewNoteInput}
              onChange={e => setReviewNoteInput(e.target.value)}
              placeholder="e.g. The car on the left is missing a label. Polygon on frame 3 is too rough."
              rows={4}
              style={{ width: '100%', borderRadius: 6, border: '1px solid #d9d9d9', padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => { setShowReviewDialog(false); setReviewNoteInput(''); }}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSubmitRequestChanges}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ff4d4f', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Request Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT TOOLBAR */}
        <div style={{ width: 48, background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 2, flexShrink: 0 }}>
          {viewMode === '2d' ? (
            <>
              {(Object.keys(TOOL_ICONS) as ToolType[]).filter(t => t !== 'segment').map(tool => (
                <button key={tool} title={tool === 'select' ? 'Select (S) — click a shape to select it, drag to move, drag handles to resize' : `${TOOL_LABELS[tool]} (${TOOL_KEYS[tool]})`}
                  disabled={!isEditable}
                  style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: isEditable ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentTool === tool ? '#e6f4ff' : 'transparent', color: currentTool === tool ? '#1890ff' : '#595959', transition: 'all 0.15s', position: 'relative', opacity: isEditable ? 1 : 0.4 }}
                  onClick={() => setTool(tool)}>
                  {TOOL_ICONS[tool]}
                  {currentTool === tool && <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#1890ff', borderRadius: 2 }} />}
                </button>
              ))}
              {/* SAM segmentation tool — separated visually */}
              <div style={{ width: 28, height: 1, background: '#f0f0f0', margin: '4px 0' }} />
              <button key="segment" title="Segment (M) — click any object for instant AI-powered polygon mask"
                disabled={!isEditable}
                style={{ width: 36, height: 36, border: currentTool === 'segment' ? '1px solid #722ed1' : 'none', borderRadius: 6, cursor: isEditable ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', background: currentTool === 'segment' ? '#f9f0ff' : 'transparent', color: currentTool === 'segment' ? '#722ed1' : '#595959', transition: 'all 0.15s', position: 'relative', opacity: isEditable ? 1 : 0.4 }}
                onClick={() => setTool('segment')}>
                {TOOL_ICONS['segment']}
                {currentTool === 'segment' && <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#722ed1', borderRadius: 2 }} />}
              </button>
            </>
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
          {/* Read-only overlay for annotators when job is in review */}
          {!isEditable && !isAdmin && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'all', cursor: 'not-allowed' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Editing locked</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
                This job is in {job?.stage} review.<br />An admin must reset it to annotation to allow editing.
              </span>
            </div>
          )}
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
          ) : isTextMode ? (
            <TextAnnotationCanvas
              text={textContent}
              spans={textSpans}
              labels={labels}
              selectedLabel={selectedLabel || ''}
              selectedLabelColor={selectedLabelColor || '#1890ff'}
              selectedSpanId={selectedSpanId}
              onAddSpan={span => setTextSpans(prev => [...prev, span])}
              onDeleteSpan={id => setTextSpans(prev => prev.filter(s => s.id !== id))}
              onSelectSpan={setSelectedSpanId}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, filter: imgFilterStyle }}>
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
                onSegmentClick={handleSegmentClick}
                segmenting={segmenting}
              />
            </div>
          )}

          {/* AI toast */}
          {aiToast && (() => {
            const isError = aiToast.startsWith('Error');
            const isWarn = !isError && aiToast.startsWith('0 object');
            const bg = isError ? '#fff1f0' : isWarn ? '#fffbe6' : '#f0f9ff';
            const border = isError ? '#ffa39e' : isWarn ? '#ffe58f' : '#bae6fd';
            const color = isError ? '#cf1322' : isWarn ? '#875500' : '#0369a1';
            return (
              <div style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                background: bg, border: `1px solid ${border}`, color,
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
                display: 'flex', alignItems: 'flex-start', gap: 8,
                maxWidth: 480, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {isError
                  ? <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  : isWarn
                    ? <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    : <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>}
                {aiToast}
              </div>
            );
          })()}

          {/* Image Enhancement panel */}
          {enhanceOpen && (
            <div style={{ position: 'absolute', bottom: 16, left: 16, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', padding: '14px 16px', minWidth: 240, zIndex: 50 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Image Enhancement</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!!imgFilterStyle && (
                    <button onClick={() => { setImgBrightness(100); setImgContrast(100); setImgSaturation(100); }}
                      style={{ fontSize: 11, color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 6px' }}>Reset</button>
                  )}
                  <button onClick={() => setEnhanceOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              </div>
              {([
                { label: 'Brightness', value: imgBrightness, set: setImgBrightness, min: 30, max: 220 },
                { label: 'Contrast',   value: imgContrast,   set: setImgContrast,   min: 30, max: 220 },
                { label: 'Saturation', value: imgSaturation, set: setImgSaturation, min: 0,  max: 220 },
              ] as { label: string; value: number; set: (v: number) => void; min: number; max: number }[]).map(({ label, value, set, min, max }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#595959', marginBottom: 4 }}>
                    <span>{label}</span>
                    <span style={{ color: value !== 100 ? '#1890ff' : '#8c8c8c', fontWeight: value !== 100 ? 600 : 400 }}>{value}%</span>
                  </div>
                  <input type="range" min={min} max={max} value={value} onChange={e => set(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#1890ff' }} />
                </div>
              ))}
            </div>
          )}

          {/* QA panel */}
          {qaOpen && (
            <div style={{ position: 'absolute', bottom: 16, left: enhanceOpen ? 272 : 16, background: '#fff', border: `1px solid ${qaIssues.length > 0 ? '#ffccc7' : '#b7eb8f'}`, borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', padding: '14px 16px', minWidth: 280, maxWidth: 360, zIndex: 50 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: qaIssues.length > 0 ? '#cf1322' : '#389e0d' }}>
                  {qaIssues.length > 0 ? `${qaIssues.length} QA Issue${qaIssues.length !== 1 ? 's' : ''}` : 'QA Passed'}
                </span>
                <button onClick={() => setQaOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              {qaIssues.length === 0 ? (
                <div style={{ fontSize: 12, color: '#389e0d' }}>No overlapping or tiny shapes detected.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {qaIssues.map((issue, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: '#fff1f0', borderRadius: 6, fontSize: 12 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4d4f" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span style={{ color: '#595959', lineHeight: 1.4 }}>{issue.msg}</span>
                      <button onClick={() => { selectShape(issue.id); setQaOpen(false); }}
                        style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, color: '#1890ff', background: 'none', border: '1px solid #91caff', borderRadius: 3, cursor: 'pointer', padding: '1px 5px' }}>select</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Review Issues panel */}
          {issuesOpen && (
            <div style={{ position: 'absolute', bottom: 40, right: 16, width: 300, background: '#fff', border: '1px solid #fa8c16', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 50, display: 'flex', flexDirection: 'column', maxHeight: 360 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Review Issues</span>
                <button onClick={() => setIssuesOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#8c8c8c' }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {issues.length === 0 && <div style={{ fontSize: 12, color: '#8c8c8c', textAlign: 'center', padding: 16 }}>No issues on this frame</div>}
                {issues.map(issue => (
                  <div key={issue.id} style={{ background: issue.status === 'resolved' ? '#f6ffed' : '#fff7e6', borderRadius: 6, padding: '8px 10px', border: `1px solid ${issue.status === 'resolved' ? '#b7eb8f' : '#ffd591'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, fontSize: 12, color: '#262626', lineHeight: 1.5 }}>
                        {issue.shapeId && <span style={{ fontSize: 10, background: '#e6f4ff', borderRadius: 3, padding: '1px 5px', color: '#1890ff', marginRight: 4 }}>Shape</span>}
                        {issue.comment}
                      </div>
                      {issue.status === 'open' && (
                        <button onClick={async () => { await client.patch(`/shape-issues/${issue.id}/resolve`, {}); setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: 'resolved' } : i)); }}
                          style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #b7eb8f', background: '#f6ffed', fontSize: 11, cursor: 'pointer', color: '#389e0d', flexShrink: 0 }}>✓</button>
                      )}
                      <button onClick={async () => { await client.delete(`/shape-issues/${issue.id}`); setIssues(prev => prev.filter(i => i.id !== issue.id)); }}
                        style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #ffccc7', background: '#fff2f0', fontSize: 11, cursor: 'pointer', color: '#ff4d4f', flexShrink: 0 }}>×</button>
                    </div>
                    <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 4 }}>{issue.author?.username || 'Unknown'} · {new Date(issue.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '8px 10px', borderTop: '1px solid #e8e8e8', display: 'flex', gap: 6 }}>
                <input value={issueInput} onChange={e => setIssueInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && issueInput.trim() && !issuePending && jobId) {
                      setIssuePending(true);
                      client.post('/shape-issues', { jobId, frameNumber: frameNum, shapeId: selectedShapeId || null, comment: issueInput.trim() })
                        .then(({ data }) => { setIssues(prev => [data, ...prev]); setIssueInput(''); })
                        .catch(() => {})
                        .finally(() => setIssuePending(false));
                    }
                  }}
                  placeholder={selectedShapeId ? 'Comment on selected shape…' : 'Frame-level comment…'}
                  style={{ flex: 1, padding: '5px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 12, outline: 'none' }} />
                <button disabled={!issueInput.trim() || issuePending}
                  onClick={async () => {
                    if (!issueInput.trim() || !jobId) return;
                    setIssuePending(true);
                    try {
                      const { data } = await client.post('/shape-issues', { jobId, frameNumber: frameNum, shapeId: selectedShapeId || null, comment: issueInput.trim() });
                      setIssues(prev => [data, ...prev]);
                      setIssueInput('');
                    } catch { /* no-op */ } finally { setIssuePending(false); }
                  }}
                  style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: '#fa8c16', color: '#fff', fontSize: 12, cursor: 'pointer', opacity: issuePending ? 0.6 : 1 }}>
                  Add
                </button>
              </div>
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
            {(['objects', 'labels', 'audit'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #1890ff' : '2px solid transparent', color: activeTab === tab ? '#1890ff' : '#8c8c8c', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {tab === 'objects'
                  ? `Objects (${viewMode === '3d' ? cuboids.length : shapes.length})`
                  : tab === 'labels'
                  ? `Labels (${labels.length})`
                  : 'Audit'}
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
              {shapes.length > 0 && frameNum < files.length - 1 && (
                <button title="Copy all shapes to next frame" onClick={handleCopyToNextFrame}
                  style={{ width: 26, height: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1890ff', fontSize: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18h6M12 12v6"/><path d="M5 12V7a2 2 0 012-2h10a2 2 0 012 2v5"/></svg>
                </button>
              )}
            </div>
          )}

          {/* Active Tracks panel (shows when tracks exist) */}
          {activeTab === 'objects' && tracks.length > 0 && (
            <div style={{ borderTop: '1px solid #e8e8e8', flexShrink: 0, padding: '8px 8px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#722ed1', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                Tracks ({tracks.length})
                <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#595959', fontWeight: 400, textTransform: 'none', letterSpacing: 0, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sortByUncertainty} onChange={e => setSortByUncertainty(e.target.checked)} style={{ accentColor: '#722ed1' }} />
                  Smart order
                </label>
              </div>
              {tracks.map(tr => {
                const kfNums = Object.keys(tr.keyframes).map(Number).sort((a, b) => a - b);
                const isOnFrame = !!tr.keyframes[frameNum];
                return (
                  <div key={tr.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '4px 6px', borderRadius: 5, background: isOnFrame ? '#f9f0ff' : '#fafafa', border: `1px solid ${isOnFrame ? '#d3adf7' : '#f0f0f0'}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: tr.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.label}</span>
                    <span style={{ fontSize: 10, color: '#8c8c8c' }}>{kfNums.length} kf</span>
                    <button onClick={() => { if (kfNums.length) goToFrame(kfNums[0]); }} title="Go to first keyframe"
                      style={{ fontSize: 9, color: '#722ed1', background: 'none', border: '1px solid #d3adf7', borderRadius: 3, cursor: 'pointer', padding: '1px 4px' }}>▶</button>
                    <button onClick={() => {
                      const updated = tracks.filter(t => t.id !== tr.id);
                      setTracks(updated);
                      client.put(`/jobs/${jobId!}/tracks`, { tracks: updated }).catch(() => {});
                      setShapes(shapes.filter(s => s.trackId !== tr.id));
                    }} title="Delete track" style={{ fontSize: 9, color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected shape card — shows when a 2D shape is selected */}
          {selectedShape && viewMode === '2d' && (() => {
            const fullLbl = fullLabels.find(l => l.name === selectedShape.label);
            const attrDefs = fullLbl?.attributes?.filter(a => a.name) || [];
            const currentAttrs: Record<string, unknown> = (selectedShape as any).attributes || {};
            return (
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
                {/* Track object button — only for rect shapes not already tracked */}
                {selectedShape.type === 'rect' && !selectedShape.trackId && isEditable && (
                  <div style={{ marginBottom: 6 }}>
                    <button onClick={() => {
                      const trackId = Math.random().toString(36).slice(2) + Date.now().toString(36);
                      const newTrack = { id: trackId, label: selectedShape.label, color: selectedShape.color, keyframes: { [String(frameNum)]: { points: selectedShape.points, occluded: selectedShape.occluded, attributes: selectedShape.attributes as any } } };
                      const updatedTracks = [...tracks, newTrack];
                      setTracks(updatedTracks);
                      updateShape(selectedShapeId!, { trackId, isInterpolated: false } as any);
                      client.put(`/jobs/${jobId!}/tracks`, { tracks: updatedTracks }).catch(() => {});
                      toast.success('Tracking started', 'This object will be interpolated between keyframes.');
                    }} style={{ width: '100%', padding: '4px 0', borderRadius: 5, border: '1px solid #722ed1', background: '#f9f0ff', color: '#722ed1', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                      Track this object across frames
                    </button>
                  </div>
                )}
                {selectedShape.trackId && (
                  <div style={{ marginBottom: 6, padding: '3px 8px', background: '#f9f0ff', borderRadius: 5, fontSize: 11, color: '#722ed1', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                    {selectedShape.isInterpolated ? 'Interpolated — drag to create keyframe' : 'Keyframe'}
                    <button onClick={() => {
                      const updatedTracks = tracks.map(tr => { if (tr.id !== selectedShape.trackId) return tr; const kf = { ...tr.keyframes }; delete kf[String(frameNum)]; return { ...tr, keyframes: kf }; });
                      setTracks(updatedTracks);
                      deleteShape(selectedShapeId!);
                      client.put(`/jobs/${jobId!}/tracks`, { tracks: updatedTracks }).catch(() => {});
                    }} style={{ marginLeft: 'auto', fontSize: 10, color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer' }}>remove kf</button>
                  </div>
                )}
                {/* Quick flags */}
                <div style={{ display: 'flex', gap: 6, marginBottom: attrDefs.length ? 8 : 4, flexWrap: 'wrap' }}>
                  {[
                    { key: 'occluded', label: '🕶 Occluded' },
                    { key: 'truncated', label: '✂ Truncated' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#595959', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox"
                        checked={!!(currentAttrs[key])}
                        onChange={e => updateShape(selectedShapeId!, { attributes: { ...currentAttrs, [key]: e.target.checked } } as any)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {/* Label-defined attributes */}
                {attrDefs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6, padding: '8px 0', borderTop: '1px solid #bae0ff' }}>
                    {attrDefs.map(attr => {
                      const val = currentAttrs[attr.name] ?? attr.default_value ?? '';
                      const setValue = (v: unknown) => updateShape(selectedShapeId!, { attributes: { ...currentAttrs, [attr.name]: v } } as any);
                      if (attr.input_type === 'checkbox') return (
                        <label key={attr.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#262626', cursor: 'pointer' }}>
                          <input type="checkbox" checked={val === true || val === 'true'} onChange={e => setValue(e.target.checked)} />
                          {attr.name}
                        </label>
                      );
                      if (attr.input_type === 'select' || attr.input_type === 'radio') return (
                        <div key={attr.name}>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>{attr.name}</div>
                          <select value={String(val)} onChange={e => setValue(e.target.value)}
                            style={{ width: '100%', fontSize: 12, border: '1px solid #91caff', borderRadius: 4, padding: '3px 6px', background: '#fff', cursor: 'pointer' }}>
                            {!val && <option value="">—</option>}
                            {attr.values.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      );
                      if (attr.input_type === 'number') return (
                        <div key={attr.name}>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>{attr.name}</div>
                          <input type="number" value={String(val)} onChange={e => setValue(e.target.valueAsNumber)}
                            style={{ width: '100%', fontSize: 12, border: '1px solid #91caff', borderRadius: 4, padding: '3px 6px', boxSizing: 'border-box' }} />
                        </div>
                      );
                      return (
                        <div key={attr.name}>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3 }}>{attr.name}</div>
                          <input type="text" value={String(val)} onChange={e => setValue(e.target.value)}
                            style={{ width: '100%', fontSize: 12, border: '1px solid #91caff', borderRadius: 4, padding: '3px 6px', boxSizing: 'border-box' }} />
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#595959', lineHeight: 1.5 }}>
                  Drag shape body to <b>move</b> · Drag corner handles to <b>resize</b><br/>
                  Click a label below to <b>reassign</b>
                </div>
              </div>
            );
          })()}

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
                    {shape.confidence !== undefined && (
                      <span title={`AI confidence: ${Math.round(shape.confidence * 100)}%`}
                        style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: shape.confidence >= 0.7 ? '#f6ffed' : shape.confidence >= 0.4 ? '#fffbe6' : '#fff1f0', color: shape.confidence >= 0.7 ? '#389e0d' : shape.confidence >= 0.4 ? '#875500' : '#cf1322', border: `1px solid ${shape.confidence >= 0.7 ? '#b7eb8f' : shape.confidence >= 0.4 ? '#ffe58f' : '#ffa39e'}`, flexShrink: 0 }}>
                        {Math.round(shape.confidence * 100)}%
                      </span>
                    )}
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

            {activeTab === 'audit' && (() => {
              const ACTION_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                created:            { color: '#52c41a', label: 'Created',             icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg> },
                updated:            { color: '#1890ff', label: 'Updated',             icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg> },
                deleted:            { color: '#ff4d4f', label: 'Deleted',             icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg> },
                stage_changed:      { color: '#722ed1', label: 'Stage changed',       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> },
                state_changed:      { color: '#fa8c16', label: 'State changed',       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
                assigned:           { color: '#13c2c2', label: 'Assigned',            icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                annotation_saved:   { color: '#1890ff', label: 'Annotations saved',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> },
                annotations_cleared:{ color: '#ff4d4f', label: 'Annotations cleared', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg> },
              };

              const fmt = (iso: string) => {
                const d = new Date(iso);
                const now = new Date();
                const diffMs = now.getTime() - d.getTime();
                const diffMin = Math.floor(diffMs / 60000);
                if (diffMin < 1) return 'just now';
                if (diffMin < 60) return `${diffMin}m ago`;
                const diffH = Math.floor(diffMin / 60);
                if (diffH < 24) return `${diffH}h ago`;
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {auditTotal} event{auditTotal !== 1 ? 's' : ''}
                    </span>
                    <button onClick={() => { setAuditEntries([]); setAuditOffset(0); fetchAudit(0, false); }}
                      style={{ fontSize: 11, color: '#1890ff', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                      Refresh
                    </button>
                  </div>

                  {auditLoading && auditEntries.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#8c8c8c', fontSize: 13 }}>Loading…</div>
                  )}

                  {!auditLoading && auditEntries.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8c8c8c', fontSize: 13 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 8px', opacity: 0.35 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      No events recorded yet
                    </div>
                  )}

                  {auditEntries.map((entry, idx) => {
                    const meta = ACTION_META[entry.action] || { color: '#8c8c8c', label: entry.action, icon: null };
                    const isLast = idx === auditEntries.length - 1;
                    return (
                      <div key={entry.id} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 4 : 12, position: 'relative' }}>
                        {/* Timeline line */}
                        {!isLast && (
                          <div style={{ position: 'absolute', left: 13, top: 26, bottom: 0, width: 1, background: '#f0f0f0' }} />
                        )}
                        {/* Icon dot */}
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${meta.color}18`, border: `1.5px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color, zIndex: 1 }}>
                          {meta.icon}
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{meta.label}</span>
                            {entry.user && (
                              <span style={{ fontSize: 11, color: '#8c8c8c' }}>by <b style={{ color: '#595959' }}>{entry.user.username}</b></span>
                            )}
                            <span style={{ fontSize: 10, color: '#bfbfbf', marginLeft: 'auto', whiteSpace: 'nowrap' }}
                              title={new Date(entry.createdAt).toLocaleString()}>
                              {fmt(entry.createdAt)}
                            </span>
                          </div>
                          {entry.note && (
                            <div style={{ fontSize: 11, color: '#595959', marginTop: 2, lineHeight: 1.4 }}>{entry.note}</div>
                          )}
                          {entry.changes && Object.keys(entry.changes).length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {Object.entries(entry.changes).map(([field, { from, to }]) => (
                                <div key={field} style={{ fontSize: 10, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                  <span style={{ color: '#8c8c8c', fontFamily: 'monospace' }}>{field}</span>
                                  <span style={{ color: '#ff4d4f', background: '#fff1f0', borderRadius: 3, padding: '0 4px', textDecoration: 'line-through', fontFamily: 'monospace' }}>{String(from ?? '—')}</span>
                                  <span style={{ color: '#8c8c8c' }}>→</span>
                                  <span style={{ color: '#389e0d', background: '#f6ffed', borderRadius: 3, padding: '0 4px', fontFamily: 'monospace' }}>{String(to ?? '—')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {auditEntries.length < auditTotal && (
                    <button onClick={() => fetchAudit(auditOffset, true)} disabled={auditLoading}
                      style={{ width: '100%', marginTop: 4, padding: '7px 0', background: 'none', border: '1px dashed #d9d9d9', borderRadius: 6, cursor: auditLoading ? 'default' : 'pointer', fontSize: 12, color: auditLoading ? '#bfbfbf' : '#1890ff' }}>
                      {auditLoading ? 'Loading…' : `Load more (${auditTotal - auditEntries.length} remaining)`}
                    </button>
                  )}
                </div>
              );
            })()}

            {activeTab === 'labels' && (
              <div>
                {labels.length > 4 && (
                  <div style={{ marginBottom: 6 }}>
                    <input
                      type="text" placeholder="Search labels…" value={labelSearch}
                      onChange={e => setLabelSearch(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 12, outline: 'none' }} />
                  </div>
                )}
                {labels.filter(l => !labelSearch || l.name.toLowerCase().includes(labelSearch.toLowerCase())).map((lbl) => {
                  const realIdx = labels.indexOf(lbl);
                  const fullLbl = fullLabels.find(fl => fl.name === lbl.name);
                  const description = fullLbl?.description;
                  return (
                    <div key={lbl.name}
                      style={{ borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: selectedLabel === lbl.name ? '#e6f4ff' : 'transparent', border: `1px solid ${selectedLabel === lbl.name ? '#91caff' : 'transparent'}`, transition: 'all 0.1s' }}
                      onClick={() => {
                        if (selectedShapeId) updateShape(selectedShapeId, { label: lbl.name, color: lbl.color });
                        setLabel(lbl.name, lbl.color);
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: lbl.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: selectedLabel === lbl.name ? 600 : 400, color: selectedLabel === lbl.name ? '#1890ff' : '#262626' }}>{lbl.name}</span>
                        {realIdx < 9 && (
                          <kbd style={{ fontSize: 9, background: '#e8e8e8', borderRadius: 3, padding: '1px 4px', color: '#595959', flexShrink: 0 }} title="Press this key to assign label">{realIdx + 1}</kbd>
                        )}
                        {selectedShapeId && shapes.find(s => s.id === selectedShapeId)?.label === lbl.name
                          ? <span style={{ fontSize: 10, color: '#722ed1' }}>selected</span>
                          : selectedLabel === lbl.name && !selectedShapeId && <span style={{ fontSize: 10, color: '#1890ff' }}>active</span>}
                        {description && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8c8c8c" strokeWidth="2" style={{ flexShrink: 0 }}><title>Has guidelines</title><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        )}
                      </div>
                      {description && (
                        <div style={{ padding: '0 8px 7px 28px', fontSize: 11, color: '#595959', lineHeight: 1.5, borderTop: '1px dashed #d4edff', marginTop: -1, paddingTop: 5 }}>
                          {description}
                        </div>
                      )}
                    </div>
                  );
                })}
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

                {/* Frame Tags */}
                <div style={{ marginTop: 16, borderTop: '1px solid #e8e8e8', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Frame Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {frameTags.map(tag => (
                      <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0f0f0', borderRadius: 12, fontSize: 12, color: '#595959' }}>
                        {tag}
                        {isEditable && (
                          <button onClick={() => setFrameTags(prev => prev.filter(t => t !== tag))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#8c8c8c', fontSize: 11, lineHeight: 1 }}>×</button>
                        )}
                      </span>
                    ))}
                    {frameTags.length === 0 && <span style={{ fontSize: 11, color: '#bfbfbf', fontStyle: 'italic' }}>No tags on this frame</span>}
                  </div>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        value={tagInput} onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                            e.preventDefault();
                            const t = tagInput.trim().replace(/,$/, '');
                            if (t && !frameTags.includes(t)) setFrameTags(prev => [...prev, t]);
                            setTagInput('');
                          }
                        }}
                        placeholder="Add tag…"
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 12, outline: 'none' }} />
                      <button
                        onClick={() => {
                          const t = tagInput.trim();
                          if (t && !frameTags.includes(t)) setFrameTags(prev => [...prev, t]);
                          setTagInput('');
                        }}
                        disabled={!tagInput.trim()}
                        style={{ padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 12, cursor: 'pointer', background: '#fff' }}>+</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* APPEARANCE SECTION */}
          {activeTab !== 'audit' && <div style={{ borderTop: '1px solid #e8e8e8', flexShrink: 0 }}>
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
          </div>}

          {/* KEYBOARD SHORTCUTS */}
          {activeTab !== 'audit' && <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px 14px', flexShrink: 0, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Shortcuts</div>
              <button onClick={() => setShowHelp(true)} title="Show all shortcuts (?)"
                style={{ fontSize: 10, color: '#1890ff', background: 'none', border: '1px solid #91caff', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}>? all</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: 11, color: '#595959' }}>
              {Object.entries(TOOL_KEYS).map(([tool, key]) => (
                <div key={tool}><kbd style={{ background: currentTool === tool ? '#1890ff' : '#e8e8e8', color: currentTool === tool ? '#fff' : '#262626', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>{key}</kbd> {tool}</div>
              ))}
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Ctrl+C</kbd> copy</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Ctrl+V</kbd> paste</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Tab</kbd> cycle</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>1-9</kbd> label</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Del</kbd> delete</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>F</kbd> fit view</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>←/→</kbd> frames</div>
              <div><kbd style={{ background: '#e8e8e8', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Ctrl+Z</kbd> undo</div>
            </div>
          </div>}
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
                    toast.error('Extraction failed', err?.response?.data?.error || err?.message || 'Unknown error');
                  }
                }}
                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: extracting ? '#91caff' : '#1890ff', color: '#fff', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                {extracting ? 'Working…' : 'Extract frames'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD HELP MODAL */}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowHelp(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Keyboard Shortcuts</span>
              <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8c8c8c' }}>×</button>
            </div>
            {([
              { group: 'Drawing Tools', items: [['S', 'Select tool'], ['R', 'Rectangle'], ['P', 'Polygon'], ['L', 'Polyline'], ['D', 'Point'], ['E', 'Ellipse']] },
              { group: 'Navigation', items: [['←/→', 'Previous/Next frame'], ['Home/End', 'First/Last frame'], ['F', 'Fit image to view'], ['Ctrl+S', 'Save annotations']] },
              { group: 'Shape Operations', items: [['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+C', 'Copy selected shape'], ['Ctrl+V', 'Paste shape (+12px offset)'], ['Tab', 'Cycle to next shape'], ['Shift+Tab', 'Cycle to previous shape'], ['Del', 'Delete selected shape'], ['Esc', 'Cancel / deselect']] },
              { group: 'Label Assignment', items: [['1-9', 'Assign label 1–9 to selected shape'], ['Click label', 'Assign label to selected shape']] },
              { group: 'Canvas', items: [['Scroll wheel', 'Zoom in/out'], ['Middle-click drag', 'Pan canvas'], ['Ctrl+drag', 'Pan canvas'], ['Double-click', 'Finish polygon']] },
              { group: 'View', items: [['?', 'Toggle this help'], ['Esc', 'Close menus/help']] },
            ] as { group: string; items: [string, string][] }[]).map(({ group, items }) => (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{group}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px' }}>
                  {items.map(([key, desc]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <kbd style={{ background: '#f5f5f5', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>{key}</kbd>
                      <span style={{ color: '#595959' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BATCH AI PROGRESS OVERLAY */}
      {batchAiLoading && (
        <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: '12px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1500, minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>Batch AI Annotation</span>
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>{batchAiProgress.done}/{batchAiProgress.total}</span>
          </div>
          <div style={{ height: 6, background: '#e8e8e8', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.3s', width: `${(batchAiProgress.done / Math.max(batchAiProgress.total, 1)) * 100}%` }} />
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>Frame {batchAiProgress.done} of {batchAiProgress.total}…</div>
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
        {clipboardShape && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>📋 {clipboardShape.type} in clipboard (Ctrl+V)</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => setShowHelp(true)}>? shortcuts</span>
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
