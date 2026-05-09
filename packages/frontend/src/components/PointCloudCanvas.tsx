import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Cuboid3D {
  id: string;
  label: string;
  color: string;
  center: { x: number; y: number; z: number };
  dimensions: { w: number; h: number; d: number };
  rotation: number; // yaw in radians
  hidden?: boolean;
  locked?: boolean;
}

interface Props {
  points?: Float32Array;       // flattened xyz xyz xyz…
  pointColors?: Float32Array;  // flattened rgb rgb rgb… (0-1)
  cuboids?: Cuboid3D[];
  labels?: { name: string; color: string }[];
  currentTool?: 'select' | 'cuboid';
  selectedLabel?: string | null;
  selectedLabelColor?: string;
  colorBy?: 'label' | 'instance';
  selectedCuboidId?: string | null;
  cuboidOrientation?: boolean;
  onAddCuboid?: (c: Cuboid3D) => void;
  onSelectCuboid?: (id: string | null) => void;
  subViewHeight?: number;
  expandedView?: 'top' | 'side' | 'front' | null;
  onExpandView?: (v: 'top' | 'side' | 'front' | null) => void;
}

function uid() { return Math.random().toString(36).slice(2, 11); }

function hexToThreeColor(hex: string) {
  return new THREE.Color(hex);
}

function makeCuboidLines(c: Cuboid3D, selected: boolean): THREE.LineSegments {
  const geo = new THREE.BoxGeometry(c.dimensions.w, c.dimensions.h, c.dimensions.d);
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({
    color: hexToThreeColor(c.color),
    linewidth: selected ? 2 : 1,
  });
  const mesh = new THREE.LineSegments(edges, mat);
  mesh.position.set(c.center.x, c.center.y + c.dimensions.h / 2, c.center.z);
  mesh.rotation.y = c.rotation;
  mesh.userData['cuboidId'] = c.id;
  return mesh;
}

// Generate a plausible street-scene demo cloud
function demoCloud(): Float32Array {
  const count = 60000;
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = Math.random();
    if (r < 0.65) {
      // Road / ground plane
      pts[i3]   = (Math.random() - 0.5) * 50;
      pts[i3+1] = (Math.random() - 0.05) * 0.15;
      pts[i3+2] = (Math.random() - 0.5) * 80;
    } else if (r < 0.80) {
      // Curb / low structures
      const side = Math.random() < 0.5 ? -1 : 1;
      pts[i3]   = side * (6 + Math.random() * 2);
      pts[i3+1] = Math.random() * 0.4;
      pts[i3+2] = (Math.random() - 0.5) * 60;
    } else if (r < 0.90) {
      // Vehicles (boxes)
      const vx = (Math.random() - 0.5) * 30;
      const vz = (Math.random() - 0.5) * 50;
      pts[i3]   = vx + (Math.random() - 0.5) * 2;
      pts[i3+1] = Math.random() * 1.8;
      pts[i3+2] = vz + (Math.random() - 0.5) * 4;
    } else {
      // Vegetation / poles
      pts[i3]   = (Math.random() - 0.5) * 40;
      pts[i3+1] = Math.random() * 4;
      pts[i3+2] = (Math.random() - 0.5) * 70;
    }
  }
  return pts;
}

type ViewKey = 'perspective' | 'top' | 'side' | 'front';

const VIEW_LABELS: Record<ViewKey, string> = {
  perspective: 'Perspective',
  top:  'Top',
  side: 'Side',
  front: 'Front',
};

