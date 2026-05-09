import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Cuboid3D {
  id: string;
  label: string;
  color: string;
  center: { x: number; y: number; z: number };
  dimensions: { w: number; h: number; d: number };
  rotation: number;
  hidden?: boolean;
  locked?: boolean;
}

interface Props {
  points?: Float32Array;
  pointColors?: Float32Array;
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
function hexColor(hex: string) { return new THREE.Color(hex); }

function makeCuboidLines(c: Cuboid3D, selected: boolean): THREE.LineSegments {
  const geo = new THREE.BoxGeometry(c.dimensions.w, c.dimensions.h, c.dimensions.d);
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({ color: hexColor(c.color), linewidth: selected ? 2 : 1 });
  const mesh = new THREE.LineSegments(edges, mat);
  mesh.position.set(c.center.x, c.center.y + c.dimensions.h / 2, c.center.z);
  mesh.rotation.y = c.rotation;
  mesh.userData['cuboidId'] = c.id;
  return mesh;
}

function demoCloud(): Float32Array {
  const count = 50000;
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    if (r < 0.65) {
      pts[i*3] = (Math.random()-0.5)*50; pts[i*3+1] = Math.random()*0.15; pts[i*3+2] = (Math.random()-0.5)*80;
    } else if (r < 0.82) {
      const side = Math.random() < 0.5 ? -1 : 1;
      pts[i*3] = side*(6+Math.random()*2); pts[i*3+1] = Math.random()*0.4; pts[i*3+2] = (Math.random()-0.5)*60;
    } else if (r < 0.92) {
      pts[i*3] = (Math.random()-0.5)*30; pts[i*3+1] = Math.random()*1.8; pts[i*3+2] = (Math.random()-0.5)*50;
    } else {
      pts[i*3] = (Math.random()-0.5)*40; pts[i*3+1] = Math.random()*4; pts[i*3+2] = (Math.random()-0.5)*70;
    }
  }
  return pts;
}

function makeColors(pts: Float32Array): Float32Array {
  const n = pts.length / 3;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = pts[i*3+1];
    const t = Math.max(0, Math.min(1, 0.3 + y * 0.15));
    col[i*3] = t; col[i*3+1] = 0.6*(1-Math.abs(t-0.5)*2); col[i*3+2] = 1-t;
  }
  return col;
}

