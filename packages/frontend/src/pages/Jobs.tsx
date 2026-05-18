import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Navbar from '../components/Navbar';
import { useTenantStore } from '../store/tenantStore';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

interface Job {
  id: string;
  stage: string;
  state: string;
  frameStart: number;
  frameEnd: number;
  assignee?: { id: string; username: string };
  task?: { id: string; name: string; thumbnailUrl?: string; project?: { id: string; name: string } };
  createdAt: string;
  updatedAt: string;
}

interface JobAnnotationDoc {
  jobId: string;
  exportedAt: string;
  frameCount: number;
  frames: {
    frameNumber: number;
    annotationId: string;
    fileName: string | null;
    status: string;
    updatedAt: string;
    shapes: any[];
    tags: any[];
    tracks: any[];
    notes: string | null;
  }[];
}

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
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const handleDownload = () => {
    const blob = new Blob([fullJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `job-${jobId.slice(0, 8)}-annotations.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#1a1a2e', borderRadius: 12, width: '85vw', maxWidth: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #2a2a4a', background: '#141428' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4dabf7" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 14 }}>
              Annotation JSON — job <code style={{ background: '#2a2a4a', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{jobId.slice(0, 8)}…</code>
            </span>
            {doc && <span style={{ color: '#6c6c8a', fontSize: 12 }}>{doc.frameCount} frame{doc.frameCount !== 1 ? 's' : ''}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleCopy(fullJson)} style={{ padding: '5px 12px', borderRadius: 6, background: '#2a2a4a', border: 'none', cursor: 'pointer', fontSize: 12, color: copied ? '#52c41a' : '#a0a0c0' }}>
              {copied ? '✓ Copied' : 'Copy all'}
            </button>
            <button onClick={handleDownload} style={{ padding: '5px 12px', borderRadius: 6, background: '#1890ff', border: 'none', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>
              Download
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: '#2a2a4a', border: 'none', cursor: 'pointer', color: '#a0a0c0', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c8a' }}>Loading…</div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4f' }}>{error}</div>
        ) : doc && doc.frameCount === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c8a' }}>No annotation data saved yet for this job</div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: 180, borderRight: '1px solid #2a2a4a', overflowY: 'auto', background: '#141428' }}>
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#6c6c8a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Frames</div>
              {doc!.frames.map((f, i) => (
                <button key={f.frameNumber} onClick={() => setFrameIdx(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: frameIdx === i ? 'rgba(77,171,247,0.15)' : 'none', border: 'none', cursor: 'pointer', borderLeft: frameIdx === i ? '3px solid #4dabf7' : '3px solid transparent' }}>
                  <span style={{ color: frameIdx === i ? '#4dabf7' : '#a0a0c0', fontSize: 12, fontFamily: 'monospace' }}>#{f.frameNumber}</span>
                  {f.shapes?.length > 0 && <span style={{ fontSize: 10, color: '#52c41a', marginLeft: 'auto' }}>{f.shapes.length}s</span>}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid #2a2a4a', background: '#141428' }}>
                <span style={{ color: '#6c6c8a', fontSize: 12 }}>Frame #{currentFrame?.frameNumber} · {currentFrame?.shapes?.length || 0} shapes</span>
                <button onClick={() => handleCopy(jsonText)} style={{ padding: '3px 10px', borderRadius: 5, background: '#2a2a4a', border: 'none', cursor: 'pointer', fontSize: 11, color: '#a0a0c0' }}>Copy frame</button>
              </div>
              <pre style={{ flex: 1, margin: 0, padding: '14px 16px', overflowY: 'auto', fontSize: 12, lineHeight: 1.6, color: '#c9d1d9', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{jsonText}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared audit helpers ────────────────────────────────────────────────────

const AUDIT_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  created:             { color: '#52c41a', label: 'Created',              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg> },
  updated:             { color: '#1890ff', label: 'Updated',              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg> },
  deleted:             { color: '#ff4d4f', label: 'Deleted',              icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> },
  stage_changed:       { color: '#722ed1', label: 'Stage changed',        icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> },
  state_changed:       { color: '#fa8c16', label: 'State changed',        icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
  assigned:            { color: '#13c2c2', label: 'Assigned',             icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  annotation_saved:    { color: '#1890ff', label: 'Annotations saved',   icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> },
  annotations_cleared: { color: '#ff4d4f', label: 'Annotations cleared', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg> },
};

interface AuditEntry {
  id: string; action: string; note: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  user: { id: string; username: string } | null;
  createdAt: string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function AuditTimeline({ entries, loading, total, onLoadMore }: {
  entries: AuditEntry[]; loading: boolean; total: number;
  onLoadMore: () => void;
}) {
  if (loading && entries.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>Loading…</div>;
  }
  if (!loading && entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: '#8c8c8c' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 10px', opacity: 0.35 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        No events recorded yet
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((entry, idx) => {
        const meta = AUDIT_META[entry.action] || { color: '#8c8c8c', label: entry.action, icon: null };
        const isLast = idx === entries.length - 1 && entries.length >= total;
        return (
          <div key={entry.id} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 16, position: 'relative' }}>
            {!isLast && (
              <div style={{ position: 'absolute', left: 14, top: 28, bottom: 0, width: 1, background: '#f0f0f0' }} />
            )}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${meta.color}18`, border: `1.5px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color, zIndex: 1, marginTop: 2 }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{meta.label}</span>
                {entry.user && (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>by <b style={{ color: '#595959' }}>{entry.user.username}</b></span>
                )}
                <span style={{ fontSize: 11, color: '#bfbfbf', marginLeft: 'auto', whiteSpace: 'nowrap' }} title={new Date(entry.createdAt).toLocaleString()}>
                  {fmtTime(entry.createdAt)}
                </span>
              </div>
              {entry.note && (
                <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.5 }}>{entry.note}</div>
              )}
              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {Object.entries(entry.changes).map(([field, { from, to }]) => (
                    <div key={field} style={{ fontSize: 11, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <code style={{ color: '#8c8c8c', fontSize: 10 }}>{field}</code>
                      <span style={{ color: '#ff4d4f', background: '#fff1f0', borderRadius: 3, padding: '0 5px', fontFamily: 'monospace', fontSize: 11, textDecoration: 'line-through' }}>{String(from ?? '—')}</span>
                      <span style={{ color: '#8c8c8c' }}>→</span>
                      <span style={{ color: '#389e0d', background: '#f6ffed', borderRadius: 3, padding: '0 5px', fontFamily: 'monospace', fontSize: 11 }}>{String(to ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {entries.length < total && (
        <button onClick={onLoadMore} disabled={loading}
          style={{ marginTop: 12, width: '100%', padding: '8px 0', background: 'none', border: '1px dashed #d9d9d9', borderRadius: 6, cursor: loading ? 'default' : 'pointer', fontSize: 13, color: loading ? '#bfbfbf' : '#1890ff' }}>
          {loading ? 'Loading…' : `Load more (${total - entries.length} remaining)`}
        </button>
      )}
    </div>
  );
}

function AuditModal({ jobId, jobLabel, onClose }: { jobId: string; jobLabel: string; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const PAGE = 30;

  const load = useCallback(async (off: number, append: boolean) => {
    setLoading(true);
    try {
      const { data } = await client.get(`/audits/jobs/${jobId}`, { params: { limit: PAGE, offset: off } });
      setTotal(data.total);
      setOffset(off + data.entries.length);
      setEntries(prev => append ? [...prev, ...data.entries] : data.entries);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(0, false); }, [load]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '90vw', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1890ff' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#262626' }}>Audit Trail</div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>{jobLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!loading && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{total} event{total !== 1 ? 's' : ''}</span>}
            <button onClick={() => load(0, false)} title="Refresh"
              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <button onClick={onClose}
              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#595959', fontSize: 18, lineHeight: 1 }}>
              ×
            </button>
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <AuditTimeline entries={entries} loading={loading} total={total} onLoadMore={() => load(offset, true)} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATE_COLORS: Record<string, string> = {
  new: 'badge-gray',
  in_progress: 'badge-blue',
  completed: 'badge-green',
  rejected: 'badge-red',
};
const STAGE_COLORS: Record<string, string> = {
  annotation: 'badge-blue',
  validation: 'badge-orange',
  acceptance: 'badge-green',
};
const STATE_STYLES: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#f5f5f5', color: '#595959' },
  in_progress: { bg: '#e6f4ff', color: '#1890ff' },
  completed:   { bg: '#f6ffed', color: '#52c41a' },
  rejected:    { bg: '#fff1f0', color: '#ff4d4f' },
};

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
        Showing {start}–{end} of {total} job{total !== 1 ? 's' : ''}
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

export default function Jobs() {
  const navigate = useNavigate();
  const { activeTenant } = useTenantStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [page, setPage] = useState(1);
  const [viewJsonJobId, setViewJsonJobId] = useState<string | null>(null);
  const [viewAuditJobId, setViewAuditJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: tasks } = await client.get('/tasks');
      // Fetch all task jobs in parallel instead of sequentially
      const results = await Promise.all(
        tasks.map(async (task: any) => {
          const { data: taskJobs } = await client.get(`/tasks/${task.id}/jobs`);
          return (taskJobs as Job[]).map(j => ({
            ...j,
            task: {
              id: task.id,
              name: task.name,
              thumbnailUrl: task.thumbnailUrl,
              project: task.project,
            },
          }));
        })
      );
      setJobs(results.flat());
    } catch {
      toast.error('Failed to load jobs', 'Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, activeTenant]);

  const closeMenu = () => { setOpenMenuId(null); setMenuPos(null); };
  const openMenu = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (openMenuId === jobId) { closeMenu(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpenMenuId(jobId);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.job-menu-wrap')) closeMenu();
    };
    const onScroll = () => closeMenu();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenuId]);

  const filtered = jobs.filter(j => {
    const matchSearch = !search
      || j.task?.name?.toLowerCase().includes(search.toLowerCase())
      || j.task?.project?.name?.toLowerCase().includes(search.toLowerCase())
      || j.assignee?.username?.toLowerCase().includes(search.toLowerCase());
    const matchState = !filterState || j.state === filterState;
    const matchStage = !filterStage || j.stage === filterStage;
    return matchSearch && matchState && matchStage;
  });

  const PAGE_SIZE = view === 'grid' ? 12 : 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to first page whenever filters or view change
  React.useEffect(() => { setPage(1); }, [search, filterState, filterStage, view]);

  const handleExport = async (jobId: string) => {
    closeMenu();
    try {
      const res = await client.get(`/jobs/${jobId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `job-${jobId}-annotations.json`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed', 'Could not export annotations.');
    }
  };

  const handleDelete = async (jobId: string) => {
    closeMenu();
    const ok = await confirm({
      title: 'Delete this job?',
      message: 'This job and all its annotations will be permanently deleted.',
      confirmLabel: 'Delete job',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await client.delete(`/jobs/${jobId}`);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      toast.success('Job deleted');
    } catch {
      toast.error('Delete failed', 'The job could not be deleted.');
    }
  };

  function JobMenu({ job }: { job: Job }) {
    return (
      <div className="job-menu-wrap">
        <button
          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => openMenu(e, job.id)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <div className="page-header">
        <div>
          <h1>Jobs</h1>
          {!loading && <p>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>}
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
            <input placeholder="Search by task, project or assignee…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
          <select className="input" style={{ width: 150 }} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="">All stages</option>
            <option value="annotation">Annotation</option>
            <option value="validation">Validation</option>
            <option value="acceptance">Acceptance</option>
          </select>
          <select className="input" style={{ width: 150 }} value={filterState} onChange={e => setFilterState(e.target.value)}>
            <option value="">All states</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          view === 'table' ? (
            <div className="table-wrap">
              <table>
                <thead><tr>{['#', '', 'Task', 'Project', 'Stage', 'State', 'Frames', 'Assignee', 'Updated', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 10 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 4, width: j === 1 ? 48 : '70%' }} /></td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card" style={{ overflow: 'hidden' }}>
                  <div className="skeleton" style={{ height: 120, borderRadius: '12px 12px 0 0' }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                    <div className="skeleton skeleton-text" style={{ width: '80%' }} />
                    <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </div>
            <h3>No jobs found</h3>
            <p>{search || filterState || filterStage ? 'Try adjusting your filters.' : 'Jobs appear here when tasks are created in a project.'}</p>
          </div>

        ) : view === 'table' ? (
          <>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['#', 'Thumbnail', 'Task', 'Project', 'Stage', 'State', 'Frames', 'Assignee', 'Updated', 'Actions'].map(h => (
                    <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((job, i) => {
                  const stStyle = STATE_STYLES[job.state] || STATE_STYLES.new;
                  const frameCount = job.frameEnd - job.frameStart + 1;
                  return (
                    <tr key={job.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ padding: '6px 16px' }}>
                        <div style={{ width: 64, height: 38, borderRadius: 6, overflow: 'hidden', background: '#1E293B', flexShrink: 0 }}>
                          {job.task?.thumbnailUrl ? (
                            <img src={job.task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                          onClick={() => job.task?.project?.id && navigate(`/projects/${job.task.project.id}`)}
                        >
                          {job.task?.name || '—'}
                        </button>
                      </td>
                      <td>
                        {job.task?.project?.name ? (
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, padding: 0 }}
                            onClick={() => navigate(`/projects/${job.task!.project!.id}`)}
                          >
                            {job.task.project.name}
                          </button>
                        ) : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${STAGE_COLORS[job.stage] || 'badge-gray'}`}>{job.stage}</span>
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: stStyle.bg, color: stStyle.color }}>
                          {job.state.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {frameCount} <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>({job.frameStart}–{job.frameEnd})</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {job.assignee?.username || <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(job.updatedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate(`/jobs/${job.id}/annotate`)}
                          >
                            Open
                          </button>
                          <JobMenu job={job} />
                        </div>
                      </td>
                    </tr>
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
            {paged.map(job => {
              const stStyle = STATE_STYLES[job.state] || STATE_STYLES.new;
              const frameCount = job.frameEnd - job.frameStart + 1;
              return (
                <div
                  key={job.id}
                  className="card card-hover job-menu-wrap"
                  style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
                  onClick={() => navigate(`/jobs/${job.id}/annotate`)}
                >
                  {/* Thumbnail */}
                  <div style={{ height: 120, background: '#1E293B', position: 'relative', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
                    {job.task?.thumbnailUrl ? (
                      <img src={job.task.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      </div>
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8 }}>
                      <span className={`badge ${STAGE_COLORS[job.stage] || 'badge-gray'}`} style={{ fontSize: 10 }}>{job.stage}</span>
                    </div>
                  </div>

                  {/* Three-dot menu — rendered outside card via fixed dropdown to avoid overflow/transform clipping */}
                  <div className="job-menu-wrap" style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }} onClick={e => e.stopPropagation()}>
                    <button
                      style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                      onClick={e => openMenu(e, job.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '12px 14px' }}>
                    {/* Breadcrumb: Project › Task */}
                    <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {job.task?.project?.name && (
                        <>
                          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{job.task.project.name}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-disabled)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </>
                      )}
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{job.task?.name || '—'}</span>
                    </div>

                    {/* Stage + State + time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: stStyle.bg, color: stStyle.color }}>
                        {job.state.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{timeAgo(job.updatedAt)}</span>
                    </div>

                    {/* Frame info */}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: job.assignee ? 6 : 0 }}>
                      {frameCount} frame{frameCount !== 1 ? 's' : ''}
                      <span style={{ color: 'var(--text-disabled)', marginLeft: 6 }}>({job.frameStart}–{job.frameEnd})</span>
                    </div>

                    {/* Assignee */}
                    {job.assignee && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        {job.assignee.username}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>

      {/* Fixed-position dropdown — rendered outside all card/grid stacking contexts */}
      {openMenuId && menuPos && (() => {
        const job = jobs.find(j => j.id === openMenuId);
        if (!job) return null;
        return (
          <div className="job-menu-wrap" style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 200, zIndex: 9999, overflow: 'hidden' }}>
            <button className="dropdown-item" onClick={() => { navigate(`/jobs/${job.id}/annotate`); closeMenu(); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Open in editor
            </button>
            {job.task?.project?.id && (
              <button className="dropdown-item" onClick={() => { navigate(`/projects/${job.task!.project!.id}`); closeMenu(); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                View task in project
              </button>
            )}
            <button className="dropdown-item" onClick={() => { setViewJsonJobId(job.id); closeMenu(); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              View JSON
            </button>
            <button className="dropdown-item" onClick={() => { setViewAuditJobId(job.id); closeMenu(); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              View audit trail
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item" onClick={() => handleExport(job.id)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export annotations
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item danger" onClick={() => handleDelete(job.id)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Delete job
            </button>
          </div>
        );
      })()}

      {viewJsonJobId && <JsonModal jobId={viewJsonJobId} onClose={() => setViewJsonJobId(null)} />}
      {viewAuditJobId && (() => {
        const job = jobs.find(j => j.id === viewAuditJobId);
        const label = job ? `${job.task?.project?.name ? job.task.project.name + ' › ' : ''}${job.task?.name || ''} · ${job.stage} / ${job.state}` : viewAuditJobId.slice(0, 8) + '…';
        return <AuditModal jobId={viewAuditJobId} jobLabel={label} onClose={() => setViewAuditJobId(null)} />;
      })()}
    </div>
  );
}
