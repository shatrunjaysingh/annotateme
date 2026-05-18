import { create } from 'zustand';

export type ToolType = 'select' | 'rect' | 'polygon' | 'point' | 'polyline' | 'ellipse';

export interface Point { x: number; y: number; }

export interface Shape {
  id: string;
  type: 'rect' | 'polygon' | 'point' | 'polyline' | 'ellipse';
  label: string;
  color: string;
  points: Point[];
  occluded?: boolean;
  hidden?: boolean;
  locked?: boolean;
  attributes?: Record<string, string | number | boolean>;
  confidence?: number;
  trackId?: string;
  isInterpolated?: boolean;
}

interface AnnotationState {
  currentTool: ToolType;
  selectedLabel: string | null;
  selectedLabelColor: string;
  shapes: Shape[];
  selectedShapeId: string | null;
  history: Shape[][];
  historyIndex: number;

  setTool: (tool: ToolType) => void;
  setLabel: (label: string, color: string) => void;
  setShapes: (shapes: Shape[]) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  selectShape: (id: string | null) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  clearShapes: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  currentTool: 'select',
  selectedLabel: null,
  selectedLabelColor: '#1890ff',
  shapes: [],
  selectedShapeId: null,
  history: [[]],
  historyIndex: 0,

  setTool: (tool) => set({ currentTool: tool, selectedShapeId: null }),
  setLabel: (label, color) => set({ selectedLabel: label, selectedLabelColor: color }),

  setShapes: (shapes) => {
    set({ shapes, selectedShapeId: null });
    set({ history: [shapes], historyIndex: 0 });
  },

  pushHistory: () => {
    const { shapes, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...shapes.map(s => ({ ...s }))]);
    set({ history: newHistory.slice(-50), historyIndex: Math.min(newHistory.length - 1, 49) });
  },

  addShape: (shape) => {
    get().pushHistory();
    set((s) => ({ shapes: [...s.shapes, shape] }));
  },

  updateShape: (id, updates) => {
    set((s) => ({ shapes: s.shapes.map(sh => sh.id === id ? { ...sh, ...updates } : sh) }));
  },

  deleteShape: (id) => {
    get().pushHistory();
    set((s) => ({ shapes: s.shapes.filter(sh => sh.id !== id), selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId }));
  },

  selectShape: (id) => set({ selectedShapeId: id }),

  toggleHidden: (id) => {
    set((s) => ({ shapes: s.shapes.map(sh => sh.id === id ? { ...sh, hidden: !sh.hidden } : sh) }));
  },

  toggleLocked: (id) => {
    set((s) => ({ shapes: s.shapes.map(sh => sh.id === id ? { ...sh, locked: !sh.locked } : sh) }));
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({ shapes: [...history[newIndex].map(s => ({ ...s }))], historyIndex: newIndex, selectedShapeId: null });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({ shapes: [...history[newIndex].map(s => ({ ...s }))], historyIndex: newIndex, selectedShapeId: null });
  },

  clearShapes: () => set({ shapes: [], selectedShapeId: null, history: [[]], historyIndex: 0 }),
}));