type ViewKey = 'perspective' | 'top' | 'side' | 'front';
const VIEW_LABELS: Record<ViewKey, string> = { perspective: 'Perspective', top: 'Top', side: 'Side', front: 'Front' };

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

  // Three.js objects stored in refs — never recreated on re-render
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef       = useRef<THREE.Scene | null>(null);
  const perspCamRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const topCamRef      = useRef<THREE.OrthographicCamera | null>(null);
  const sideCamRef     = useRef<THREE.OrthographicCamera | null>(null);
  const frontCamRef    = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef    = useRef<OrbitControls | null>(null);
  const pointsObjRef   = useRef<THREE.Points | null>(null);
  const cuboidsGrpRef  = useRef<THREE.Group | null>(null);
  const gridRef        = useRef<THREE.GridHelper | null>(null);
  const rafRef         = useRef(0);
  const initializedRef = useRef(false);

  // Keep layout props in a ref so the animation loop always reads current values
  const layoutRef = useRef({ subViewHeight, expandedView });
  layoutRef.current = { subViewHeight, expandedView };

  const drawRef = useRef<{
    active: boolean; view: ViewKey; startWorld: THREE.Vector3; previewMesh: THREE.LineSegments | null;
  }>({ active: false, view: 'top', startWorld: new THREE.Vector3(), previewMesh: null });

  const panRef = useRef<{ active: boolean; view: ViewKey; lastX: number; lastY: number }>({
    active: false, view: 'top', lastX: 0, lastY: 0,
  });

  // Track mousedown position in perspective view to distinguish click vs drag
  const perspClickRef = useRef<{ x: number; y: number } | null>(null);

  // Current tool/label in a ref so mouse handlers are never stale
  const toolRef  = useRef({ currentTool, selectedLabel, selectedLabelColor });
  toolRef.current = { currentTool, selectedLabel, selectedLabelColor };

  const [, forceUpdate] = useState(0);

  // ─── Viewport layout ──────────────────────────────────────────────────────
  function getViewRects(w: number, h: number) {
    const { subViewHeight: svh, expandedView: ev } = layoutRef.current;
    if (ev) {
      const camMap: Record<string, THREE.Camera | null> = {
        top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current,
      };
      return [{ key: ev as ViewKey, cam: camMap[ev]!, left: 0, bottom: 0, width: w, height: h }];
    }
    const mainH = h - svh;
    const subW  = Math.floor(w / 3);
    return [
      { key: 'perspective' as ViewKey, cam: perspCamRef.current!,  left: 0,      bottom: svh, width: w,         height: mainH },
      { key: 'top'         as ViewKey, cam: topCamRef.current!,    left: 0,      bottom: 0,   width: subW,       height: svh },
      { key: 'side'        as ViewKey, cam: sideCamRef.current!,   left: subW,   bottom: 0,   width: subW,       height: svh },
      { key: 'front'       as ViewKey, cam: frontCamRef.current!,  left: subW*2, bottom: 0,   width: w-subW*2,   height: svh },
    ];
  }

  function renderAll() {
    const renderer = rendererRef.current;
    const scene    = sceneRef.current;
    const mount    = mountRef.current;
    if (!renderer || !scene || !mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (w === 0 || h === 0) return;

    renderer.setScissorTest(true);
    const rects = getViewRects(w, h);

    rects.forEach(({ cam, left, bottom, width, height }) => {
      if (!cam || width <= 0 || height <= 0) return;
      renderer.setScissor(left, bottom, width, height);
      renderer.setViewport(left, bottom, width, height);

      if (cam instanceof THREE.PerspectiveCamera) {
        cam.aspect = width / height;
        cam.updateProjectionMatrix();
      } else if (cam instanceof THREE.OrthographicCamera) {
        const aspect = width / height;
        const size   = (cam as any)._orthoSize ?? 25;
        cam.left = -size * aspect; cam.right = size * aspect;
        cam.top  =  size;         cam.bottom = -size;
        cam.updateProjectionMatrix();
      }

      renderer.render(scene, cam);
    });
  }

  // ─── Init Three.js (runs once after mount) ────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || initializedRef.current) return;
    initializedRef.current = true;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1a1a1a, 1);
    // Size set by ResizeObserver — start with current dimensions
    const w0 = mount.clientWidth  || 800;
    const h0 = mount.clientHeight || 600;
    renderer.setSize(w0, h0);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Cameras
    const perspCam = new THREE.PerspectiveCamera(60, w0 / h0, 0.1, 5000);
    perspCam.position.set(20, 15, 30);
    perspCam.lookAt(0, 0, 0);
    perspCamRef.current = perspCam;

    const makeOrtho = () => new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 5000);
    const topCam   = makeOrtho(); topCam.position.set(0, 200, 0); topCam.up.set(0, 0, -1); topCam.lookAt(0, 0, 0);
    const sideCam  = makeOrtho(); sideCam.position.set(200, 0, 0); sideCam.up.set(0, 1, 0); sideCam.lookAt(0, 0, 0);
    const frontCam = makeOrtho(); frontCam.position.set(0, 0, 200); frontCam.up.set(0, 1, 0); frontCam.lookAt(0, 0, 0);
    topCamRef.current   = topCam;
    sideCamRef.current  = sideCam;
    frontCamRef.current = frontCam;
    (topCam as any)._orthoSize = 25;
    (sideCam as any)._orthoSize = 25;
    (frontCam as any)._orthoSize = 25;

    // Grid
    const grid = new THREE.GridHelper(200, 50, 0x333333, 0x2a2a2a);
    scene.add(grid);
    gridRef.current = grid;

    // Axes
    scene.add(new THREE.AxesHelper(3));

    // Cuboids group
    const grp = new THREE.Group();
    scene.add(grp);
    cuboidsGrpRef.current = grp;

    // Point cloud — demo until real data arrives
    const demoPts = demoCloud();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(demoPts, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(makeColors(demoPts), 3));
    const mat = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    pointsObjRef.current = pts;

    // OrbitControls — NO damping to avoid camera drift on programmatic moves
    const controls = new OrbitControls(perspCam, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 2, 0);
    controls.update();
    controlsRef.current = controls;

    // Render loop
    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderAll();
    }
    animate();

    // Resize observer
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        renderer.setSize(width, height);
      }
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      initializedRef.current = false;
      rendererRef.current    = null;
      sceneRef.current       = null;
      perspCamRef.current    = null;
      topCamRef.current      = null;
      sideCamRef.current     = null;
      frontCamRef.current    = null;
      controlsRef.current    = null;
      pointsObjRef.current   = null;
      cuboidsGrpRef.current  = null;
      gridRef.current        = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Update geometry when points prop changes ─────────────────────────────
  useEffect(() => {
    const ptsObj = pointsObjRef.current;
    if (!points || !ptsObj) return;

    const geo = ptsObj.geometry as THREE.BufferGeometry;
    const n   = points.length / 3;

    // PCD is Z-up (x=forward, y=lateral, z=height) → Three.js Y-up
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3]   = points[i*3];     // PCD x → Three.js x
      pos[i*3+1] = points[i*3+2];  // PCD z → Three.js y (up)
      pos[i*3+2] = -points[i*3+1]; // PCD y → Three.js -z (negate so road goes forward)
    }

    const validColors = pointColors && pointColors.length === points.length;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(validColors ? pointColors : makeColors(pos), 3));

    // Center at origin so camera always sees data regardless of coordinate offset
    geo.center();
    geo.computeBoundingBox();

    if (!geo.boundingBox) return;

    const size = new THREE.Vector3();
    geo.boundingBox.getSize(size);

    // Horizontal extent (XZ plane) drives camera distance
    const hExt    = Math.max(size.x, size.z, 1);
    const vExt    = Math.max(size.y, 1);
    const camDist = hExt * 1.2;

    // Place camera at a 30° elevation viewing the cloud from the front
    const perspCam = perspCamRef.current;
    const controls = controlsRef.current;
    if (perspCam && controls) {
      // Completely reset the controls state before moving camera
      controls.target.set(0, 0, 0);
      perspCam.position.set(0, camDist * 0.5, camDist);
      perspCam.up.set(0, 1, 0);
      perspCam.lookAt(0, 0, 0);
      controls.update();
    }

    // Snap grid to the floor of the data
    if (gridRef.current) gridRef.current.position.y = geo.boundingBox.min.y - 0.05;

    // Ortho cameras sized to show the whole cloud
    const topCam   = topCamRef.current;
    const sideCam  = sideCamRef.current;
    const frontCam = frontCamRef.current;
    if (topCam)   { topCam.position.set(0, 500, 0);   topCam.up.set(0, 0, -1);  topCam.lookAt(0, 0, 0); (topCam as any)._orthoSize   = hExt * 0.55; }
    if (sideCam)  { sideCam.position.set(500, 0, 0);  sideCam.up.set(0, 1, 0);  sideCam.lookAt(0, 0, 0); (sideCam as any)._orthoSize  = Math.max(hExt, vExt) * 0.55; }
    if (frontCam) { frontCam.position.set(0, 0, 500); frontCam.up.set(0, 1, 0); frontCam.lookAt(0, 0, 0); (frontCam as any)._orthoSize = Math.max(hExt, vExt) * 0.55; }
  }, [points, pointColors]);

  // ─── Rebuild cuboid meshes ─────────────────────────────────────────────────
  useEffect(() => {
    const grp = cuboidsGrpRef.current;
    if (!grp) return;
    grp.clear();
    cuboids.forEach(c => {
      if (c.hidden) return;
      grp.add(makeCuboidLines(c, c.id === selectedCuboidId));
      if (cuboidOrientation) {
        grp.add(new THREE.ArrowHelper(
          new THREE.Vector3(Math.sin(c.rotation), 0, Math.cos(c.rotation)),
          new THREE.Vector3(c.center.x, c.center.y + c.dimensions.h / 2, c.center.z),
          c.dimensions.w * 0.7, hexColor(c.color), 0.4, 0.25,
        ));
      }
    });
  }, [cuboids, selectedCuboidId, cuboidOrientation]);

  // ─── Mouse helpers ─────────────────────────────────────────────────────────
  function whichViewport(clientX: number, clientY: number): ViewKey {
    const mount = mountRef.current!;
    const rect  = mount.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { subViewHeight: svh, expandedView: ev } = layoutRef.current;
    if (ev) return ev as ViewKey;
    if (y < mount.clientHeight - svh) return 'perspective';
    const col = Math.floor(x / Math.floor(mount.clientWidth / 3));
    return (['top', 'side', 'front'] as ViewKey[])[Math.min(col, 2)];
  }

  function canvasNDC(clientX: number, clientY: number, vp: ViewKey): THREE.Vector2 {
    const mount = mountRef.current!;
    const rect  = mount.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { subViewHeight: svh, expandedView: ev } = layoutRef.current;
    const w = mount.clientWidth, h = mount.clientHeight;
    let vLeft: number, vBottom: number, vW: number, vH: number;
    if (ev) { vLeft = 0; vBottom = 0; vW = w; vH = h; }
    else {
      const subW = Math.floor(w / 3);
      const mainH = h - svh;
      if (vp === 'perspective') { vLeft = 0; vBottom = 0; vW = w; vH = mainH; }
      else if (vp === 'top')   { vLeft = 0;      vBottom = mainH; vW = subW; vH = svh; }
      else if (vp === 'side')  { vLeft = subW;   vBottom = mainH; vW = subW; vH = svh; }
      else                     { vLeft = subW*2; vBottom = mainH; vW = w-subW*2; vH = svh; }
    }
    return new THREE.Vector2(((x - vLeft) / vW) * 2 - 1, -((y - vBottom) / vH) * 2 + 1);
  }

  function worldFromOrtho(ndc: THREE.Vector2, cam: THREE.OrthographicCamera): THREE.Vector3 {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    ray.ray.intersectPlane(plane, target);
    return target;
  }

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const vp = whichViewport(e.clientX, e.clientY);
    const { currentTool: tool } = toolRef.current;
    // Track click start in perspective view for click-to-select
    if (vp === 'perspective') {
      perspClickRef.current = { x: e.clientX, y: e.clientY };
    } else {
      perspClickRef.current = null;
    }
    if (tool === 'cuboid' && vp !== 'perspective') {
      const camMap = { top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current, perspective: topCamRef.current };
      const cam = camMap[vp as keyof typeof camMap];
      if (!cam) return;
      const world = worldFromOrtho(canvasNDC(e.clientX, e.clientY, vp), cam as THREE.OrthographicCamera);
      drawRef.current = { active: true, view: vp, startWorld: world, previewMesh: null };
      return;
    }
    if (tool === 'select' && vp !== 'perspective') {
      const camMap = { top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current, perspective: perspCamRef.current };
      const cam = camMap[vp as keyof typeof camMap];
      if (!cam) return;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(canvasNDC(e.clientX, e.clientY, vp), cam);
      const hits = raycaster.intersectObjects(cuboidsGrpRef.current?.children ?? [], true);
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData['cuboidId']) obj = obj.parent;
        if (obj) { onSelectCuboid?.(obj.userData['cuboidId']); return; }
      }
      onSelectCuboid?.(null);
      panRef.current = { active: true, view: vp, lastX: e.clientX, lastY: e.clientY };
    }
  }, [onSelectCuboid]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      const applyPan = (cam: THREE.OrthographicCamera, vpW: number, vpH: number) => {
        const worldDx = -(dx / vpW) * (cam.right - cam.left);
        const worldDy = -(dy / vpH) * (cam.top - cam.bottom);
        cam.position.x -= worldDx;
        cam.position.z -= worldDy;
        cam.lookAt(cam.position.x, 0, cam.position.z + 0.001);
        cam.updateProjectionMatrix();
      };
      const mount = mountRef.current!;
      const w = mount.clientWidth, h = mount.clientHeight;
      const svh = layoutRef.current.subViewHeight;
      const subW = Math.floor(w / 3);
      if (panRef.current.view === 'top'   && topCamRef.current)   applyPan(topCamRef.current,   subW, svh);
      if (panRef.current.view === 'side'  && sideCamRef.current)  applyPan(sideCamRef.current,  subW, svh);
      if (panRef.current.view === 'front' && frontCamRef.current) applyPan(frontCamRef.current, subW, svh);
      return;
    }
    if (drawRef.current.active && toolRef.current.currentTool === 'cuboid') {
      const camMap = { top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current, perspective: topCamRef.current };
      const cam = camMap[drawRef.current.view as keyof typeof camMap];
      if (!cam) return;
      const world = worldFromOrtho(canvasNDC(e.clientX, e.clientY, drawRef.current.view), cam as THREE.OrthographicCamera);
      const scene = sceneRef.current;
      if (!scene) return;
      if (drawRef.current.previewMesh) { scene.remove(drawRef.current.previewMesh); drawRef.current.previewMesh = null; }
      const s = drawRef.current.startWorld;
      const { selectedLabel: lbl, selectedLabelColor: lc } = toolRef.current;
      const preview: Cuboid3D = {
        id: '__preview__', label: lbl || 'object', color: lc,
        center: { x: (s.x + world.x) / 2, y: 0, z: (s.z + world.z) / 2 },
        dimensions: { w: Math.abs(world.x - s.x) || 0.1, h: 2.0, d: Math.abs(world.z - s.z) || 0.1 },
        rotation: 0,
      };
      const mesh = makeCuboidLines(preview, true);
      scene.add(mesh);
      drawRef.current.previewMesh = mesh;
    }
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    panRef.current.active = false;

    // Click-to-select in perspective view (drag distance < 5px = click)
    if (perspClickRef.current) {
      const dx = e.clientX - perspClickRef.current.x;
      const dy = e.clientY - perspClickRef.current.y;
      perspClickRef.current = null;
      if (Math.sqrt(dx*dx + dy*dy) < 5 && perspCamRef.current && cuboidsGrpRef.current) {
        const ndc = canvasNDC(e.clientX, e.clientY, 'perspective');
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, perspCamRef.current);
        const hits = raycaster.intersectObjects(cuboidsGrpRef.current.children, true);
        if (hits.length) {
          let obj: THREE.Object3D | null = hits[0].object;
          while (obj && !obj.userData['cuboidId']) obj = obj.parent;
          if (obj) { onSelectCuboid?.(obj.userData['cuboidId']); return; }
        }
        onSelectCuboid?.(null);
        return;
      }
    }
    if (drawRef.current.active && toolRef.current.currentTool === 'cuboid') {
      const scene = sceneRef.current;
      if (scene && drawRef.current.previewMesh) { scene.remove(drawRef.current.previewMesh); drawRef.current.previewMesh = null; }
      const camMap = { top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current, perspective: topCamRef.current };
      const cam = camMap[drawRef.current.view as keyof typeof camMap];
      if (cam) {
        const world = worldFromOrtho(canvasNDC(e.clientX, e.clientY, drawRef.current.view), cam as THREE.OrthographicCamera);
        const s = drawRef.current.startWorld;
        const w = Math.abs(world.x - s.x), d = Math.abs(world.z - s.z);
        if (w > 0.3 && d > 0.3) {
          const { selectedLabel: lbl, selectedLabelColor: lc } = toolRef.current;
          onAddCuboid?.({ id: uid(), label: lbl || 'object', color: lc, center: { x: (s.x+world.x)/2, y: 0, z: (s.z+world.z)/2 }, dimensions: { w, h: 2.0, d }, rotation: 0 });
        }
      }
    }
    drawRef.current.active = false;
  }, [onAddCuboid]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const vp = whichViewport(e.clientX, e.clientY);
    if (vp === 'perspective') return;
    const camMap: Partial<Record<ViewKey, THREE.OrthographicCamera | null>> = {
      top: topCamRef.current, side: sideCamRef.current, front: frontCamRef.current,
    };
    const cam = camMap[vp];
    if (!cam) return;
    (cam as any)._orthoSize = Math.max(1, ((cam as any)._orthoSize ?? 25) * (e.deltaY < 0 ? 0.85 : 1.18));
  }, []);

  const subViews: ViewKey[] = ['top', 'side', 'front'];

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, background: '#1a1a1a', overflow: 'hidden' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
    >
      {!expandedView && (
        <div style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none', zIndex: 10 }}>
          <span style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Perspective</span>
        </div>
      )}
      {!expandedView && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: subViewHeight, display: 'flex', borderTop: '1px solid #333', pointerEvents: 'none', zIndex: 10 }}>
          {subViews.map((view, i) => (
            <div key={view} style={{ flex: 1, position: 'relative', borderRight: i < 2 ? '1px solid #333' : undefined }}>
              <div style={{ position: 'absolute', top: 6, left: 8 }}>
                <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{VIEW_LABELS[view]}</span>
              </div>
              <div style={{ position: 'absolute', top: 6, right: 6, pointerEvents: 'auto' }}>
                <button
                  onClick={() => onExpandView?.(view as 'top' | 'side' | 'front')}
                  style={{ width: 22, height: 22, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>⤢</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {expandedView && (
        <>
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
            <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{VIEW_LABELS[expandedView]}</span>
          </div>
          <button onClick={() => onExpandView?.(null)}
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            ✕ Collapse
          </button>
        </>
      )}
      {currentTool === 'cuboid' && (
        <div style={{ position: 'absolute', inset: 0, cursor: 'crosshair', pointerEvents: 'none', zIndex: 5 }} />
      )}
    </div>
  );
}
