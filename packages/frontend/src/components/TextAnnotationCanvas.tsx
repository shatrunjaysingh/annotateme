import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface TextSpan {
  id: string;
  start: number;
  end: number;
  label: string;
  color: string;
}

interface Props {
  text: string;
  spans: TextSpan[];
  labels: { name: string; color: string }[];
  selectedLabel: string;
  selectedLabelColor: string;
  onAddSpan: (span: TextSpan) => void;
  onDeleteSpan: (id: string) => void;
  onSelectSpan: (id: string | null) => void;
  selectedSpanId: string | null;
}

export default function TextAnnotationCanvas({
  text, spans, labels, selectedLabel, selectedLabelColor,
  onAddSpan, onDeleteSpan, onSelectSpan, selectedSpanId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSpanId, setHoveredSpanId] = useState<string | null>(null);

  // Build a list of character-level segments (text split around spans)
  const segments = buildSegments(text, spans);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Walk the container's text nodes to find character offsets
    const start = getCharOffset(container, range.startContainer, range.startOffset);
    const end = getCharOffset(container, range.endContainer, range.endOffset);
    if (start === null || end === null || start >= end) return;

    sel.removeAllRanges();
    if (!selectedLabel) return;

    const span: TextSpan = {
      id: crypto.randomUUID(),
      start,
      end,
      label: selectedLabel,
      color: selectedLabelColor,
    };
    onAddSpan(span);
  }, [selectedLabel, selectedLabelColor, onAddSpan]);

  if (!text) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8c8c8c', fontSize: 14, flexDirection: 'column', gap: 8 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        No text content loaded
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>Select text to annotate</span>
        {selectedLabel && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#262626' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: selectedLabelColor, display: 'inline-block' }} />
            Active: <b>{selectedLabel}</b>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8c8c8c' }}>{spans.length} annotation{spans.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Text content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          style={{ fontSize: 15, lineHeight: 1.8, userSelect: 'text', cursor: 'text', maxWidth: 800, margin: '0 auto' }}>
          {segments.map((seg, i) => {
            if (!seg.span) {
              return <span key={i}>{text.slice(seg.start, seg.end)}</span>;
            }
            const span = seg.span;
            const isSelected = selectedSpanId === span.id;
            const isHovered = hoveredSpanId === span.id;
            return (
              <mark
                key={i}
                title={span.label}
                onMouseEnter={() => setHoveredSpanId(span.id)}
                onMouseLeave={() => setHoveredSpanId(null)}
                onClick={() => onSelectSpan(isSelected ? null : span.id)}
                style={{
                  background: span.color + (isSelected ? 'cc' : isHovered ? '99' : '55'),
                  borderBottom: `2px solid ${span.color}`,
                  borderRadius: 2,
                  padding: '1px 0',
                  cursor: 'pointer',
                  position: 'relative',
                  outline: isSelected ? `2px solid ${span.color}` : 'none',
                }}>
                {text.slice(span.start, span.end)}
                <sup style={{
                  fontSize: 9, fontWeight: 700, color: span.color,
                  background: '#fff', border: `1px solid ${span.color}`,
                  borderRadius: 3, padding: '0 3px', marginLeft: 2,
                  verticalAlign: 'super',
                }}>{span.label}</sup>
                {(isSelected || isHovered) && (
                  <button
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDeleteSpan(span.id); }}
                    style={{
                      position: 'absolute', top: -12, right: -8,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#ff4d4f', color: '#fff', border: 'none',
                      fontSize: 10, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, lineHeight: 1, zIndex: 10,
                    }}>×</button>
                )}
              </mark>
            );
          })}
        </div>
      </div>

      {/* Span list */}
      {spans.length > 0 && (
        <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px 16px', maxHeight: 140, overflow: 'auto', background: '#fafafa', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Annotations</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {spans.map(span => (
              <div key={span.id}
                onClick={() => onSelectSpan(selectedSpanId === span.id ? null : span.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 12, background: span.color + '22', border: `1px solid ${span.color}44`,
                  cursor: 'pointer', fontSize: 12, outline: selectedSpanId === span.id ? `2px solid ${span.color}` : 'none',
                }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: span.color, flexShrink: 0 }} />
                <span style={{ color: '#262626' }}>&ldquo;{text.slice(span.start, Math.min(span.end, span.start + 20))}{span.end - span.start > 20 ? '…' : ''}&rdquo;</span>
                <span style={{ color: span.color, fontWeight: 600 }}>{span.label}</span>
                <button onMouseDown={e => { e.stopPropagation(); onDeleteSpan(span.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 13, padding: '0 2px' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface Segment { start: number; end: number; span?: TextSpan; }

function buildSegments(text: string, spans: TextSpan[]): Segment[] {
  if (spans.length === 0) return [{ start: 0, end: text.length }];

  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const segs: Segment[] = [];
  let cursor = 0;

  for (const span of sorted) {
    if (span.start > cursor) segs.push({ start: cursor, end: span.start });
    segs.push({ start: span.start, end: span.end, span });
    cursor = span.end;
  }
  if (cursor < text.length) segs.push({ start: cursor, end: text.length });
  return segs;
}

function getCharOffset(root: HTMLElement, node: Node, offset: number): number | null {
  let charCount = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) return charCount + offset;
    charCount += (current.textContent?.length ?? 0);
    current = walker.nextNode();
  }
  return null;
}
