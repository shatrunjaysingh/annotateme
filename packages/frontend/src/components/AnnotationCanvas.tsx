import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useAnnotationStore, Shape, Point, ToolType } from '../store/annotationStore';

const HANDLE_SIZE = 6;
const MIN_SHAPE_SIZE = 4;
const COLORS = ['#1890ff','#52c41a','#fa8c16','#eb2f96','#722ed1','#13c2c2','#ff4d4f','#fadb14','#2f54eb','#389e0d'];

function uid() { return Math.random().toString(36).slice(2); }

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function pointInRect(p: Point, pts: Point[]) {
  if (pts.length < 2) return false;
  const [tl, br] = pts;
  return p.x >= Math.min(tl.x, br.x) && p.x <= Math.max(tl.x, br.x) && p.y >= Math.min(tl.y, br.y) && p.y <= Math.max(tl.y, br.y);
}

function pointInPolygon(p: Point, pts: Point[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const nx = a.x + t * dx - p.x, ny = a.y + t * dy - p.y;
  return Math.sqrt(nx * nx + ny * ny);
}

function pointNearPolyline(p: Point, pts: Point[], thresh: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distanceToSegment(p, pts[i], pts[i + 1]) < thresh) return true;
  }
  return false;
}

function hitTest(shape: Shape, p: Point, thresh: number, hiddenLabels: Set<string> = new Set()): boolean {
  if (shape.hidden || hiddenLabels.has(shape.label)) return false;
  switch (shape.type) {
    case 'rect': return pointInRect(p, shape.points);
    case 'polygon': return pointInPolygon(p, shape.points);
    case 'point': return shape.points[0] && Math.hypot(p.x - shape.points[0].x, p.y - shape.points[0].y) < thresh;
    case 'polyline': return pointNearPolyline(p, shape.points, thresh);
    case 'ellipse': {
      if (shape.points.length < 2) return false;
      const [c, r] = shape.points;
      const dx = (p.x - c.x) / (r.x || 1), dy = (p.y - c.y) / (r.y || 1);
      return dx * dx + dy * dy <= 1;
    }
    default: return false;
  }
}

// Returns handle positions for a shape (in image coords), order matching applyVertexMove indices.
function getShapeHandles(shape: Shape): Point[] {
  if (shape.type === 'rect' && shape.points.length >= 2) {
    const [p0, p1] = shape.points;
    const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y), maxY = Math.max(p0.y, p1.y);
    return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  }
  if (shape.type === 'ellipse' && shape.points.length >= 2) {
    const [c, r] = shape.points;
    return [
      { x: c.x, y: c.y },
      { x: c.x, y: c.y - Math.abs(r.y) },
      { x: c.x, y: c.y + Math.abs(r.y) },
      { x: c.x - Math.abs(r.x), y: c.y },
      { x: c.x + Math.abs(r.x), y: c.y },
    ];
  }
  return shape.points;
}

function hitHandle(handles: Point[], imgPt: Point, thresh: number): number {
  for (let i = 0; i < handles.length; i++) {
    if (Math.hypot(imgPt.x - handles[i].x, imgPt.y - handles[i].y) < thresh) return i;
  }
  return -1;
}

// Move a single vertex/handle and return new points array.
function applyVertexMove(shape: Shape, handleIdx: number, newPt: Point): Point[] {
  const pts = shape.points.map(p => ({ ...p }));
  if (shape.type === 'rect' && pts.length >= 2) {
    const [p0, p1] = pts;
    const minXIdx = p0.x <= p1.x ? 0 : 1, maxXIdx = 1 - minXIdx;
    const minYIdx = p0.y <= p1.y ? 0 : 1, maxYIdx = 1 - minYIdx;
    if (handleIdx === 0) { pts[minXIdx].x = newPt.x; pts[minYIdx].y = newPt.y; }
    else if (handleIdx === 1) { pts[maxXIdx].x = newPt.x; pts[minYIdx].y = newPt.y; }
    else if (handleIdx === 2) { pts[maxXIdx].x = newPt.x; pts[maxYIdx].y = newPt.y; }
    else if (handleIdx === 3) { pts[minXIdx].x = newPt.x; pts[maxYIdx].y = newPt.y; }
  } else if (shape.type === 'ellipse' && pts.length >= 2) {
    const c = pts[0], r = pts[1];
    if (handleIdx === 0) { c.x = newPt.x; c.y = newPt.y; }
    else if (handleIdx === 1) { r.y = Math.max(2, c.y - newPt.y); }
    else if (handleIdx === 2) { r.y = Math.max(2, newPt.y - c.y); }
    else if (handleIdx === 3) { r.x = Math.max(2, c.x - newPt.x); }
    else if (handleIdx === 4) { r.x = Math.max(2, newPt.x - c.x); }
  } else if (handleIdx < pts.length) {
    pts[handleIdx].x = newPt.x;
    pts[handleIdx].y = newPt.y;
  }
  return pts;
}