export default function PointCloudCanvas({
  points,
  pointColors,
  cuboids = [],
  labels = [],
  currentTool = 'select',
  selectedLabel = null,
  selectedLabelColor = '#1890ff',
  colorBy = 'label',
  selectedCuboidId = null,
  cuboidOrientation = false,
  onAddCuboid,
  onSelectCuboid,
  subViewHeight = 200,
  expandedView = null,
  onExpandView,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const frameRef = useRef(0);

  // Cameras
  const perspCam = useRef(new THREE.PerspectiveCamera(60, 1, 0.1, 2000));
  const topCam   = useRef(new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 2000));
  const sideCam  = useRef(new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 2000));
  const frontCam = useRef(new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 2000));

  const controlsRef   = useRef<OrbitControls | null>(null);
  const pointsObjRef  = useRef<THREE.Points | null>(null);
  const cuboidsGrpRef = useRef(new THREE.Group());

  // Drawing a new cuboid via drag
  const drawRef = useRef<{
    active: boolean;
    view: ViewKey;
    startWorld: THREE.Vector3;
    previewMesh: THREE.LineSegments | null;
  }>({ active: false, view: 'top', startWorld: new THREE.Vector3(), previewMesh: null });

  // Ortho view panning
  const panRef = useRef<{ active: boolean; view: ViewKey; lastX: number; lastY: number }>({
    active: false, view: 'top', lastX: 0, lastY: 0,
  });

  const [zoomLabel, setZoomLabel] = useState('');

  // ─── Init Three.js ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x1a1a1a);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = sceneRef.current;

    // Grid (XZ plane)
    const grid = new THREE.GridHelper(60, 30, 0x333333, 0x2a2a2a);
    scene.add(grid);

    // Axes helper (tiny)
    const axes = new THREE.AxesHelper(3);
    scene.add(axes);

    // Cuboids group
    scene.add(cuboidsGrpRef.current);

    // Camera positions
    perspCam.current.position.set(15, 12, 20);
    perspCam.current.lookAt(0, 0, 0);

    topCam.current.position.set(0, 80, 0);
    topCam.current.up.set(0, 0, -1);
    topCam.current.lookAt(0, 0, 0);

    sideCam.current.position.set(80, 5, 0);
    sideCam.current.lookAt(0, 5, 0);

    frontCam.current.position.set(0, 5, 80);
    frontCam.current.lookAt(0, 5, 0);

    // Orbit controls for perspective camera
    const controls = new OrbitControls(perspCam.current, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 2, 0);
    controls.update();
    controlsRef.current = controls;

    // Load or demo point cloud
    const cloudPts = points ?? demoCloud();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cloudPts, 3));

    let colors: Float32Array;
    if (pointColors && pointColors.length === cloudPts.length) {
      colors = pointColors;
    } else {
      // Pseudo-intensity: brighter = higher Y
      colors = new Float32Array(cloudPts.length);
      for (let i = 0; i < cloudPts.length / 3; i++) {
        const y = cloudPts[i * 3 + 1];
        const intensity = Math.min(1, 0.25 + y * 0.18);
        colors[i * 3]     = intensity;
        colors[i * 3 + 1] = intensity;
        colors[i * 3 + 2] = intensity;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    pointsObjRef.current = pts;

    // Render loop
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderAll(renderer);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ─── Update point cloud when props change ─────────────────────────────
  useEffect(() => {
    if (!points || !pointsObjRef.current) return;
    const geo = pointsObjRef.current.geometry as THREE.BufferGeometry;

    // PCD files use Z-up (x=forward, y=left, z=up).
    // Three.js uses Y-up, so we remap: Three.js(x,y,z) = PCD(x,z,y)
    const n = points.length / 3;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3]   = points[i*3];    // PCD x → Three.js x
      pos[i*3+1] = points[i*3+2]; // PCD z → Three.js y (up)
      pos[i*3+2] = points[i*3+1]; // PCD y → Three.js z
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeBoundingBox();
    if (pointColors && pointColors.length === points.length) {
      geo.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
    }
    geo.attributes.position.needsUpdate = true;

    // Auto-fit cameras to the axis-aligned bounding box
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      const size   = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.boundingBox.getSize(size);

      // Horizontal extent (XZ ground plane), vertical extent (Y)
      const hRadius = Math.max(size.x, size.z) * 0.65;
      const camY    = center.y + Math.max(size.y * 4, hRadius * 0.5);

      perspCam.current.position.set(center.x + hRadius, camY, center.z + hRadius);
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }

      // Top (bird's-eye): camera directly above, -Z is "up" on screen
      topCam.current.position.set(center.x, center.y + 500, center.z);
      topCam.current.up.set(0, 0, -1);
      topCam.current.lookAt(center.x, center.y, center.z);

      // Side: look along X axis
      sideCam.current.position.set(center.x + 500, center.y, center.z);
      sideCam.current.up.set(0, 1, 0);
      sideCam.current.lookAt(center.x, center.y, center.z);

      // Front: look along Z axis
      frontCam.current.position.set(center.x, center.y, center.z + 500);
      frontCam.current.up.set(0, 1, 0);
      frontCam.current.lookAt(center.x, center.y, center.z);

      (topCam.current   as any)._orthoSize = hRadius * 1.1;
      (sideCam.current  as any)._orthoSize = Math.max(size.x, size.y) * 0.65;
      (frontCam.current as any)._orthoSize = Math.max(size.z, size.y) * 0.65;
    }
  }, [points, pointColors]);

  // ─── Rebuild cuboid meshes when cuboids / selection changes ───────────
  useEffect(() => {
    const grp = cuboidsGrpRef.current;
    grp.clear();
    cuboids.forEach(c => {
      if (c.hidden) return;
      const mesh = makeCuboidLines(c, c.id === selectedCuboidId);
      grp.add(mesh);
      // Add orientation arrow if cuboidOrientation enabled
      if (cuboidOrientation) {
        const arrow = new THREE.ArrowHelper(
          new THREE.Vector3(Math.sin(c.rotation), 0, Math.cos(c.rotation)),
          new THREE.Vector3(c.center.x, c.center.y + c.dimensions.h / 2, c.center.z),
          c.dimensions.w * 0.7,
          hexToThreeColor(c.color),
          0.4, 0.25,
        );
        grp.add(arrow);
      }
    });
  }, [cuboids, selectedCuboidId, cuboidOrientation]);

  // ─── Viewport layout helpers ──────────────────────────────────────────
  const getViewRects = useCallback((w: number, h: number) => {
    if (expandedView) {
      const camMap: Record<string, THREE.Camera> = {
        top: topCam.current, side: sideCam.current, front: frontCam.current,
      };
      return [{ key: expandedView as ViewKey, cam: camMap[expandedView], left: 0, bottom: 0, width: w, height: h }];
    }
    const mainH = h - subViewHeight;
    const subW  = Math.floor(w / 3);
    return [
      { key: 'perspective' as ViewKey, cam: perspCam.current,  left: 0,       bottom: subViewHeight, width: w,    height: mainH },
      { key: 'top'         as ViewKey, cam: topCam.current,    left: 0,       bottom: 0,             width: subW, height: subViewHeight },
      { key: 'side'        as ViewKey, cam: sideCam.current,   left: subW,    bottom: 0,             width: subW, height: subViewHeight },
      { key: 'front'       as ViewKey, cam: frontCam.current,  left: subW*2,  bottom: 0,             width: w - subW*2, height: subViewHeight },
    ];
  }, [subViewHeight, expandedView]);

  const renderAll = useCallback((renderer: THREE.WebGLRenderer) => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    renderer.setScissorTest(true);
    const rects = getViewRects(w, h);

    rects.forEach(({ cam, left, bottom, width, height }) => {
      if (width <= 0 || height <= 0) return;
      renderer.setScissor(left, bottom, width, height);
      renderer.setViewport(left, bottom, width, height);

      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = width / height;
        cam.updateProjectionMatrix();
      } else if (cam instanceof THREE.OrthographicCamera) {
        const aspect = width / height;
        const size   = (cam as any)._orthoSize ?? 25;
        cam.left   = -size * aspect;
        cam.right  =  size * aspect;
        cam.top    =  size;
        cam.bottom = -size;
        cam.updateProjectionMatrix();
      }

      renderer.render(sceneRef.current, cam);
    });
  }, [getViewRects]);

  // ─── Resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      rendererRef.current?.setSize(w, h);
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, []);

  // ─── Mouse helpers ────────────────────────────────────────────────────
  function whichViewport(clientX: number, clientY: number): ViewKey {
    const mount = mountRef.current!;
    const rect  = mount.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const h = mount.clientHeight;
    const w = mount.clientWidth;

    if (expandedView) return expandedView as ViewKey;

    if (y < h - subViewHeight) return 'perspective';
    const subW = Math.floor(w / 3);
    const col  = Math.floor(x / subW);
    return (['top', 'side', 'front'] as ViewKey[])[Math.min(col, 2)];
  }

  function canvasNDC(clientX: number, clientY: number, vp: ViewKey): THREE.Vector2 {
    const mount = mountRef.current!;
    const rect  = mount.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const h = mount.clientHeight;
    const w = mount.clientWidth;

    let vLeft: number, vBottom: number, vW: number, vH: number;
    if (expandedView) {
      vLeft = 0; vBottom = 0; vW = w; vH = h;
    } else {
      const subW  = Math.floor(w / 3);
      const mainH = h - subViewHeight;
      if (vp === 'perspective') { vLeft = 0; vBottom = 0; vW = w; vH = mainH; }
      else if (vp === 'top')   { vLeft = 0;       vBottom = mainH; vW = subW; vH = subViewHeight; }
      else if (vp === 'side')  { vLeft = subW;    vBottom = mainH; vW = subW; vH = subViewHeight; }
      else                     { vLeft = subW*2;  vBottom = mainH; vW = w - subW*2; vH = subViewHeight; }
    }

    return new THREE.Vector2(
      ((x - vLeft) / vW)   * 2 - 1,
      -((y - vBottom) / vH) * 2 + 1,
    );
  }

  function worldFromOrtho(ndc: THREE.Vector2, cam: THREE.OrthographicCamera, groundY = 0): THREE.Vector3 {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const target = new THREE.Vector3();
    ray.ray.intersectPlane(plane, target);
    return target;
  }

  // ─── Mouse events ─────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const vp = whichViewport(e.clientX, e.clientY);

    if (currentTool === 'cuboid' && vp !== 'perspective') {
      const camMap: Record<ViewKey, THREE.OrthographicCamera> = {
        top: topCam.current, side: sideCam.current, front: frontCam.current,
        perspective: topCam.current,
      };
      const cam = camMap[vp];
      const ndc = canvasNDC(e.clientX, e.clientY, vp);
      const world = worldFromOrtho(ndc, cam);

      drawRef.current = { active: true, view: vp, startWorld: world, previewMesh: null };
      return;
    }

    if (currentTool === 'select' && vp !== 'perspective') {
      // Raycasting cuboids in ortho view
      const camMap: Record<ViewKey, THREE.Camera> = {
        top: topCam.current, side: sideCam.current, front: frontCam.current,
        perspective: perspCam.current,
      };
      const cam = camMap[vp];
      const ndc = canvasNDC(e.clientX, e.clientY, vp);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, cam);
      const hits = raycaster.intersectObjects(cuboidsGrpRef.current.children, true);
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData['cuboidId']) obj = obj.parent;
        if (obj) { onSelectCuboid?.(obj.userData['cuboidId']); return; }
      }
      onSelectCuboid?.(null);
      // Start ortho pan
      panRef.current = { active: true, view: vp, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    // In perspective view, OrbitControls handles mouse
  }, [currentTool, onSelectCuboid, expandedView]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Ortho pan
    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;

      const applyPan = (cam: THREE.OrthographicCamera) => {
        const size   = (cam as any)._orthoSize ?? 25;
        const mount  = mountRef.current!;
        const w = mount.clientWidth, h = mount.clientHeight;
        const subW = Math.floor(w / 3);
        const vpW  = expandedView ? w : subW;
        const vpH  = expandedView ? h : subViewHeight;
        const worldDx = -(dx / vpW)  * (cam.right - cam.left);
        const worldDy = -(dy / vpH) * (cam.top - cam.bottom);
        cam.position.x   -= worldDx;
        cam.position.z   -= worldDy;
        cam.lookAt(cam.position.x, 0, cam.position.z + 0.001);
        cam.updateProjectionMatrix();
      };

      if (panRef.current.view === 'top')   applyPan(topCam.current);
      if (panRef.current.view === 'side')  applyPan(sideCam.current);
      if (panRef.current.view === 'front') applyPan(frontCam.current);
      return;
    }

    // Cuboid preview
    if (drawRef.current.active && currentTool === 'cuboid') {
      const camMap: Record<ViewKey, THREE.OrthographicCamera> = {
        top: topCam.current, side: sideCam.current, front: frontCam.current,
        perspective: topCam.current,
      };
      const cam = camMap[drawRef.current.view];
      const ndc = canvasNDC(e.clientX, e.clientY, drawRef.current.view);
      const world = worldFromOrtho(ndc, cam);

      // Remove old preview
      if (drawRef.current.previewMesh) {
        sceneRef.current.remove(drawRef.current.previewMesh);
        drawRef.current.previewMesh = null;
      }

      const s = drawRef.current.startWorld;
      const w = Math.abs(world.x - s.x) || 0.1;
      const d = Math.abs(world.z - s.z) || 0.1;
      const h = 2.0;

      const preview: Cuboid3D = {
        id: '__preview__',
        label: selectedLabel || 'object',
        color: selectedLabelColor,
        center: { x: (s.x + world.x) / 2, y: 0, z: (s.z + world.z) / 2 },
        dimensions: { w, h, d },
        rotation: 0,
      };
      const mesh = makeCuboidLines(preview, true);
      sceneRef.current.add(mesh);
      drawRef.current.previewMesh = mesh;
    }
  }, [currentTool, selectedLabel, selectedLabelColor, subViewHeight, expandedView]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    panRef.current.active = false;

    if (drawRef.current.active && currentTool === 'cuboid') {
      if (drawRef.current.previewMesh) {
        sceneRef.current.remove(drawRef.current.previewMesh);
        drawRef.current.previewMesh = null;
      }

      const camMap: Record<ViewKey, THREE.OrthographicCamera> = {
        top: topCam.current, side: sideCam.current, front: frontCam.current,
        perspective: topCam.current,
      };
      const cam = camMap[drawRef.current.view];
      const ndc = canvasNDC(e.clientX, e.clientY, drawRef.current.view);
      const world = worldFromOrtho(ndc, cam);
      const s = drawRef.current.startWorld;

      const w = Math.abs(world.x - s.x);
      const d = Math.abs(world.z - s.z);
      if (w > 0.3 && d > 0.3) {
        const newCuboid: Cuboid3D = {
          id: uid(),
          label: selectedLabel || 'object',
          color: selectedLabelColor,
          center: { x: (s.x + world.x) / 2, y: 0, z: (s.z + world.z) / 2 },
          dimensions: { w, h: 2.0, d },
          rotation: 0,
        };
        onAddCuboid?.(newCuboid);
      }
    }
    drawRef.current.active = false;
  }, [currentTool, selectedLabel, selectedLabelColor, onAddCuboid, expandedView]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const vp = whichViewport(e.clientX, e.clientY);
    if (vp === 'perspective') return; // OrbitControls handles zoom

    const orthoMap: Partial<Record<ViewKey, THREE.OrthographicCamera>> = {
      top: topCam.current, side: sideCam.current, front: frontCam.current,
    };
    const cam = orthoMap[vp];
    if (!cam) return;
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    (cam as any)._orthoSize = ((cam as any)._orthoSize ?? 25) * factor;
    setZoomLabel(Math.round(100 / ((cam as any)._orthoSize / 25)) + '%');
  }, [expandedView]);

  // ─── Viewport overlay labels ───────────────────────────────────────────
  const subViews: ViewKey[] = ['top', 'side', 'front'];

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
    >
      {/* Three.js canvas is appended here by the effect */}

      {/* Main view label */}
      {!expandedView && (
        <div style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none', zIndex: 10 }}>
          <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.5px' }}>
            Perspective
          </span>
        </div>
      )}

      {/* Main view: left/right frame arrows */}
      {!expandedView && (
        <div style={{ position: 'absolute', bottom: subViewHeight + 8, right: 8, display: 'flex', gap: 4, zIndex: 10 }}>
          {(['←', '→'] as const).map((arrow, i) => (
            <button key={i} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {arrow}
            </button>
          ))}
        </div>
      )}

      {/* Sub-view dividers and labels */}
      {!expandedView && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: subViewHeight, display: 'flex', borderTop: '1px solid #333', pointerEvents: 'none', zIndex: 10 }}>
          {subViews.map((view, i) => (
            <div key={view} style={{ flex: 1, position: 'relative', borderRight: i < 2 ? '1px solid #333' : undefined }}>
              {/* Label */}
              <div style={{ position: 'absolute', top: 6, left: 8, pointerEvents: 'none' }}>
                <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.5px' }}>
                  {VIEW_LABELS[view]}
                </span>
              </div>
              {/* Controls: expand and move */}
              <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, pointerEvents: 'auto' }}>
                <button
                  onClick={() => onExpandView?.(view as 'top' | 'side' | 'front')}
                  title={`Expand ${VIEW_LABELS[view]} view`}
                  style={{ width: 22, height: 22, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ⤢
                </button>
                <button
                  title="Pan view"
                  style={{ width: 22, height: 22, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'grab', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ✛
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded view controls */}
      {expandedView && (
        <>
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
            <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.5px' }}>
              {VIEW_LABELS[expandedView]}
            </span>
          </div>
          <button onClick={() => onExpandView?.(null)}
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            ✕ Collapse
          </button>
        </>
      )}

      {/* Crosshair cursors for ortho views */}
      {currentTool === 'cuboid' && (
        <div style={{ position: 'absolute', inset: 0, cursor: 'crosshair', pointerEvents: 'none', zIndex: 5 }} />
      )}
    </div>
  );
}