interface Props {
  imageUrl: string | null;
  jobId: string;
  frameNum: number;
  labels: { name: string; color: string }[];
  colorBy?: 'label' | 'instance';
  hiddenLabels?: Set<string>;
  outlinedBorders?: boolean;
  fillOpacity?: number;
  selectedOpacity?: number;
}

export default function AnnotationCanvas({ imageUrl, jobId, frameNum, labels, colorBy = 'label', hiddenLabels = new Set(), outlinedBorders = false, fillOpacity = 0.25, selectedOpacity = 0.55 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const drawingRef = useRef<{ active: boolean; pts: Point[]; startX: number; startY: number }>({ active: false, pts: [], startX: 0, startY: 0 });
  const dragRef = useRef<{ shapeId: string | null; startImg: Point; startPts: Point[]; vertexIdx: number }>({ shapeId: null, startImg: { x: 0, y: 0 }, startPts: [], vertexIdx: -1 });
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(100);

  const { currentTool, selectedLabel, selectedLabelColor, shapes, selectedShapeId, addShape, updateShape, deleteShape, selectShape, undo, redo } = useAnnotationStore();

  // Screen → image coords
  const screenToImg = useCallback((sx: number, sy: number): Point => {
    const t = transformRef.current;
    return { x: (sx - t.offsetX) / t.scale, y: (sy - t.offsetY) / t.scale };
  }, []);

  // Image → screen coords
  const imgToScreen = useCallback((ix: number, iy: number): Point => {
    const t = transformRef.current;
    return { x: ix * t.scale + t.offsetX, y: iy * t.scale + t.offsetY };
  }, []);

  const getColor = useCallback((label: string) => {
    const found = labels.find(l => l.name === label);
    return found?.color || '#1890ff';
  }, [labels]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { scale, offsetX, offsetY } = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    // Draw image
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0);

    // Draw all shapes
    shapes.forEach((shape, shapeIndex) => {
      if (shape.hidden || hiddenLabels.has(shape.label)) return;
      const color = colorBy === 'instance' ? COLORS[shapeIndex % COLORS.length] : getColor(shape.label);
      const effectiveFill = outlinedBorders ? 0 : fillOpacity;
      const isSelected = shape.id === selectedShapeId;
      const effectiveSelectedOpacity = outlinedBorders ? 0 : selectedOpacity;
      ctx.save();

      if (shape.type === 'rect' && shape.points.length >= 2) {
        const [tl, br] = shape.points;
        const x = Math.min(tl.x, br.x), y = Math.min(tl.y, br.y);
        const w = Math.abs(br.x - tl.x), h = Math.abs(br.y - tl.y);
        ctx.fillStyle = hexToRgba(color, isSelected ? effectiveSelectedOpacity : effectiveFill);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 / scale : 1.5 / scale;
        if (isSelected) { ctx.setLineDash([6 / scale, 3 / scale]); }
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        // Handles
        if (isSelected) {
          [tl, { x: br.x, y: tl.y }, br, { x: tl.x, y: br.y }].forEach(pt => {
            const hs = HANDLE_SIZE / scale;
            ctx.fillStyle = '#fff';
            ctx.fillRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5 / scale;
            ctx.setLineDash([]);
            ctx.strokeRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
          });
        }
        // Label
        ctx.fillStyle = color;
        ctx.font = `${12 / scale}px -apple-system, sans-serif`;
        ctx.fillText(shape.label, x, y - 4 / scale);

      } else if (shape.type === 'polygon' && shape.points.length >= 2) {
        ctx.beginPath();
        shape.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, isSelected ? effectiveSelectedOpacity : effectiveFill);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 / scale : 1.5 / scale;
        if (isSelected) ctx.setLineDash([6 / scale, 3 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Vertices
        shape.points.forEach(pt => {
          const hs = HANDLE_SIZE / scale;
          ctx.fillStyle = isSelected ? '#fff' : color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, hs / 2, 0, Math.PI * 2);
          ctx.fill();
          if (isSelected) { ctx.strokeStyle = color; ctx.lineWidth = 1.5 / scale; ctx.stroke(); }
        });
        // Label
        if (shape.points.length > 0) {
          ctx.fillStyle = color;
          ctx.font = `${12 / scale}px -apple-system, sans-serif`;
          ctx.fillText(shape.label, shape.points[0].x, shape.points[0].y - 4 / scale);
        }

      } else if (shape.type === 'point' && shape.points[0]) {
        const pt = shape.points[0];
        const r = 6 / scale;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.6);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2 / scale : 1.5 / scale;
        ctx.stroke();
        // crosshair
        ctx.beginPath();
        ctx.moveTo(pt.x - r * 1.5, pt.y); ctx.lineTo(pt.x + r * 1.5, pt.y);
        ctx.moveTo(pt.x, pt.y - r * 1.5); ctx.lineTo(pt.x, pt.y + r * 1.5);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = `${12 / scale}px -apple-system, sans-serif`;
        ctx.fillText(shape.label, pt.x + r + 2 / scale, pt.y - 2 / scale);

      } else if (shape.type === 'polyline' && shape.points.length >= 2) {
        ctx.beginPath();
        shape.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 / scale : 1.5 / scale;
        if (isSelected) ctx.setLineDash([6 / scale, 3 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
        shape.points.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, HANDLE_SIZE / 2 / scale, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 / scale;
          ctx.stroke();
        });
        if (shape.points[0]) {
          ctx.fillStyle = color;
          ctx.font = `${12 / scale}px -apple-system, sans-serif`;
          ctx.fillText(shape.label, shape.points[0].x, shape.points[0].y - 4 / scale);
        }

      } else if (shape.type === 'ellipse' && shape.points.length >= 2) {
        const [c, r] = shape.points;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, Math.abs(r.x), Math.abs(r.y), 0, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, isSelected ? effectiveSelectedOpacity : effectiveFill);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 / scale : 1.5 / scale;
        if (isSelected) ctx.setLineDash([6 / scale, 3 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isSelected) {
          getShapeHandles(shape).forEach(h => {
            ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_SIZE / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 1.5 / scale; ctx.stroke();
          });
        }
        ctx.fillStyle = color;
        ctx.font = `${12 / scale}px -apple-system, sans-serif`;
        ctx.fillText(shape.label, c.x - Math.abs(r.x), c.y - Math.abs(r.y) - 4 / scale);
      }
      ctx.restore();
    });

    // Draw current in-progress shape
    const d = drawingRef.current;
    if (d.active && d.pts.length > 0) {
      ctx.save();
      ctx.strokeStyle = selectedLabelColor;
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      ctx.fillStyle = hexToRgba(selectedLabelColor, 0.15);

      if (currentTool === 'rect' && d.pts.length >= 1) {
        const p1 = d.pts[0], p2 = d.pts[d.pts.length - 1];
        ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
        ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      } else if ((currentTool === 'polygon' || currentTool === 'polyline') && d.pts.length >= 1) {
        ctx.beginPath();
        d.pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        if (currentTool === 'polygon') ctx.closePath();
        ctx.fill();
        ctx.stroke();
        d.pts.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 / scale, 0, Math.PI * 2);
          ctx.fillStyle = selectedLabelColor;
          ctx.setLineDash([]);
          ctx.fill();
        });
      } else if (currentTool === 'ellipse' && d.pts.length >= 2) {
        const [c, r] = d.pts;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, Math.abs(r.x - c.x) || 1, Math.abs(r.y - c.y) || 1, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }, [shapes, selectedShapeId, selectedLabelColor, currentTool, getColor, colorBy, hiddenLabels, outlinedBorders, fillOpacity, selectedOpacity]);

  // Load image
  useEffect(() => {
    if (!imageUrl) { imgRef.current = null; fitImage(); draw(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgRef.current = img; fitImage(); draw(); };
    img.onerror = () => { imgRef.current = null; draw(); };
    img.src = imageUrl;
  }, [imageUrl]);

  const fitImage = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (imgRef.current) {
      const scaleX = canvas.width / imgRef.current.width;
      const scaleY = canvas.height / imgRef.current.height;
      const scale = Math.min(scaleX, scaleY) * 0.9;
      transformRef.current = {
        scale,
        offsetX: (canvas.width - imgRef.current.width * scale) / 2,
        offsetY: (canvas.height - imgRef.current.height * scale) / 2,
      };
      setZoomLevel(Math.round(scale * 100));
    }
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => fitImage());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitImage]);

  useEffect(() => { draw(); }, [draw, shapes, selectedShapeId]);

  const getCanvasPos = (e: React.MouseEvent | MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const screenPt = getCanvasPos(e);
    const imgPt = screenToImg(screenPt.x, screenPt.y);

    // Middle mouse or Ctrl+drag = pan
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      isPanning.current = true;
      lastPan.current = screenPt;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;

    if (currentTool === 'select') {
      const thresh = 8 / transformRef.current.scale;

      // Check vertex handles on the currently selected shape first
      if (selectedShapeId) {
        const selShape = shapes.find(s => s.id === selectedShapeId);
        if (selShape) {
          const handles = getShapeHandles(selShape);
          const vi = hitHandle(handles, imgPt, thresh * 1.5);
          if (vi >= 0) {
            dragRef.current = { shapeId: selectedShapeId, startImg: imgPt, startPts: selShape.points.map(p => ({ ...p })), vertexIdx: vi };
            draw();
            return;
          }
        }
      }

      // Otherwise pick topmost shape for whole-shape drag
      let hit: string | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTest(shapes[i], imgPt, thresh, hiddenLabels)) { hit = shapes[i].id; break; }
      }
      selectShape(hit);
      if (hit) {
        const sh = shapes.find(s => s.id === hit)!;
        dragRef.current = { shapeId: hit, startImg: imgPt, startPts: sh.points.map(p => ({ ...p })), vertexIdx: -1 };
      }
      draw();
      return;
    }

    // Drawing
    if (currentTool === 'point') {
      const color = getColor(selectedLabel || '');
      addShape({ id: uid(), type: 'point', label: selectedLabel || 'object', color, points: [imgPt] });
      return;
    }

    if (currentTool === 'rect' || currentTool === 'ellipse') {
      drawingRef.current = { active: true, pts: [imgPt, imgPt], startX: screenPt.x, startY: screenPt.y };
      return;
    }

    if (currentTool === 'polygon' || currentTool === 'polyline') {
      const d = drawingRef.current;
      if (!d.active) {
        // Two entries: [committed_point, mouse_preview]. On move, only the last is updated.
        drawingRef.current = { active: true, pts: [imgPt, imgPt], startX: screenPt.x, startY: screenPt.y };
      } else {
        // Current last is the preview following the mouse — it becomes a committed click,
        // then push a new preview entry at the same position.
        d.pts[d.pts.length - 1] = imgPt;
        d.pts.push(imgPt);
        draw();
      }
      return;
    }
  }, [currentTool, shapes, selectedLabel, screenToImg, selectShape, addShape, getColor, draw]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const screenPt = getCanvasPos(e);
    const imgPt = screenToImg(screenPt.x, screenPt.y);

    if (isPanning.current) {
      const dx = screenPt.x - lastPan.current.x;
      const dy = screenPt.y - lastPan.current.y;
      transformRef.current.offsetX += dx;
      transformRef.current.offsetY += dy;
      lastPan.current = screenPt;
      draw();
      return;
    }

    // Dragging selected shape or vertex
    if (currentTool === 'select' && dragRef.current.shapeId && e.buttons === 1) {
      if (dragRef.current.vertexIdx >= 0) {
        const sh = shapes.find(s => s.id === dragRef.current.shapeId);
        if (sh) updateShape(dragRef.current.shapeId, { points: applyVertexMove(sh, dragRef.current.vertexIdx, imgPt) });
      } else {
        const dx = imgPt.x - dragRef.current.startImg.x;
        const dy = imgPt.y - dragRef.current.startImg.y;
        updateShape(dragRef.current.shapeId, { points: dragRef.current.startPts.map(p => ({ x: p.x + dx, y: p.y + dy })) });
      }
      return;
    }

    // Cursor feedback in select mode (when not dragging)
    if (currentTool === 'select' && !dragRef.current.shapeId) {
      const canvas = canvasRef.current!;
      const thresh = 8 / transformRef.current.scale;
      if (selectedShapeId) {
        const selShape = shapes.find(s => s.id === selectedShapeId);
        if (selShape && hitHandle(getShapeHandles(selShape), imgPt, thresh * 1.5) >= 0) {
          canvas.style.cursor = 'crosshair'; return;
        }
      }
      let overShape = false;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTest(shapes[i], imgPt, thresh, hiddenLabels)) { overShape = true; break; }
      }
      canvas.style.cursor = overShape ? 'move' : '';
    }

    // Update in-progress drawing preview
    const d = drawingRef.current;
    if (d.active) {
      if (currentTool === 'rect' || currentTool === 'ellipse') {
        d.pts[1] = imgPt;
      } else if (currentTool === 'polygon' || currentTool === 'polyline') {
        // last point follows mouse (not yet committed)
        if (d.pts.length > 0) d.pts[d.pts.length - 1] = imgPt;
      }
      draw();
    }
  }, [currentTool, screenToImg, updateShape, draw]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    if (isPanning.current) { isPanning.current = false; canvas.style.cursor = ''; return; }
    dragRef.current.shapeId = null;

    const screenPt = getCanvasPos(e);
    const imgPt = screenToImg(screenPt.x, screenPt.y);

    const d = drawingRef.current;
    if (!d.active) return;

    if (currentTool === 'rect') {
      const [p1, p2] = d.pts;
      if (Math.abs(p2.x - p1.x) > MIN_SHAPE_SIZE && Math.abs(p2.y - p1.y) > MIN_SHAPE_SIZE) {
        addShape({ id: uid(), type: 'rect', label: selectedLabel || 'object', color: getColor(selectedLabel || ''), points: [p1, p2] });
      }
      drawingRef.current = { active: false, pts: [], startX: 0, startY: 0 };
    } else if (currentTool === 'ellipse') {
      const [c] = d.pts;
      const rx = Math.abs(imgPt.x - c.x), ry = Math.abs(imgPt.y - c.y);
      if (rx > MIN_SHAPE_SIZE && ry > MIN_SHAPE_SIZE) {
        addShape({ id: uid(), type: 'ellipse', label: selectedLabel || 'object', color: getColor(selectedLabel || ''), points: [c, { x: rx, y: ry }] });
      }
      drawingRef.current = { active: false, pts: [], startX: 0, startY: 0 };
    }
    draw();
  }, [currentTool, selectedLabel, screenToImg, addShape, getColor, draw]);

  const onDblClick = useCallback(() => {
    const d = drawingRef.current;
    if (!d.active) return;
    if ((currentTool === 'polygon' || currentTool === 'polyline') && d.pts.length >= 3) {
      const pts = d.pts.slice(0, -1); // remove last (preview) point
      addShape({ id: uid(), type: currentTool, label: selectedLabel || 'object', color: getColor(selectedLabel || ''), points: pts });
    }
    drawingRef.current = { active: false, pts: [], startX: 0, startY: 0 };
    draw();
  }, [currentTool, selectedLabel, addShape, getColor, draw]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const t = transformRef.current;
    t.scale = Math.max(0.05, Math.min(20, t.scale * factor));
    t.offsetX = mouseX - (mouseX - t.offsetX) * factor;
    t.offsetY = mouseY - (mouseY - t.offsetY) * factor;
    setZoomLevel(Math.round(t.scale * 100));
    draw();
  }, [draw]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedShapeId: sid } = useAnnotationStore.getState();
        if (sid) deleteShape(sid);
      }
      if (e.key === 'Escape') {
        drawingRef.current = { active: false, pts: [], startX: 0, startY: 0 };
        selectShape(null);
        draw();
      }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if (e.key === 'f' || e.key === 'F') fitImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteShape, selectShape, undo, redo, fitImage, draw]);

  const cursorForTool: Record<ToolType, string> = {
    select: 'default', rect: 'crosshair', polygon: 'crosshair', point: 'crosshair', polyline: 'crosshair', ellipse: 'crosshair',
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: cursorForTool[currentTool] }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDblClick}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
      />
      {!imageUrl && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <p style={{ marginTop: 12, fontSize: 14 }}>No image loaded</p>
        </div>
      )}
      {/* Zoom indicator */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 4, pointerEvents: 'none' }}>
        {zoomLevel}%
      </div>
    </div>
  );
}
