// ─────────────────────────────────────────────────────────────
//  PARAMETRA · 3D explorer (Three.js)
//  Builds a full house model from a design: plinth, slabs, walls with
//  real openings, glazing, doors, U-stair, roofs by style, furniture,
//  landscape. Supports exterior orbit, dollhouse section cut with poché,
//  first-person walkthrough, sun study and GLB export.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { tex } from './textures.js';
import { furnitureMaterials, buildFurniture } from './models3d.js';
import { grassMaterial, scatterGrass, Foliage, plantTree, plantShrub, hedge, buildBoundary, rock, boxUV, GARDEN_SPECIES, STREET_SPECIES, SHRUB_KIND } from './landscape.js';
import { CORR, STAIR_W, T_EXT, T_INT, SLAB, rectUnion, outerEdges, compass } from './engine.js';
import { WET } from './data.js';
import { furnitureTag, exportIFC as writeIFC } from './ifc.js';

// Readable material names for BIM export (texture kind -> finish)
const FINISH = { boardform: 'board-formed concrete', panel: 'large-format panels', battens: 'timber battens', wideoak: 'wide-plank oak', porcelain: 'large-format porcelain', render: 'render', stucco: 'stucco', boards: 'timber cladding', siding: 'lap siding', brick: 'brick', stone: 'stone', seam: 'standing-seam metal', clay: 'clay tiles', shingle: 'shingles', membrane: 'membrane', oak: 'oak boards', teak: 'teak boards', tile: 'tiles', terracotta: 'terracotta tiles', concrete: 'concrete' };
const finish = (k) => FINISH[k] || k;
const ROOF_TYPE = { flat: 'FLAT_ROOF', float: 'FLAT_ROOF', gable: 'GABLE_ROOF', hip: 'HIP_ROOF', shed: 'SHED_ROOF' };

export const PLINTH = 0.15;
const DEG = Math.PI / 180;
const BACK_ROT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
const AZ = { N: 0, E: 90, S: 180, W: 270 };

const ACCENT = {
  // dark panel volume floats over a board-formed concrete base
  contemporary: (r, lvl, n) => (n > 1 ? lvl >= 1 : ['foyer', 'garage'].includes(r?.type)),
  modern: (r) => ['foyer', 'stair'].includes(r?.type),
  scandi: (r) => ['foyer', 'garage'].includes(r?.type),
  japandi: (r, lvl, n) => (n > 1 ? lvl === 0 : ['foyer', 'garage'].includes(r?.type)),
  mediterranean: (r) => r?.type === 'garage',
  industrial: (r, lvl, n) => n > 1 && lvl >= 1,
  farmhouse: (r) => ['garage', 'foyer'].includes(r?.type),
  tropical: (r) => ['foyer', 'stair', 'garage'].includes(r?.type),
};

function meterUV(geo, sx, sy, sz, ox = 0, oy = 0, oz = 0) {
  const uv = geo.attributes.uv;
  const dims = [[sz, sy, oz, oy], [sz, sy, oz, oy], [sx, sz, ox, oz], [sx, sz, ox, oz], [sx, sy, ox, oy], [sx, sy, ox, oy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] + dims[f][2], uv.getY(k) * dims[f][1] + dims[f][3]);
  }
  uv.needsUpdate = true;
}

/**
 * One solid wall: the elevation outline (x along the wall from x0 to x1, y = height) with door notches and
 * window holes, extruded through the thickness `depth` along +z. A single closed solid has no internal
 * faces, so no seams show where boxes used to abut around openings. UVs stay in metres (x, e0 + y).
 * Triangles are sorted into groups: 0 reveals/top/bottom, 1 caps at x0/x1, 2 lid at +z, 3 lid at -z.
 * `cuts`: [{ s, e, lo, hi }] sorted by s; lo = 0 opens to the floor, hi >= h opens to the top.
 */
function wallGeometry(x0, x1, h, e0, depth, cuts) {
  const full = (c) => c.lo === 0 && c.hi >= h - 0.005;
  const segs = [];
  let start = x0, inner = [];
  for (const c of cuts) {
    if (full(c)) { if (c.s - start > 0.005) segs.push([start, c.s, inner]); start = c.e; inner = []; } else inner.push(c);
  }
  if (x1 - start > 0.005) segs.push([start, x1, inner]);
  const V = (x, y) => new THREE.Vector2(x, e0 + y);
  const shapes = segs.map(([sx0, sx1, cs]) => {
    const pts = [V(sx0, 0)];
    for (const c of cs.filter((c) => c.lo === 0)) pts.push(V(c.s, 0), V(c.s, c.hi), V(c.e, c.hi), V(c.e, 0));
    pts.push(V(sx1, 0), V(sx1, h));
    for (const c of cs.filter((c) => c.lo > 0 && c.hi >= h - 0.005).reverse()) pts.push(V(c.e, h), V(c.e, c.lo), V(c.s, c.lo), V(c.s, h));
    pts.push(V(sx0, h));
    const shape = new THREE.Shape(pts);
    for (const c of cs.filter((c) => c.lo > 0 && c.hi < h - 0.005)) shape.holes.push(new THREE.Path([V(c.s, c.lo), V(c.e, c.lo), V(c.e, c.hi), V(c.s, c.hi)]));
    return shape;
  });
  const src = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  // regroup triangles by role
  const pos = src.attributes.position, nTri = pos.count / 3;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  const slot = new Uint8Array(nTri);
  for (let i = 0; i < nTri; i++) {
    A.fromBufferAttribute(pos, 3 * i); B.fromBufferAttribute(pos, 3 * i + 1); C.fromBufferAttribute(pos, 3 * i + 2);
    N.subVectors(C, B).cross(B.clone().sub(A)).normalize();
    const cx = (A.x + B.x + C.x) / 3;
    if (Math.abs(N.z) > 0.9) slot[i] = (A.z + B.z + C.z) / 3 > depth / 2 ? 2 : 3;
    else if (Math.abs(N.x) > 0.9 && (Math.abs(cx - x0) < 1e-4 || Math.abs(cx - x1) < 1e-4)) slot[i] = 1;
    else slot[i] = 0;
  }
  const out = new THREE.BufferGeometry();
  const order = [];
  for (let g = 0; g < 4; g++) { const first = order.length; for (let i = 0; i < nTri; i++) if (slot[i] === g) order.push(i); if (order.length > first) out.addGroup(first * 3, (order.length - first) * 3, g); }
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name]; if (!a) continue;
    const isz = a.itemSize, arr = new Float32Array(order.length * 3 * isz);
    order.forEach((t, j) => arr.set(a.array.subarray(t * 3 * isz, (t + 1) * 3 * isz), j * 3 * isz));
    out.setAttribute(name, new THREE.BufferAttribute(arr, isz));
  }
  src.dispose();
  return out;
}

function rng(seed) { let s = seed >>> 0 || 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class Viewer3D {
  constructor(el, { onHover, onSelect, onModeChange, onCompass } = {}) {
    this.el = el;
    this.cb = { onHover, onSelect, onModeChange, onCompass };
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    el.appendChild(r.domElement);
    r.domElement.classList.add('gl');

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
    this.camera.position.set(25, 18, 30);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.495, minDistance: 2.5, maxDistance: 180, screenSpacePanning: true });
    this.walk = new PointerLockControls(this.camera, r.domElement);
    this.walk.addEventListener('unlock', () => { if (this.mode === 'walk') this.setMode(this.prevMode || 'exterior'); });

    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;

    this.hemi = new THREE.HemisphereLight('#dfe8f2', '#8a8370', 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3df', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    this.sky = this.makeSky();
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#dfe6ea', 120, 520);

    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.hl = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#c99a3e', transparent: true, opacity: 0.32, depthWrite: false }));
    this.hl.visible = false; this.hl.renderOrder = 5;
    this.sel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: '#b8862e', transparent: true, opacity: 0.5, depthWrite: false }));
    this.sel.visible = false; this.sel.renderOrder = 6;
    this.scene.add(this.hl, this.sel);

    this.mode = 'exterior';
    this.level = 'all';
    this.toggles = { roof: true, furniture: true, labels: true, site: true };
    this.sunHour = 15;
    this.keys = {};
    this.clock = new THREE.Clock();
    this.dirty = true;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickables = [];

    this.bindEvents();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.loop();
  }

  makeSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#9fc0dc') }, horizon: { value: new THREE.Color('#eef0ea') }, bottom: { value: new THREE.Color('#d9d3c4') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.4)); gl_FragColor = vec4(c, 1.0); }',
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
    m.frustumCulled = false;
    return m;
  }

  // ── events ────────────────────────────────────────────────
  bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', (e) => {
      if (this.mode === 'walk') return;
      const rc = dom.getBoundingClientRect();
      this.pointer.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      this.pickPending = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    });
    dom.addEventListener('pointerleave', () => { this.hl.visible = false; this.cb.onHover?.(null); this.dirty = true; });
    let down = null;
    dom.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    dom.addEventListener('pointerup', (e) => {
      if (this.mode === 'walk') { if (!this.walk.isLocked) { this.requestLock(); } return; }
      if (!down) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const hit = this.pick();
      this.cb.onSelect?.(hit ? hit.room : null);
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'walk') return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'PageUp') this.walkLevel(+1);
      if (e.code === 'KeyQ' || e.code === 'PageDown') this.walkLevel(-1);
    });
    window.addEventListener('keyup', (e) => (this.keys[e.code] = false));
  }

  /** Move the single WebGL canvas to another container (landing hero <-> studio). */
  mount(el) {
    if (!el || this.el === el) return;
    this.el = el;
    el.appendChild(this.renderer.domElement);
    el.appendChild(this.labels.domElement);
    this.ro.disconnect(); this.ro.observe(el);
    this.resize();
  }

  /** Showcase mode: slow turntable, no zoom/pan so page scrolling is never captured. */
  setShowcase(on) {
    this.showcase = on;
    this.autoRotate = on;
    this.controls.enableZoom = !on;
    this.controls.enablePan = !on;
    this.renderer.domElement.style.touchAction = on ? 'pan-y' : 'none';
    this.dirty = true;
  }

  pick() {
    if (!this.pickables.length || !this.pickEnabled) return null;
    this.ray.setFromCamera(this.pointer, this.camera);
    const vis = this.pickables.filter((m) => m.parent?.visible && m.parent.parent?.visible !== false);
    const hits = this.ray.intersectObjects(vis, false);
    return hits.length ? hits[0].object.userData : null;
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ── design build ──────────────────────────────────────────
  setDesign(d) {
    const first = !this.design;
    const sameSite = this.design && this.design.brief.plotW === d.brief.plotW && this.design.brief.plotD === d.brief.plotD;
    this.design = d;
    this.clear();
    this.cx = d.W / 2; this.cy = d.D / 2;
    this.H = d.H; this.F = d.nFloors;
    this.mats = this.makeMaterials(d);
    this.FM = furnitureMaterials({ ...d.style, key: d.styleKey });
    this.applyClip(this.FM);
    this.floorGroups = [];
    this.wallBoxes = [];
    this.pickables = [];
    this.labelObjs = [];
    for (let k = 0; k < this.F; k++) {
      const g = new THREE.Group(); g.name = `Level ${k}`;
      g.userData.level = k;
      this.world.add(g); this.floorGroups.push(g);
      this.wallBoxes.push([]);
    }
    this.furnGroups = this.floorGroups.map((fg) => { const g = new THREE.Group(); g.name = 'Furniture'; fg.add(g); return g; });
    this.roofGroup = new THREE.Group(); this.roofGroup.name = 'Roof'; this.world.add(this.roofGroup);
    this.siteGroup = new THREE.Group(); this.siteGroup.name = 'Site'; this.world.add(this.siteGroup);
    // IFC: the roof belongs to the top storey, landscape to the site
    this.roofGroup.userData.level = this.F - 1;
    this.siteGroup.userData.site = true;
    this.roofTag = { cls: 'IfcRoof', type: ROOF_TYPE[d.style.roof] || 'NOTDEFINED', name: 'Roof' };
    this.wallTags = d.floors.map(() => new Map());

    this.buildSlabs(d);
    d.floors.forEach((f, k) => {
      this.buildFloorFinishes(f, k);
      this.buildWalls(f, k);
      this.buildOpenings(f, k);
      this.buildRailings(f, k);
      this.buildFurniture(f, k);
      this.buildLabels(f, k);
    });
    this.buildStairs(d);
    this.buildRoof(d);
    this.buildSite(d);
    this.fitShadows(d);
    this.setSunTime(this.sunHour);
    this.applyVisibility();
    if (first || !sameSite) this.preset('front', !first);
    else { this.controls.target.set(0, this.F * this.H * 0.4, 0); }
    this.dirty = true;
  }

  clear() {
    for (const M of [this.mats, this.FM]) {
      if (!M) continue;
      for (const v of Object.values(M)) {
        if (v?.isMaterial) v.dispose();
        else if (Array.isArray(v)) v.forEach((m) => m?.isMaterial && m.dispose());
        else if (v && typeof v === 'object') Object.values(v).forEach((m) => m?.isMaterial && m.dispose());
      }
    }
    this.world.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.userData.ifcGeometry) o.userData.ifcGeometry.dispose();
      if (o.isCSS2DObject) o.element.remove();
    });
    this.world.clear();
    this.hl.visible = this.sel.visible = false;
  }

  makeMaterials(d) {
    const st = d.style, key = d.styleKey;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    const M = {
      ext: std({ map: tex(st.ext.tex, st.ext.color), roughness: 0.9 }),
      accent: std({ map: tex(st.accent.tex, st.accent.color), roughness: 0.85 }),
      int: std({ color: st.wallInt, roughness: 0.95 }),
      wetWall: std({ map: tex('walltile', '#ecebe7'), roughness: 0.35 }),
      floor: std({ map: tex(st.floor.tex, st.floor.color), roughness: 0.55 }),
      wetFloor: std({ map: tex(st.wetFloor.tex, st.wetFloor.color), roughness: 0.4 }),
      garageFloor: std({ map: tex('concrete', '#a7a49e'), roughness: 0.85 }),
      deck: std({ map: tex('deck', '#9a7553'), roughness: 0.8 }),
      paving: std({ map: tex('paving', '#c9c4b9'), roughness: 0.9 }),
      plinth: std({ map: tex('concrete', '#8f8c86'), roughness: 0.9 }),
      ceiling: std({ color: '#f4f2ee', roughness: 1 }),
      roofTop: std({ map: tex('gravel', '#a29e96'), roughness: 1 }),
      roof: std({ map: tex(st.roofMat.tex, st.roofMat.color), roughness: st.roofMat.tex === 'seam' ? 0.45 : 0.8, metalness: st.roofMat.tex === 'seam' ? 0.45 : 0 }),
      frame: std({ color: st.frame, roughness: 0.4, metalness: 0.35 }),
      glass: new THREE.MeshStandardMaterial({ color: st.glass || '#a9c3cb', roughness: 0.03, metalness: 0.15, transparent: true, opacity: 0.3, depthWrite: false, envMapIntensity: 1.6 }),
      door: std({ color: st.door, roughness: 0.55 }),
      intDoor: std({ color: ['farmhouse', 'mediterranean', 'japandi'].includes(key) ? st.wood : '#f2f0eb', roughness: 0.6 }),
      garageDoor: st.garageTex ? std({ map: tex(st.garageTex.tex, st.garageTex.color), roughness: 0.7 })
        : std({ map: tex('garagedoor', ['modern', 'industrial', 'japandi', 'scandi'].includes(key) ? '#3c3e41' : '#ece8df'), roughness: 0.5, metalness: 0.2 }),
      rail: new THREE.MeshStandardMaterial({ color: '#c6dbe1', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
      stair: std({ map: tex(st.floor.tex, st.floor.color), roughness: 0.55 }),
      water: new THREE.MeshStandardMaterial({ color: '#4fa6c4', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.86 }),
      poolTile: std({ color: '#9fd4e2', roughness: 0.3, side: THREE.BackSide }),
      timber: std({ map: tex('boards', st.wood), roughness: 0.75 }),
      shadowGap: std({ color: '#1d1e20', roughness: 0.95 }),
    };
    // style-specific details (contemporary: timber soffit, bronze window frames, battened pivot door)
    if (st.soffit) M.soffit = std({ map: tex(st.soffit.tex, st.soffit.color), roughness: 0.8 });
    if (st.windowBox) M.windowBox = std({ color: st.windowBox, roughness: 0.35, metalness: 0.55 });
    if (st.pivot) M.pivotDoor = std({ map: tex('battens', st.door), roughness: 0.7 });
    if (st.frosted) M.frosted = new THREE.MeshStandardMaterial({ color: '#E4E9EA', roughness: 0.6, transparent: true, opacity: 0.82 });
    const names = {
      ext: `Facade - ${finish(st.ext.tex)}`, accent: `Facade accent - ${finish(st.accent.tex)}`, int: 'Interior wall paint', wetWall: 'Wall tiles',
      floor: `Flooring - ${finish(st.floor.tex)}`, wetFloor: `Wet area flooring - ${finish(st.wetFloor.tex)}`, garageFloor: 'Garage floor - concrete',
      deck: 'Timber decking', paving: 'Paving', plinth: 'Plinth - concrete', ceiling: 'Ceiling paint', roofTop: 'Roof gravel',
      roof: `Roofing - ${finish(st.roofMat.tex)}`, frame: 'Window and door frames', glass: 'Glazing', door: 'Entrance door', intDoor: 'Interior doors',
      garageDoor: 'Garage door', rail: 'Glass balustrade', stair: `Stair treads - ${finish(st.floor.tex)}`, water: 'Pool water', poolTile: 'Pool tiles', timber: 'Timber',
      shadowGap: 'Shadow-gap reveal', soffit: 'Soffit - timber battens', windowBox: 'Window surrounds - bronze', pivotDoor: 'Pivot door - timber battens', frosted: 'Frosted glazing',
    };
    for (const [k, v] of Object.entries(names)) if (M[k]) M[k].name = v;
    // poché for clipped solids: back faces render as a dark fill
    M.roof.side = THREE.DoubleSide;
    for (const k of ['ext', 'accent', 'int', 'wetWall', 'ceiling', 'plinth', 'roofTop']) {
      const m = M[k];
      m.side = THREE.DoubleSide;
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n if (!gl_FrontFacing) { gl_FragColor = vec4(0.17, 0.16, 0.15, 1.0); return; }');
      };
      m.customProgramCacheKey = () => 'poche';
    }
    this.applyClip(M);
    return M;
  }
  applyClip(M) {
    for (const v of Object.values(M)) {
      if (v && v.isMaterial) v.clippingPlanes = [this.clipPlane];
      else if (Array.isArray(v)) v.forEach((m) => m.isMaterial && (m.clippingPlanes = [this.clipPlane]));
    }
  }

  elev(k) { return PLINTH + k * this.H; }
  wx(x) { return x - this.cx; }
  wz(y) { return this.cy - y; }

  box(grp, w, h, d, mat, x, y, z, { cast = true, receive = true, uv = true, ox = 0, oy = 0, oz = 0 } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (uv) meterUV(geo, w, h, d, ox, oy, oz);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = receive;
    grp.add(m);
    return m;
  }

  // slabs: plinth, intermediate floors (with stair void), roof slab
  buildSlabs(d) {
    const enc = (k) => (d.floors[k] ? d.floors[k].rooms : []);
    const terr = (k) => (d.floors[k] ? d.floors[k].terraces : []);
    const M = this.mats;
    for (let k = 0; k <= this.F; k++) {
      let rects;
      if (k === 0) rects = rectUnion(enc(0));
      else rects = rectUnion([...enc(k), ...terr(k), ...enc(k - 1)]);
      if (k >= 1 && k <= this.F - 1) {
        const st = enc(k - 1).find((r) => r.type === 'stair');
        if (st) rects = subtractRect(rects, st);
      }
      const top = k === 0 ? PLINTH : this.elev(k);
      const th = k === 0 ? PLINTH : SLAB;
      const grp = k === 0 ? this.floorGroups[0] : k < this.F ? this.floorGroups[k] : this.floorGroups[this.F - 1];
      const flat = ['flat', 'float'].includes(d.style.roof);
      const area = rects.reduce((a, r) => a + r.w * r.h, 0);
      const tag = k === 0 ? { cls: 'IfcSlab', type: 'BASESLAB', name: 'Ground slab' }
        : k < this.F ? { cls: 'IfcSlab', type: 'FLOOR', name: `Floor slab - Level ${k}` }
        : flat ? { cls: 'IfcSlab', type: 'ROOF', name: 'Roof slab', part: this.roofTag } : { cls: 'IfcSlab', type: 'FLOOR', name: 'Attic floor slab' };
      tag.pset = { Pset_SlabCommon: { IsExternal: k === this.F && flat, LoadBearing: true } };
      tag.qto = { Qto_SlabBaseQuantities: { Width: [th, 'len'], GrossArea: [area, 'area'], GrossVolume: [area * th, 'vol'] } };
      for (const r of rects) {
        const mats = k === 0 ? M.plinth : [M.int, M.int, M.roofTop, M.ceiling, M.int, M.int];
        this.box(grp, r.w, th - 0.004, r.h, mats, this.wx(r.x + r.w / 2), top - th / 2 - 0.002, this.wz(r.y + r.h / 2), { ox: r.x, oz: r.y }).userData.ifc = tag;
      }
    }
  }

  buildFloorFinishes(f, k) {
    const M = this.mats, e0 = this.elev(k);
    for (const r of [...f.rooms, ...f.terraces]) {
      if (r.type === 'stair' && k > 0) continue;
      const mat = r.type === 'terrace' ? M.deck : r.type === 'garage' ? M.garageFloor : WET.has(r.type) || (r.type === 'kitchen' && d_styleTile(this.design)) ? M.wetFloor : M.floor;
      const m = this.box(this.floorGroups[k], r.w, 0.02, r.h, mat, this.wx(r.x + r.w / 2), e0 + 0.01, this.wz(r.y + r.h / 2), { cast: false, ox: r.x, oz: r.y });
      const ifc = { cls: 'IfcCovering', type: 'FLOORING', name: r.type === 'terrace' ? 'Terrace decking' : `${r.label} - floor finish`, space: r.id, qto: { Qto_CoveringBaseQuantities: { Width: [0.02, 'len'], NetArea: [r.w * r.h, 'area'] } } };
      m.userData = { room: r, level: k, ifc };
      this.pickables.push(m);
    }
    for (const bc of f.balconies) {
      const bm = this.box(this.floorGroups[k], bc.w, 0.22, bc.h, [M.int, M.int, M.deck, M.ceiling, M.int, M.int], this.wx(bc.x + bc.w / 2), e0 - 0.09, this.wz(bc.y + bc.h / 2), { ox: bc.x, oz: bc.y });
      bm.userData.ifc = { cls: 'IfcSlab', type: 'FLOOR', name: 'Balcony slab', pset: { Pset_SlabCommon: { IsExternal: true } } };
    }
  }

  faceMat(roomId, otherId, f, k) {
    const M = this.mats;
    if (!roomId) {
      const other = f.rooms.find((r) => r.id === otherId);
      return (ACCENT[this.design.styleKey] || (() => false))(other, k, this.F) ? M.accent : M.ext;
    }
    const r = f.rooms.find((q) => q.id === roomId);
    return r && WET.has(r.type) && r.type !== 'laundry' ? M.wetWall : M.int;
  }

  buildWalls(f, k) {
    const e0 = this.elev(k);
    const grp = this.floorGroups[k];
    for (const w of f.walls) {
      if (w.type === 'open') continue;
      const ext = w.type === 'ext';
      const t = ext ? T_EXT : T_INT;
      const h = ext ? this.H : this.design.ceiling;
      const matA = this.faceMat(w.a, w.b, f, k), matB = this.faceMat(w.b, w.a, f, k);
      const plain = this.mats.int;
      const tag = {
        cls: 'IfcWall', type: ext ? 'STANDARD' : 'PARTITIONING', name: ext ? 'Exterior wall' : 'Interior wall',
        pset: { Pset_WallCommon: { IsExternal: ext, LoadBearing: ext } },
        qto: { Qto_WallBaseQuantities: { Length: [w.e - w.s + (ext ? t : 0), 'len'], Height: [h, 'len'], Width: [t, 'len'] } },
      };
      this.wallTags[k].set(w, tag);
      const ops = f.openings.filter((o) => o.axis === w.axis && Math.abs(o.c - w.c) < 1e-3 && o.s < w.e - 1e-3 && o.e > w.s + 1e-3).sort((p, q) => p.s - q.s);
      // Ends overlap the neighbouring wall by half a thickness to close corners and joins. The wall is a hair
      // thinner and shorter (eps) so its end caps sit inside the neighbour rather than flush with its face.
      const eps = 0.004, tt = t - eps;
      const x0 = w.s - t / 2 + eps, x1 = w.e + t / 2 - eps;
      // End caps wear the facade finish (at corners they are the visible return); reveals keep the plain finish.
      const outMat = ext ? (!w.a ? matA : matB) : plain;
      const cuts = ops.map((o) => ({ s: Math.max(o.s, w.s), e: Math.min(o.e, w.e), lo: o.sill > 0.005 ? o.sill : 0, hi: Math.min(o.head, h) }))
        .filter((c) => c.e - c.s > 0.005 && c.hi - c.lo > 0.005);
      const geo = wallGeometry(x0, x1, h, e0, tt, cuts);
      // material slots: 0 reveals/top/bottom, 1 wall-end caps, 2 lid at +z, 3 lid at -z ('h': +z is side a; 'v' turns +z to +x, side b)
      const m = new THREE.Mesh(geo, [plain, outMat, w.axis === 'h' ? matA : matB, w.axis === 'h' ? matB : matA]);
      m.userData.ifc = tag;
      if (w.axis === 'h') m.position.set(-this.cx, 0, this.wz(w.c) - tt / 2);
      else { m.rotation.y = Math.PI / 2; m.position.set(this.wx(w.c) - tt / 2, 0, this.cy); }
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
      // walk-mode collision boxes: the solid parts that reach the floor
      const pieces = [];
      let cur = x0;
      for (const c of cuts) { if (c.s - cur > 0.005) pieces.push([cur, c.s, 0]); if (c.lo > 0) pieces.push([c.s, c.e, 0]); cur = c.e; }
      if (x1 - cur > 0.005) pieces.push([cur, x1, 0]);
      for (const [a0, a1, y0] of pieces) {
        if (y0 < 0.01) {
          const bx = w.axis === 'h'
            ? { minX: this.wx(a0), maxX: this.wx(a1), minZ: this.wz(w.c) - t / 2, maxZ: this.wz(w.c) + t / 2 }
            : { minX: this.wx(w.c) - t / 2, maxX: this.wx(w.c) + t / 2, minZ: this.wz(a1), maxZ: this.wz(a0) };
          this.wallBoxes[k].push(bx);
        }
      }
    }
  }

  buildOpenings(f, k) {
    const M = this.mats, st = this.design.style, key = this.design.styleKey;
    const e0 = this.elev(k);
    for (const o of f.openings) {
      const ext = !o.a || !o.b;
      const t = ext ? T_EXT : T_INT;
      const len = o.e - o.s, mid = (o.s + o.e) / 2;
      const g = new THREE.Group();
      if (o.axis === 'h') { g.position.set(this.wx(mid), e0, this.wz(o.c)); }
      else { g.position.set(this.wx(o.c), e0, this.wz(mid)); g.rotation.y = Math.PI / 2; }
      // local +z points to side a for 'h', side b for 'v'
      const sideSign = (s) => (o.axis === 'h' ? (s === 'a' ? 1 : -1) : (s === 'a' ? -1 : 1));
      const outS = ext ? sideSign(!o.a ? 'a' : 'b') : 0;
      const B = (w, h, d, m, x, y, z, cast = true) => { const mm = this.box(g, w, h, d, m, x, y + h / 2, z, { uv: false }); mm.castShadow = cast; return mm; };
      const slim = !!st.slimFrames;
      const fr = slim ? 0.03 : 0.055;
      // IFC: host wall + the void this opening cuts in it (storey-local plan coords)
      const host = f.walls.find((w) => w.type !== 'open' && w.axis === o.axis && Math.abs(w.c - o.c) < 1e-3 && o.s < w.e - 1e-3 && o.e > w.s + 1e-3);
      const ht = host ? (host.type === 'ext' ? T_EXT : T_INT) : t;
      const vs = host ? Math.max(o.s, host.s) : o.s, ve = host ? Math.min(o.e, host.e) : o.e;
      const across = [o.c - ht / 2 - 0.05, o.c + ht / 2 + 0.05];
      const opening = o.axis === 'h'
        ? { x0: vs, x1: ve, y0: across[0], y1: across[1], z0: o.sill > 0.005 ? o.sill : 0, z1: o.head }
        : { x0: across[0], x1: across[1], y0: vs, y1: ve, z0: o.sill > 0.005 ? o.sill : 0, z1: o.head };
      const tag = { host: host && this.wallTags[k].get(host), opening };
      g.userData.ifc = tag;
      const door = (name, op, type = 'DOOR') => Object.assign(tag, { cls: 'IfcDoor', type, name, attrs: { h: o.head, w: len, op }, pset: { Pset_DoorCommon: { IsExternal: ext } } });
      if (o.kind === 'window') {
        const h = o.head - o.sill;
        B(fr, h, t * 0.5, M.frame, -len / 2 + fr / 2, o.sill, 0);
        B(fr, h, t * 0.5, M.frame, len / 2 - fr / 2, o.sill, 0);
        B(len, fr, t * 0.5, M.frame, 0, o.head - fr, 0);
        B(len, fr, t * 0.5, M.frame, 0, o.sill, 0);
        const gi = slim ? 0.05 : 0.08;
        const gl = B(len - gi, h - gi, 0.02, M.glass, 0, o.sill + gi / 2, 0, false); gl.renderOrder = 2;
        const mull = st.mullions;
        const nV = mull === 'grid' ? Math.max(1, Math.round(len / 0.55)) - 1 : mull === 'grid-v' ? Math.max(1, Math.round(len / 0.45)) - 1 : mull === 'cross' ? 1
          : slim ? (len > 2.8 ? Math.round(len / 2.4) - 1 : 0) : len > 2.2 ? Math.round(len / 1.6) - 1 : 0;
        for (let i = 1; i <= nV; i++) B(slim ? 0.025 : 0.035, h - gi, 0.05, M.frame, -len / 2 + (len * i) / (nV + 1), o.sill + gi / 2, 0);
        const nH = mull === 'grid' ? Math.max(1, Math.round(h / 0.6)) - 1 : mull === 'cross' ? 1 : 0;
        for (let i = 1; i <= nH; i++) B(len - 0.08, 0.035, 0.05, M.frame, 0, o.sill + (h * i) / (nH + 1), 0);
        const part = !nV && !nH ? 'SINGLE_PANEL' : nV === 1 && !nH ? 'DOUBLE_PANEL_VERTICAL' : !nV && nH === 1 ? 'DOUBLE_PANEL_HORIZONTAL' : nV === 2 && !nH ? 'TRIPLE_PANEL_VERTICAL' : 'NOTDEFINED';
        Object.assign(tag, { cls: 'IfcWindow', type: 'WINDOW', name: ext ? 'Window' : 'Internal window', attrs: { h, w: len, part }, pset: { Pset_WindowCommon: { IsExternal: ext } } });
        if (ext) {
          if (o.sill > 0.3 && !slim) B(len + 0.08, 0.04, 0.16, M.frame, 0, o.sill - 0.04, outS * (t / 2 + 0.03));
          const roomType = f.rooms.find((r) => r.id === o.room)?.type;
          if (M.frosted && st.frosted.includes(roomType)) gl.material = M.frosted;
          const fins = st.fins && st.fins.includes(roomType);
          if (fins) {
            // vertical timber fins screening slot and bathroom windows
            const fTag = { cls: 'IfcShadingDevice', type: 'USERDEFINED', objectType: 'Fins', name: 'Timber fins' };
            const y0 = Math.max(0.02, o.sill - 0.15), fh = o.head + 0.15 - y0, n = Math.max(3, Math.round(len / 0.12));
            for (let i = 0; i <= n; i++) B(0.04, fh, 0.12, M.timber, -len / 2 + 0.03 + ((len - 0.06) * i) / n, y0, outS * (t / 2 + 0.13)).userData.ifc = fTag;
          } else if (M.windowBox && o.sill > 0.3 && len >= 0.6 && h < 1.8) {
            // projecting bronze picture frame around ribbon and strip windows
            const bt = 0.07, dp = 0.34, z = outS * (t / 2 + dp / 2 - 0.03);
            B(len + 2 * bt, bt, dp, M.windowBox, 0, o.head, z);
            B(len + 2 * bt, bt, dp, M.windowBox, 0, o.sill - bt, z);
            B(bt, h, dp, M.windowBox, -len / 2 - bt / 2, o.sill, z);
            B(bt, h, dp, M.windowBox, len / 2 + bt / 2, o.sill, z);
          }
          if (st.shutters && o.sill > 0.3 && len < 1.9) {
            const shTag = { cls: 'IfcShadingDevice', type: 'SHUTTER', name: 'Window shutters' };
            for (const sx of [-1, 1]) {
              const sh = B(len / 2, h, 0.035, M.door, sx * (len * 0.75 + 0.06), o.sill, outS * (t / 2 + 0.03));
              sh.material = M.frame;
              sh.userData.ifc = shTag;
            }
          }
          if (st.louvres && k >= 1 && len <= 3.2) {
            const lvTag = { cls: 'IfcShadingDevice', type: 'USERDEFINED', objectType: 'Louvres', name: 'Timber louvres' };
            const n = Math.floor(len / 0.2);
            for (let i = 0; i <= n; i++) B(0.04, h + 0.25, 0.16, M.timber, -len / 2 + (len * i) / n, o.sill - 0.1, outS * (t / 2 + 0.16)).userData.ifc = lvTag;
          }
        }
      } else if (o.kind === 'door' || o.kind === 'double') {
        if (o.kind === 'double') door('Double door', 'DOUBLE_DOOR_SINGLE_SWING');
        else door(ext ? 'External door' : 'Internal door', o.hinge === 'e' ? 'SINGLE_SWING_RIGHT' : 'SINGLE_SWING_LEFT');
        const h = o.head;
        B(0.04, h, t + 0.03, M.intDoor, -len / 2 - 0.02, 0, 0);
        B(0.04, h, t + 0.03, M.intDoor, len / 2 + 0.02, 0, 0);
        B(len + 0.08, 0.05, t + 0.03, M.intDoor, 0, h, 0);
        const into = o.into && o.into === o.a ? 'a' : 'b';
        const sg = ext ? -outS : sideSign(into);
        const leaves = o.kind === 'double' ? [['s', len / 2], ['e', len / 2]] : [[o.hinge || 's', len]];
        const theta = o.kind === 'double' ? 80 * DEG : 72 * DEG;
        for (const [hs, lw] of leaves) {
          const d = hs === 's' ? 1 : -1;
          const piv = new THREE.Group();
          piv.position.set(hs === 's' ? -len / 2 : len / 2, 0, 0);
          piv.rotation.y = -d * sg * theta;
          const leaf = this.box(piv, lw - 0.02, h - 0.02, 0.04, ext ? M.door : M.intDoor, (d * lw) / 2, (h - 0.02) / 2, 0, { uv: false });
          leaf.castShadow = true;
          const hd = this.box(piv, 0.12, 0.02, 0.06, M.frame, d * (lw - 0.12), 1.0, 0, { uv: false }); hd.castShadow = false;
          g.add(piv);
        }
      } else if (o.kind === 'front') {
        door(M.pivotDoor ? 'Pivot entrance door' : 'Entrance door', 'SINGLE_SWING_LEFT');
        const h = o.head;
        B(0.07, h, t + 0.02, M.frame, -len / 2 - 0.03, 0, 0); B(0.07, h, t + 0.02, M.frame, len / 2 + 0.03, 0, 0); B(len + 0.14, 0.07, t + 0.02, M.frame, 0, h, 0);
        const leaf = B(len - 0.02, h - 0.02, 0.06, M.door, 0, 0, 0);
        if (M.pivotDoor) {
          // timber-battened pivot leaf with a long bar pull
          leaf.material = M.pivotDoor; meterUV(leaf.geometry, len - 0.02, h - 0.02, 0.06);
          B(0.035, 1.5, 0.05, M.frame, len / 2 - 0.16, 0.45, outS * 0.06);
        } else B(0.03, 0.9, 0.05, M.metal || M.frame, len / 2 - 0.15, 0.6, outS * 0.06);
        // canopy & step
        B(len + 1.6, 0.14, 1.4, key === 'mediterranean' || key === 'farmhouse' ? M.timber : M.frame, 0, h + 0.28, outS * (t / 2 + 0.7)).userData.ifc = { cls: 'IfcBuildingElementProxy', type: 'USERDEFINED', objectType: 'Canopy', name: 'Entrance canopy' };
        B(len + 1.4, PLINTH - 0.01, 1.2, M.paving, 0, -PLINTH, outS * (t / 2 + 0.6)).userData.ifc = { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Step', name: 'Entrance step' };
      } else if (o.kind === 'slide') {
        door('Sliding door', 'SLIDING_TO_LEFT');
        const h = o.head;
        B(fr, h, t * 0.55, M.frame, -len / 2 + fr / 2, 0, 0); B(fr, h, t * 0.55, M.frame, len / 2 - fr / 2, 0, 0);
        B(len, fr, t * 0.55, M.frame, 0, h - fr, 0); B(len, 0.03, t * 0.55, M.frame, 0, 0, 0);
        const n = len > 3.2 ? 3 : 2, pw = (len - 2 * fr) / n + 0.04;
        for (let i = 0; i < n; i++) {
          const x = -len / 2 + fr + pw * (i + 0.5) - 0.02 * i + (i === n - 1 ? -pw * 0.45 : 0);
          const z = (i % 2 ? 1 : -1) * 0.035;
          const pg = B(pw - 0.05, h - fr - 0.05, 0.018, M.glass, x, 0.03, z, false); pg.renderOrder = 2;
          B(0.04, h - fr - 0.03, 0.045, M.frame, x - pw / 2 + 0.02, 0.03, z); B(0.04, h - fr - 0.03, 0.045, M.frame, x + pw / 2 - 0.02, 0.03, z);
        }
        if (ext && k === 0) B(len + 0.4, PLINTH - 0.01, 0.6, M.paving, 0, -PLINTH, outS * (t / 2 + 0.3)).userData.ifc = { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Step', name: 'Door step' };
      } else if (o.kind === 'garage') {
        door('Garage door', 'ROLLINGUP');
        B(0.08, o.head, t + 0.02, M.frame, -len / 2 - 0.04, 0, 0); B(0.08, o.head, t + 0.02, M.frame, len / 2 + 0.04, 0, 0); B(len + 0.16, 0.08, t + 0.02, M.frame, 0, o.head, 0);
        const gd = this.box(g, len, o.head, 0.06, M.garageDoor, 0, o.head / 2, -outS * 0.03, { uv: false });
        const uv = gd.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * o.head);
      }
      if (!tag.cls) Object.assign(tag, { cls: 'IfcBuildingElementProxy', type: 'USERDEFINED', objectType: o.kind, name: o.kind });
      this.floorGroups[k].add(g);
    }
  }

  buildRailings(f, k) {
    if (k === 0) return;
    const e0 = this.elev(k), M = this.mats;
    const outer = [...f.terraces, ...f.balconies];
    if (!outer.length) return;
    const edges = outerEdges(outer, f.rooms);
    for (const ed of edges) {
      const len = ed.e - ed.s, mid = (ed.s + ed.e) / 2;
      const g = new THREE.Group();
      g.userData.ifc = { cls: 'IfcRailing', type: 'GUARDRAIL', name: 'Glass balustrade', pset: { Pset_RailingCommon: { IsExternal: true } } };
      if (ed.axis === 'h') g.position.set(this.wx(mid), e0, this.wz(ed.c)); else { g.position.set(this.wx(ed.c), e0, this.wz(mid)); g.rotation.y = Math.PI / 2; }
      const gl = this.box(g, len, 1.0, 0.02, M.rail, 0, 0.55, 0, { uv: false, cast: false }); gl.renderOrder = 3;
      this.box(g, len + 0.04, 0.05, 0.06, M.frame, 0, 1.06, 0, { uv: false });
      this.box(g, len, 0.05, 0.08, M.frame, 0, 0.05, 0, { uv: false });
      this.floorGroups[k].add(g);
    }
  }

  buildFurniture(f, k) {
    if (!f.furniture) return;
    const e0 = this.elev(k);
    const env = { ceiling: this.design.ceiling };
    for (const [rid, items] of Object.entries(f.furniture)) {
      for (const it of items) {
        const g = buildFurniture(it, this.FM, env);
        if (!g) continue;
        g.position.set(this.wx(it.x + it.w / 2), e0 + 0.02, this.wz(it.y + it.h / 2));
        g.rotation.y = BACK_ROT[it.back] ?? 0;
        g.userData.room = rid;
        g.userData.ifc = furnitureTag(it, rid);
        this.furnGroups[k].add(g);
      }
    }
  }

  buildLabels(f, k) {
    const e0 = this.elev(k);
    for (const r of [...f.rooms, ...f.terraces]) {
      if (r.type === 'hall' || r.w * r.h < 2.5) continue;
      const el = document.createElement('div');
      el.className = 'room-label';
      el.innerHTML = `<b>${r.label}</b><span>${(r.w * r.h).toFixed(1)} m²</span>`;
      const o = new CSS2DObject(el);
      o.position.set(this.wx(r.x + r.w / 2), e0 + 0.15, this.wz(r.y + r.h / 2));
      o.userData.level = k;
      this.floorGroups[k].add(o);
      this.labelObjs.push(o);
    }
  }

  buildStairs(d) {
    const solid = ['mediterranean', 'farmhouse'].includes(d.styleKey);
    const M = this.mats;
    for (let k = 0; k < this.F; k++) {
      const st = d.floors[k].rooms.find((r) => r.type === 'stair');
      if (!st) continue;
      const g = this.floorGroups[k], e0 = this.elev(k);
      const top = k === this.F - 1;
      if (!top) {
        const H = this.H, n = Math.ceil(H / 0.18), rh = H / n, n1 = Math.ceil(n / 2), n2 = n - n1;
        const yStart = st.y + st.h - 0.05;
        const t = Math.min(0.27, (st.h - 0.05 - 0.12 - 1.0) / (n1 - 1));
        const yL = yStart - (n1 - 1) * t;
        const x1a = st.x + 0.08, x1b = st.x + 1.25, x2a = st.x + 1.35, x2b = st.x + st.w - 0.08;
        const stair = { cls: 'IfcStair', type: 'HALF_TURN_STAIR', name: 'Stair', pset: { Pset_StairCommon: { NumberOfRiser: n, NumberOfTreads: n - 2, RiserHeight: { t: 'IfcPositiveLengthMeasure', v: rh }, TreadLength: { t: 'IfcPositiveLengthMeasure', v: t } } } };
        const flight = (i, risers) => ({ cls: 'IfcStairFlight', type: 'STRAIGHT', name: `Stair flight ${i}`, part: stair, attrs: { risers, treads: risers - 1, riser: rh, tread: t } });
        const fl1 = flight(1, n1), fl2 = flight(2, n2);
        const step = (xa, xb, ya, yb, topY, tag) => {
          const w = xb - xa, dd = yb - ya;
          const m = solid ? this.box(g, w, topY, dd, M.stair, this.wx(xa + w / 2), e0 + topY / 2, this.wz(ya + dd / 2), { ox: xa, oz: ya })
            : this.box(g, w, 0.05, dd, M.stair, this.wx(xa + w / 2), e0 + topY - 0.025, this.wz(ya + dd / 2), { ox: xa, oz: ya });
          m.userData.ifc = tag;
        };
        for (let i = 0; i < n1 - 1; i++) step(x1a, x1b, yStart - (i + 1) * t, yStart - i * t, (i + 1) * rh, fl1);
        // landing
        const lw = x2b - x1a, ld = yL - (st.y + 0.12);
        this.box(g, lw, solid ? n1 * rh : 0.16, ld, M.stair, this.wx(x1a + lw / 2), e0 + (solid ? (n1 * rh) / 2 : n1 * rh - 0.08), this.wz(st.y + 0.12 + ld / 2), { ox: x1a, oz: st.y })
          .userData.ifc = { cls: 'IfcSlab', type: 'LANDING', name: 'Stair landing', part: stair };
        for (let j = 0; j < n2 - 1; j++) step(x2a, x2b, yL + j * t, yL + (j + 1) * t, (n1 + j + 1) * rh, fl2);
        // central spine wall doubles as balustrade above
        const sl = yStart - yL;
        this.box(g, 0.1, H + 0.95, sl, M.int, this.wx(st.x + 1.3), e0 + (H + 0.95) / 2, this.wz(yL + sl / 2))
          .userData.ifc = { cls: 'IfcWall', type: 'STANDARD', name: 'Stair spine wall', pset: { Pset_WallCommon: { IsExternal: false } } };
      } else {
        // top floor: guard rail along the spine edge above flight 1
        const gg = new THREE.Group();
        gg.userData.ifc = { cls: 'IfcRailing', type: 'GUARDRAIL', name: 'Stair guardrail' };
        gg.position.set(this.wx(st.x + 0.65), e0, this.wz(st.y + st.h));
        const gl = this.box(gg, 1.3, 1.0, 0.02, M.rail, 0, 0.55, 0, { uv: false, cast: false }); gl.renderOrder = 3;
        this.box(gg, 1.34, 0.05, 0.06, M.frame, 0, 1.06, 0, { uv: false });
        g.add(gg);
      }
    }
  }

  // ── roofs ─────────────────────────────────────────────────
  buildRoof(d) {
    const st = d.style, M = this.mats, grp = this.roofGroup;
    const topF = d.floors[this.F - 1];
    const rooms = topF.rooms;
    const eave = this.elev(this.F);
    const roofPlane = (name = 'Roof plane') => ({ cls: 'IfcSlab', type: 'ROOF', name, part: this.roofTag, pset: { Pset_SlabCommon: { IsExternal: true } } });
    const gableWall = { cls: 'IfcWall', type: 'STANDARD', name: 'Gable wall', pset: { Pset_WallCommon: { IsExternal: true } } };
    if (st.roof === 'float') {
      // thin roof plate on a recessed shadow gap, deep overhangs front and back, timber soffit
      const enc = rooms.filter((r) => r.type !== 'terrace');
      const gap = 0.14, th = 0.24, inset = 0.08;
      const gapTag = { cls: 'IfcCovering', type: 'USERDEFINED', objectType: 'Reveal', name: 'Shadow-gap reveal' };
      for (const r of rectUnion(enc)) {
        this.box(grp, r.w + T_EXT - 2 * inset, gap, r.h + T_EXT - 2 * inset, M.shadowGap, this.wx(r.x + r.w / 2), eave + gap / 2, this.wz(r.y + r.h / 2), { uv: false, cast: false })
          .userData.ifc = gapTag;
      }
      const bb = bbox(enc), ovF = st.overhang, ovS = Math.min(0.6, st.overhang);
      const W = bb.w + T_EXT + 2 * ovS, Dd = bb.h + T_EXT + 2 * ovF;
      const x0 = bb.x - T_EXT / 2 - ovS, y0 = bb.y - T_EXT / 2 - ovF;
      this.box(grp, W, th, Dd, [M.frame, M.frame, M.roof, M.soffit || M.ceiling, M.frame, M.frame], this.wx(x0 + W / 2), eave + gap + th / 2, this.wz(y0 + Dd / 2), { ox: x0, oz: y0 })
        .userData.ifc = roofPlane('Floating roof plate');
      return;
    }
    if (st.roof === 'flat') {
      // parapet on exterior wall lines
      for (const w of topF.walls.filter((x) => x.type === 'ext')) {
        const len = w.e - w.s + T_EXT;
        const mid = (w.s + w.e) / 2, h = 0.55;
        const extMat = this.faceMat(null, w.a || w.b, topF, this.F - 1);
        const m = w.axis === 'h' ? this.box(grp, len, h, T_EXT, extMat, this.wx(mid), eave + h / 2, this.wz(w.c), { ox: w.s, oy: eave })
          : this.box(grp, T_EXT, h, len, extMat, this.wx(w.c), eave + h / 2, this.wz(mid), { oz: w.s, oy: eave });
        m.userData.ifc = { cls: 'IfcWall', type: 'PARAPET', name: 'Parapet', pset: { Pset_WallCommon: { IsExternal: true } } };
      }
      // coping
      const coping = { cls: 'IfcCovering', type: 'USERDEFINED', objectType: 'Coping', name: 'Parapet coping' };
      for (const w of topF.walls.filter((x) => x.type === 'ext')) {
        const len = w.e - w.s + T_EXT + 0.04, mid = (w.s + w.e) / 2;
        const m = w.axis === 'h' ? this.box(grp, len, 0.04, T_EXT + 0.06, M.frame, this.wx(mid), eave + 0.57, this.wz(w.c), { uv: false })
          : this.box(grp, T_EXT + 0.06, 0.04, len, M.frame, this.wx(w.c), eave + 0.57, this.wz(mid), { uv: false });
        m.userData.ifc = coping;
      }
      if (st.overhang > 0.05) {
        const bb = bbox(rooms), ov = 0.6;
        this.box(grp, bb.w + ov * 2, 0.12, bb.h + ov * 2, [M.ext, M.ext, M.roofTop, M.ceiling, M.ext, M.ext], this.wx(bb.x + bb.w / 2), eave + 0.62, this.wz(bb.y + bb.h / 2))
          .userData.ifc = roofPlane('Roof overhang');
      }
      return;
    }
    const bb = bbox(rooms.filter((r) => r.type !== 'terrace'));
    const ov = st.overhang;
    const pitch = st.pitch * DEG;
    const x0 = this.wx(bb.x) - ov, x1 = this.wx(bb.x + bb.w) + ov;
    const z0 = this.wz(bb.y + bb.h) - ov, z1 = this.wz(bb.y) + ov; // z0 = back, z1 = front
    const W = x1 - x0, Dd = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const roofMat = M.roof;
    // soffit
    this.box(grp, W, 0.08, Dd, [M.ext, M.ext, M.ceiling, M.ceiling, M.ext, M.ext], cx, eave - 0.04, cz, { uv: false })
      .userData.ifc = { cls: 'IfcCovering', type: 'CEILING', name: 'Eaves soffit' };
    const ridgeAlongX = W >= Dd;
    if (st.roof === 'gable') {
      const span = ridgeAlongX ? Dd : W;
      const half = span / 2;
      const rise = (half - ov) * Math.tan(pitch);
      const eaveDrop = ov * Math.tan(pitch);
      const yE = eave - eaveDrop + 0.06, yR = eave + rise + 0.06;
      const slopeLen = Math.hypot(half, yR - yE);
      const ang = Math.atan2(yR - yE, half);
      for (const s of [-1, 1]) {
        const m = this.box(grp, ridgeAlongX ? W + 0.0 : 0.18, 0.18, ridgeAlongX ? slopeLen : 0.18, roofMat, 0, 0, 0, { uv: false });
        m.userData.ifc = roofPlane();
        if (ridgeAlongX) {
          m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(W, 0.16, slopeLen); meterUV(m.geometry, W, 0.16, slopeLen);
          m.position.set(cx, (yE + yR) / 2, cz + (s * half) / 2);
          m.rotation.x = s * ang;
        } else {
          m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(slopeLen, 0.16, Dd); meterUV(m.geometry, slopeLen, 0.16, Dd);
          m.position.set(cx + (s * half) / 2, (yE + yR) / 2, cz);
          m.rotation.z = -s * ang;
        }
      }
      // gable infill triangles
      const gw = (ridgeAlongX ? Dd : W) / 2 - ov;
      const shape = new THREE.Shape([new THREE.Vector2(-gw, 0), new THREE.Vector2(gw, 0), new THREE.Vector2(0, rise)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T_EXT, bevelEnabled: false });
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(geo, this.mats.ext);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.ifc = { ...gableWall };
        if (ridgeAlongX) { m.rotation.y = Math.PI / 2; m.position.set(s > 0 ? x1 - ov - T_EXT / 2 : x0 + ov - T_EXT / 2, eave, (z0 + z1) / 2); if (s > 0) m.position.x = x1 - ov - T_EXT / 2; }
        else { m.position.set(cx, eave, s > 0 ? z1 - ov - T_EXT / 2 : z0 + ov - T_EXT / 2); }
        grp.add(m);
      }
      if (st.chimney) {
        this.box(grp, 0.7, rise + 1.2, 0.7, this.mats.accent, ridgeAlongX ? x0 + ov + 1.4 : cx + 1.0, eave + (rise + 1.2) / 2, ridgeAlongX ? cz - 0.6 : z0 + ov + 1.4)
          .userData.ifc = { cls: 'IfcChimney', type: 'NOTDEFINED', name: 'Chimney' };
      }
      return;
    }
    if (st.roof === 'hip') {
      const short = Math.min(W, Dd), long = Math.max(W, Dd);
      const rise = (short / 2) * Math.tan(pitch);
      const yE = eave - ov * Math.tan(pitch) * 0.6 + 0.04;
      const yR = yE + rise;
      const rl = long - short;
      // vertices in local (u along long, v along short)
      const P = (u, v, y) => (ridgeAlongX ? new THREE.Vector3(cx + u, y, cz + v) : new THREE.Vector3(cx + v, y, cz + u));
      const a = P(-long / 2, -short / 2, yE), b = P(long / 2, -short / 2, yE), c = P(long / 2, short / 2, yE), dd = P(-long / 2, short / 2, yE);
      const r1 = P(-rl / 2, 0, yR), r2 = P(rl / 2, 0, yR);
      const tris = [[a, b, r2], [a, r2, r1], [c, dd, r1], [c, r1, r2], [b, c, r2], [dd, a, r1]];
      const pos = [], uv = [];
      for (const tr0 of tris) {
        const n = new THREE.Vector3().subVectors(tr0[1], tr0[0]).cross(new THREE.Vector3().subVectors(tr0[2], tr0[0]));
        const tr = n.y < 0 ? [tr0[0], tr0[2], tr0[1]] : tr0;
        for (const v of tr) { pos.push(v.x, v.y, v.z); uv.push(v.x + v.z * 0.3, v.y * 1.6 + (ridgeAlongX ? v.z : v.x) * 0.2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, roofMat);
      m.castShadow = true; m.receiveShadow = true; grp.add(m);
      m.userData.ifc = roofPlane('Hipped roof surface');
      // fascia
      const fascia = this.box(grp, W + 0.02, 0.18, Dd + 0.02, [M.frame, M.frame, M.ceiling, M.ceiling, M.frame, M.frame], cx, yE - 0.09, cz, { uv: false });
      fascia.material[2] = roofMat;
      fascia.userData.ifc = { cls: 'IfcCovering', type: 'USERDEFINED', objectType: 'Fascia', name: 'Fascia' };
      return;
    }
    if (st.roof === 'shed') {
      // rises from front (z1) to back (z0) across depth
      const rise = (Dd - 2 * ov) * Math.tan(pitch);
      const yF = eave + 0.06 - ov * Math.tan(pitch), yB = eave + rise + 0.06 + ov * Math.tan(pitch);
      const slopeLen = Math.hypot(Dd, yB - yF), ang = Math.atan2(yB - yF, Dd);
      const m = this.box(grp, W, 0.16, slopeLen, roofMat, cx, (yF + yB) / 2, cz);
      m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(W, 0.16, slopeLen); meterUV(m.geometry, W, 0.16, slopeLen);
      m.rotation.x = ang;
      m.userData.ifc = roofPlane('Mono-pitch roof');
      // side infills (right triangles) + rear clerestory band
      const dIn = Dd - 2 * ov;
      const shape = new THREE.Shape([new THREE.Vector2(-dIn / 2, 0), new THREE.Vector2(dIn / 2, 0), new THREE.Vector2(-dIn / 2, rise)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T_EXT, bevelEnabled: false });
      for (const s of [-1, 1]) {
        const tm = new THREE.Mesh(geo, this.mats.accent);
        tm.rotation.y = Math.PI / 2;
        tm.position.set(s > 0 ? x1 - ov - T_EXT / 2 : x0 + ov - T_EXT / 2, eave, cz);
        tm.castShadow = true; grp.add(tm);
        tm.userData.ifc = { ...gableWall };
      }
      const bw = W - 2 * ov;
      const clere = { cls: 'IfcWindow', type: 'WINDOW', name: 'Clerestory window', attrs: { h: rise, w: bw, part: 'NOTDEFINED' }, pset: { Pset_WindowCommon: { IsExternal: true } } };
      const band = this.box(grp, bw, rise, 0.1, this.mats.glass, cx, eave + rise / 2, z0 + ov, { uv: false, cast: false }); band.renderOrder = 2;
      band.userData.ifc = clere;
      this.box(grp, bw, 0.08, T_EXT, this.mats.frame, cx, eave + rise - 0.04, z0 + ov, { uv: false }).userData.ifc = clere;
      const nm = Math.round(bw / 1.2);
      for (let i = 0; i <= nm; i++) this.box(grp, 0.06, rise, 0.12, this.mats.frame, x0 + ov + (bw * i) / nm, eave + rise / 2, z0 + ov, { uv: false }).userData.ifc = clere;
    }
  }

  // ── site ──────────────────────────────────────────────────
  buildSite(d) {
    const s = d.site, b = d.brief, M = this.mats, g = this.siteGroup;
    const rand = rng(Math.round(d.W * 1000 + d.D * 7 + b.plotW * 13));
    const px0 = -s.ox, px1 = -s.ox + b.plotW, py0 = -s.oy, py1 = -s.oy + b.plotD;
    // ground with a hole for the pool
    const big = 220;
    const shape = new THREE.Shape([new THREE.Vector2(-big, -big), new THREE.Vector2(big, -big), new THREE.Vector2(big, big), new THREE.Vector2(-big, big)]);
    if (s.pool) {
      const p = s.pool;
      shape.holes.push(new THREE.Path([new THREE.Vector2(this.wx(p.x), -this.wz(p.y)), new THREE.Vector2(this.wx(p.x), -this.wz(p.y + p.h)), new THREE.Vector2(this.wx(p.x + p.w), -this.wz(p.y + p.h)), new THREE.Vector2(this.wx(p.x + p.w), -this.wz(p.y))].reverse()));
    }
    const gGeo = new THREE.ShapeGeometry(shape);
    const lawnCol = b.style === 'mediterranean' ? '#869257' : b.style === 'tropical' ? '#5C8C45' : '#6E9050';
    const ground = new THREE.Mesh(gGeo, grassMaterial(lawnCol));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
    const sw = 2.2, rw = 8;
    // IFC: the ground and street run to the horizon on screen; the BIM model
    // keeps them to the plot, the street in front and a margin around it.
    const ex0 = this.wx(px0) - 12, ex1 = this.wx(px1) + 12, ez0 = this.wz(py1) - 12, ez1 = this.wz(py0 - sw - rw) + 4;
    const clipShape = new THREE.Shape([new THREE.Vector2(ex0, -ez1), new THREE.Vector2(ex1, -ez1), new THREE.Vector2(ex1, -ez0), new THREE.Vector2(ex0, -ez0)]);
    clipShape.holes = shape.holes;
    ground.userData.ifcGeometry = new THREE.ShapeGeometry(clipShape);
    ground.userData.ifc = { cls: 'IfcGeographicElement', type: 'TERRAIN', name: 'Lawn' };
    const clipX = (m) => {
      const p = m.geometry.parameters, w = ex1 - ex0;
      const cg = new THREE.BoxGeometry(w, p.height, p.depth);
      meterUV(cg, w, p.height, p.depth, ex0 + big, 0, 0);
      cg.translate((ex0 + ex1) / 2 - m.position.x, 0, 0);
      m.userData.ifcGeometry = cg;
      return m;
    };
    // street + sidewalk
    const asphalt = new THREE.MeshStandardMaterial({ map: tex('asphalt', '#55575a'), roughness: 0.95, name: 'Asphalt' });
    const kerbMat = new THREE.MeshStandardMaterial({ map: tex('concrete', '#BDB9B0'), roughness: 0.9, name: 'Kerb - concrete' });
    clipX(this.box(g, big * 2, 0.02, rw, asphalt, 0, 0.005, this.wz(py0 - sw - rw / 2), { cast: false, ox: 0, oz: 0 })).userData.ifc = { cls: 'IfcCivilElement', name: 'Street' };
    clipX(this.box(g, big * 2, 0.08, sw, M.paving, 0, 0.04, this.wz(py0 - sw / 2), { cast: false })).userData.ifc = { cls: 'IfcCivilElement', name: 'Footpath' };
    clipX(this.box(g, big * 2, 0.13, 0.18, kerbMat, 0, 0.065, this.wz(py0 - sw + 0.09), { cast: false })).userData.ifc = { cls: 'IfcCivilElement', name: 'Kerb' };
    // lane markings
    const markMat = new THREE.MeshBasicMaterial({ color: '#e9e5da', name: 'Road marking' });
    const marks = { cls: 'IfcCivilElement', name: 'Road markings' };
    for (let x = -big; x < big; x += 6) {
      const lm = this.box(g, 3, 0.022, 0.15, markMat, x, 0.012, this.wz(py0 - sw - rw / 2), { cast: false, uv: false });
      lm.userData.ifc = marks;
      if (x - 1.5 < ex0 || x + 1.5 > ex1) lm.userData.ifcSkip = true;
    }
    // driveway & path
    const paving = (name) => ({ cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Paving', name });
    if (s.driveway) { const dv = s.driveway; this.box(g, dv.w, 0.05, dv.h + sw, M.paving, this.wx(dv.x + dv.w / 2), 0.025, this.wz(dv.y - sw + (dv.h + sw) / 2), { cast: false, ox: dv.x, oz: dv.y }).userData.ifc = paving('Driveway'); }
    if (s.path) { const pt = s.path; this.box(g, pt.w, 0.05, pt.h + sw, M.paving, this.wx(pt.x + pt.w / 2), 0.025, this.wz(pt.y - sw + (pt.h + sw) / 2), { cast: false, ox: pt.x, oz: pt.y }).userData.ifc = paving('Garden path'); }
    // patio + pergola + outdoor furniture
    if (s.patio) {
      const p = s.patio;
      const paved = ['mediterranean', 'farmhouse'].includes(d.styleKey);
      this.box(g, p.w, PLINTH, p.h, paved ? M.paving : M.deck, this.wx(p.x + p.w / 2), PLINTH / 2, this.wz(p.y + p.h / 2), { ox: p.x, oz: p.y })
        .userData.ifc = { cls: 'IfcSlab', type: 'USERDEFINED', objectType: paved ? 'Paving' : 'Decking', name: 'Patio' };
      if (['tropical', 'mediterranean', 'japandi', 'farmhouse'].includes(d.styleKey)) {
        const hh = 2.7, pm = this.mats.timber;
        const pergola = { cls: 'IfcBuildingElementProxy', type: 'USERDEFINED', objectType: 'Pergola', name: 'Pergola' };
        for (const [x, y] of [[p.x + 0.15, p.y + p.h - 0.15], [p.x + p.w - 0.15, p.y + p.h - 0.15]]) this.box(g, 0.14, hh, 0.14, pm, this.wx(x), PLINTH + hh / 2, this.wz(y)).userData.ifc = pergola;
        this.box(g, p.w, 0.2, 0.12, pm, this.wx(p.x + p.w / 2), PLINTH + hh - 0.1, this.wz(p.y + p.h - 0.15)).userData.ifc = pergola;
        const n = Math.floor(p.w / 0.45);
        for (let i = 0; i <= n; i++) this.box(g, 0.06, 0.16, p.h + 0.2, pm, this.wx(p.x + (p.w * i) / n), PLINTH + hh + 0.08, this.wz(p.y + p.h / 2)).userData.ifc = pergola;
      }
      const items = [];
      if (p.w > 4) items.push({ t: 'otable', x: p.x + p.w * 0.25 - 0.9, y: p.y + p.h / 2 - 0.45, w: 1.8, h: 0.9, back: 'N', chairs: 6 });
      items.push({ t: 'lounger', x: p.x + p.w * 0.7, y: p.y + p.h / 2 - 0.95, w: 0.7, h: 1.9, back: 'N' });
      if (p.w > 3) items.push({ t: 'planter', x: p.x + p.w - 0.7, y: p.y + 0.15, w: 0.55, h: 0.55, back: 'N' });
      for (const it of items) {
        const fg = buildFurniture(it, this.FM, {}); if (!fg) continue;
        fg.position.set(this.wx(it.x + it.w / 2), PLINTH, this.wz(it.y + it.h / 2)); fg.rotation.y = BACK_ROT[it.back];
        fg.userData.ifc = furnitureTag(it);
        g.add(fg);
      }
    }
    // pool
    if (s.pool) {
      const p = s.pool, depth = 1.5;
      const pool = { cls: 'IfcBuildingElementProxy', type: 'USERDEFINED', objectType: 'Swimming pool', name: 'Swimming pool', qto: { Qto_BuildingElementProxyQuantities: { NetVolume: [p.w * p.h * (depth - 0.14), 'vol'] } } };
      const shell = this.box(g, p.w, depth, p.h, M.poolTile, this.wx(p.x + p.w / 2), -depth / 2, this.wz(p.y + p.h / 2), { cast: false, uv: false });
      shell.userData.ifc = pool;
      // IFC: the shell renders back faces only (an open basin); export it without its lid
      const open = shell.geometry.clone();
      open.setIndex(Array.from(open.index.array).filter((_, i) => i < 12 || i >= 18));
      open.clearGroups();
      shell.userData.ifcGeometry = open;
      const water = this.box(g, p.w, 0.02, p.h, M.water, this.wx(p.x + p.w / 2), -0.14, this.wz(p.y + p.h / 2), { cast: false, uv: false });
      water.renderOrder = 2;
      water.userData.ifc = pool;
      const c = 0.45;
      const coping = { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Paving', name: 'Pool coping' };
      this.box(g, p.w + 2 * c, 0.08, c, M.paving, this.wx(p.x + p.w / 2), 0.04, this.wz(p.y - c / 2), { cast: false }).userData.ifc = coping;
      this.box(g, p.w + 2 * c, 0.08, c, M.paving, this.wx(p.x + p.w / 2), 0.04, this.wz(p.y + p.h + c / 2), { cast: false }).userData.ifc = coping;
      this.box(g, c, 0.08, p.h, M.paving, this.wx(p.x - c / 2), 0.04, this.wz(p.y + p.h / 2), { cast: false }).userData.ifc = coping;
      this.box(g, c, 0.08, p.h, M.paving, this.wx(p.x + p.w + c / 2), 0.04, this.wz(p.y + p.h / 2), { cast: false }).userData.ifc = coping;
      for (let i = 0; i < 2; i++) {
        const it = { t: 'lounger', x: 0, y: 0, w: 0.7, h: 1.9, back: 'N' };
        const fg = buildFurniture(it, this.FM, {});
        fg.position.set(this.wx(p.x + 0.6 + i * 1.1), 0.08, this.wz(p.y + p.h + c + 1.2)); fg.rotation.y = Math.PI; g.add(fg);
        fg.userData.ifc = furnitureTag(it);
      }
    }
    // ── landscape ────────────────────────────────────────────
    const garden = d.style.garden;
    const foliage = new Foliage();
    const W = (x) => this.wx(x), Z = (y) => this.wz(y);
    // boundary walls / fences with openings for the driveway and path
    const gaps = [s.driveway, s.path].filter(Boolean).map((r) => [W(r.x - 0.35), W(r.x + r.w + 0.35)]);
    const spec = buildBoundary(g, d.styleKey, [
      { kind: 'front', axis: 'x', fixed: Z(py0 + 0.12), a: W(px0 + 0.12), b: W(px1 - 0.12), gaps, inward: -1 },
      { kind: 'side', axis: 'z', fixed: W(px0 + 0.12), a: Z(py1 - 0.12), b: Z(py0 + 0.12), inward: 1 },
      { kind: 'side', axis: 'z', fixed: W(px1 - 0.12), a: Z(py1 - 0.12), b: Z(py0 + 0.12), inward: -1 },
      { kind: 'side', axis: 'x', fixed: Z(py1 - 0.12), a: W(px0 + 0.12), b: W(px1 - 0.12), inward: 1 },
    ]);
    // hard surfaces (plan coordinates) for grass and planting
    const gRooms = d.floors[0].rooms;
    const hard = gRooms.map((r) => ({ x: r.x - 0.3, y: r.y - 0.3, w: r.w + 0.6, h: r.h + 0.6 }));
    if (s.patio) hard.push({ x: s.patio.x - 0.1, y: s.patio.y - 0.1, w: s.patio.w + 0.2, h: s.patio.h + 0.2 });
    if (s.pool) hard.push({ x: s.pool.x - 0.55, y: s.pool.y - 0.55, w: s.pool.w + 1.1, h: s.pool.h + 1.1 });
    if (s.driveway) hard.push({ x: s.driveway.x - 0.1, y: s.driveway.y - 0.2, w: s.driveway.w + 0.2, h: s.driveway.h + 0.4 });
    if (s.path) hard.push({ x: s.path.x - 0.1, y: s.path.y - 0.2, w: s.path.w + 0.2, h: s.path.h + 0.4 });
    const inRects = (list, x, y, m = 0) => list.some((r) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m);
    // front planting bed with steel edging
    const gar = gRooms.find((r) => r.type === 'garage');
    const bedSkip = [gar && [gar.x - 0.4, gar.x + gar.w + 0.4], s.path && [s.path.x - 0.15, s.path.x + s.path.w + 0.15], s.driveway && [s.driveway.x - 0.2, s.driveway.x + s.driveway.w + 0.2]].filter(Boolean);
    let bedSegs = [[0.2, d.W - 0.2]];
    for (const [a, c] of bedSkip) bedSegs = bedSegs.flatMap(([p0, p1]) => (c <= p0 || a >= p1 ? [[p0, p1]] : [[p0, a], [c, p1]].filter(([u, v]) => v - u > 0.8)));
    const mulch = new THREE.MeshStandardMaterial({ map: tex('mulch', '#5A4334'), roughness: 1, name: 'Mulch' });
    const edge = new THREE.MeshStandardMaterial({ color: '#3A3634', roughness: 0.5, metalness: 0.5, name: 'Steel edging' });
    const shrubKind = SHRUB_KIND[garden] || 'shrub';
    for (const [a, c] of bedSegs) {
      const bedY0 = -1.35, bedY1 = -0.14;
      const bed = { cls: 'IfcGeographicElement', type: 'USERDEFINED', objectType: 'Planting bed', name: 'Planting bed' };
      this.box(g, c - a, 0.05, bedY1 - bedY0, mulch, W((a + c) / 2), 0.025, Z((bedY0 + bedY1) / 2), { cast: false, ox: a, oz: bedY0 }).userData.ifc = bed;
      this.box(g, c - a, 0.07, 0.015, edge, W((a + c) / 2), 0.035, Z(bedY0), { cast: false, uv: false }).userData.ifc = bed;
      hard.push({ x: a, y: bedY0, w: c - a, h: bedY1 - bedY0 });
      for (let x = a + 0.5; x < c - 0.3; x += 0.95 + rand() * 0.35) plantShrub(W(x), Z(-0.7 + (rand() - 0.5) * 0.2), 0.38 + rand() * 0.2, rand, foliage, rand() > 0.75 ? 'shrub' : shrubKind);
    }
    // planting along the boundary
    if (spec.hedge) { hedge(g, foliage, W(px0 + 0.9), Z(py1 - 0.75), W(px1 - 0.9), Z(py1 - 0.75), 1.5, 0.8, rand); hard.push({ x: px0, y: py1 - 1.3, w: b.plotW, h: 1.3 }); }
    const edgeSpots = [];
    for (let y = py0 + 2.5; y < py1 - 1; y += 2.2 + rand() * 1.2) { edgeSpots.push([px0 + 0.9, y]); edgeSpots.push([px1 - 0.9, y]); }
    if (!spec.hedge) for (let x = px0 + 1.5; x < px1 - 1.5; x += 2.4 + rand() * 1.2) edgeSpots.push([x, py1 - 0.9]);
    for (const [x, y] of edgeSpots) {
      if (rand() < 0.35 || inRects(hard, x, y, 0.6)) continue;
      plantShrub(W(x), Z(y), 0.5 + rand() * 0.45, rand, foliage, rand() > 0.6 ? shrubKind : 'shrub');
      hard.push({ x: x - 0.6, y: y - 0.6, w: 1.2, h: 1.2 });
    }
    // garden trees (kept out of the front yard view line and off hard surfaces)
    const avoid = [{ x: -1.5, y: -1.5 - s.prot, w: d.W + 3, h: d.D + 3 + s.prot }, { x: d.W * 0.12, y: -s.oy - 1, w: d.W * 0.76, h: s.oy + 1 }];
    if (s.patio) avoid.push({ x: s.patio.x - 1, y: s.patio.y, w: s.patio.w + 2, h: s.patio.h + 1 });
    if (s.pool) avoid.push({ x: s.pool.x - 2, y: s.pool.y - 1, w: s.pool.w + 4, h: s.pool.h + 4 });
    if (s.driveway) avoid.push({ x: s.driveway.x - 1, y: s.driveway.y - 1, w: s.driveway.w + 2, h: s.driveway.h + 2 });
    if (s.path) avoid.push({ x: s.path.x - 0.8, y: s.path.y - 1, w: s.path.w + 1.6, h: s.path.h + 2 });
    for (const f of d.floors) for (const bc of f.balconies) avoid.push({ x: bc.x - 1, y: bc.y, w: bc.w + 2, h: bc.h + 1.5 });
    const species = GARDEN_SPECIES[garden] || GARDEN_SPECIES.minimal;
    const area = b.plotW * b.plotD;
    const nTrees = Math.min(12, Math.max(3, Math.round(area / 110)));
    const treeAt = [];
    for (let tries = 0; tries < 400 && treeAt.length < nTrees; tries++) {
      const x = px0 + 2 + rand() * (b.plotW - 4), y = py0 + 1.8 + rand() * (b.plotD - 3.6);
      if (inRects(avoid, x, y, 1.4) || treeAt.some(([u, v]) => Math.hypot(u - x, v - y) < 3.6)) continue;
      treeAt.push([x, y]);
      plantTree(species[treeAt.length % species.length], W(x), Z(y), rand, g, foliage, 0.85 + rand() * 0.3);
    }
    // street trees in the sidewalk, with tree pits
    const pitMat = new THREE.MeshStandardMaterial({ map: tex('mulch', '#4A3A2E'), roughness: 1, name: 'Tree pit mulch' });
    const street = STREET_SPECIES[garden] || 'oak';
    for (let x = px0 - 13.5; x < px1 + 14; x += 9) {
      if ([s.driveway, s.path].some((r) => r && x > r.x - 1.5 && x < r.x + r.w + 1.5)) continue;
      this.box(g, 1.1, 0.085, 1.1, pitMat, W(x), 0.043, Z(py0 - 1.1), { cast: false, ox: x, oz: py0 }).userData.ifc = { cls: 'IfcCivilElement', name: 'Tree pit' };
      plantTree(street, W(x), Z(py0 - 1.1), rand, g, foliage, 0.9);
    }
    if (garden === 'zen') {
      for (let i = 0; i < 7; i++) {
        const x = px0 + 2 + rand() * (b.plotW - 4), y = d.D + 2.5 + rand() * Math.max(1, b.plotD - s.oy - d.D - 4);
        if (inRects(avoid, x, y, 0.4)) continue;
        rock(g, W(x), Z(y), 0.3 + rand() * 0.5, rand);
        hard.push({ x: x - 0.6, y: y - 0.6, w: 1.2, h: 1.2 });
      }
    }
    foliage.build(g);
    // 3D grass tufts across the open lawn
    const lawnArea = Math.max(0, area - hard.reduce((sum, r) => sum + r.w * r.h, 0));
    const free = (X, Zw) => {
      const x = X + this.cx, y = this.cy - Zw;
      if (x < px0 + 0.35 || x > px1 - 0.35 || y < py0 + 0.35 || y > py1 - 0.35) return false;
      return !inRects(hard, x, y);
    };
    scatterGrass(g, { x0: W(px0), x1: W(px1), z0: Z(py1), z1: Z(py0) }, free, Math.min(26000, Math.round(lawnArea * 24)), rand);
    void boxUV;
    this.plotBounds = { px0, px1, py0, py1 };
  }

  fitShadows(d) {
    const ext = Math.max(d.brief.plotW, d.brief.plotD) * 0.75 + 6;
    const c = this.sun.shadow.camera;
    c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 1; c.far = 260;
    c.updateProjectionMatrix();
  }

  // ── sun study ─────────────────────────────────────────────
  setSunTime(hour) {
    this.sunHour = hour;
    if (!this.design) return;
    const b = this.design.brief;
    const t = (hour - 6) / 12; // 0..1 from 6:00 to 18:00
    const elev = Math.max(3, Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI) * 62 + (hour > 18 || hour < 6 ? -8 : 0));
    const azC = b.hemisphere === 'S' ? 90 - t * 180 : 90 + t * 180; // compass azimuth
    const backAz = AZ[compass('N', b.street)];
    const phi = (azC - backAz) * DEG;
    const el = elev * DEG;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(el), Math.sin(el), -Math.cos(phi) * Math.cos(el));
    this.sun.position.copy(dir.multiplyScalar(110));
    this.sun.target.position.set(0, 0, 0);
    const low = 1 - Math.min(1, elev / 35);
    this.sun.color.setHSL(0.09, 0.5 + low * 0.4, 0.93 - low * 0.18);
    this.sun.intensity = 1.5 + (1 - low) * 1.4;
    this.hemi.intensity = 0.55 + (1 - low) * 0.35;
    const u = this.sky.material.uniforms;
    u.top.value.set(low > 0.6 ? '#7f9dc4' : '#8fb6d9');
    u.horizon.value.set(low > 0.5 ? '#f3d9bd' : '#eef0ea');
    this.scene.fog.color.copy(u.horizon.value);
    this.dirty = true;
  }

  // ── view state ────────────────────────────────────────────
  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    if (mode === 'walk') {
      this.prevMode = prev;
      this.mode = 'walk';
      this.controls.enabled = false;
      this.walkLevelIdx = typeof this.level === 'number' ? this.level : 0;
      this.spawnWalk();
      this.requestLock();
    } else {
      if (this.mode === 'walk') { this.walk.isLocked && this.walk.unlock(); this.controls.enabled = true; this.mode = mode; this.preset(mode === 'section' ? 'section' : 'front'); }
      else { this.mode = mode; if (mode === 'section') this.preset('section'); }
    }
    this.applyVisibility();
    this.cb.onModeChange?.(this.mode);
    this.dirty = true;
  }
  setLevel(level) { this.level = level; this.applyVisibility(); if (this.mode === 'walk') { this.walkLevelIdx = level === 'all' ? 0 : level; this.camera.position.y = this.elev(this.walkLevelIdx) + 1.62; } this.dirty = true; }
  setToggle(k, v) { this.toggles[k] = v; this.applyVisibility(); this.dirty = true; }

  applyVisibility() {
    if (!this.design) return;
    const all = this.level === 'all';
    const lvl = all ? this.F - 1 : this.level;
    const mode = this.mode;
    let showUpTo = this.F - 1, roof = this.toggles.roof, clip = 1e4, labels = false;
    if (mode === 'section') { showUpTo = lvl; roof = false; clip = this.elev(lvl) + 1.35; labels = true; }
    else if (mode === 'exterior' && !all) { showUpTo = lvl; roof = false; clip = this.elev(lvl) + this.design.ceiling - 0.02; labels = true; }
    this.floorGroups.forEach((g, k) => (g.visible = k <= showUpTo));
    this.furnGroups.forEach((g) => (g.visible = this.toggles.furniture));
    this.roofGroup.visible = roof;
    this.siteGroup.visible = this.toggles.site;
    this.clipPlane.constant = clip;
    this.pickEnabled = mode === 'section' || (mode === 'exterior' && !all);
    for (const o of this.labelObjs) o.visible = this.toggles.labels && labels && o.userData.level === lvl;
    this.hl.visible = false;
    this.dirty = true;
  }

  preset(name, animate = true) {
    if (!this.design) return;
    const d = this.design, b = d.brief;
    const R = Math.max(d.W, d.D, 10);
    const hTot = this.F * this.H;
    let pos, tgt = new THREE.Vector3(0, hTot * 0.42, 0);
    if (name === 'front') pos = new THREE.Vector3(-R * 0.75, hTot * 0.55 + R * 0.28, R * 1.35 + d.D / 2);
    else if (name === 'rear') pos = new THREE.Vector3(R * 0.8, hTot * 0.5 + R * 0.3, -R * 1.3 - d.D / 2);
    else if (name === 'aerial') { pos = new THREE.Vector3(R * 0.05, R * 1.9 + hTot, R * 0.35); tgt.set(0, 0, 0); }
    else if (name === 'side') pos = new THREE.Vector3(R * 1.5 + d.W / 2, hTot * 0.5 + R * 0.2, R * 0.4);
    else if (name === 'section') {
      const lvl = this.level === 'all' ? this.F - 1 : this.level;
      tgt.set(0, this.elev(lvl), 0);
      pos = new THREE.Vector3(-R * 0.55, this.elev(lvl) + R * 1.05, R * 0.95);
    }
    void b;
    if (!pos) return;
    // frame the bounding sphere for the current aspect ratio
    if (name !== 'section') {
      const rad = Math.hypot(d.W, d.D + (d.site?.prot || 0), hTot) / 2 + 2.5;
      const vf = (this.camera.fov * DEG) / 2;
      const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
      const dist = rad / Math.sin(Math.min(vf, hf)) * (name === 'aerial' ? 0.9 : 1.0);
      const dir = pos.clone().sub(tgt).normalize();
      pos = tgt.clone().add(dir.multiplyScalar(dist));
    } else {
      const rad = Math.hypot(d.W, d.D) / 2 + 1.5;
      const vf = (this.camera.fov * DEG) / 2, hf = Math.atan(Math.tan(vf) * this.camera.aspect);
      const dist = rad / Math.sin(Math.min(vf, hf)) * 0.95;
      const dir = pos.clone().sub(tgt).normalize();
      pos = tgt.clone().add(dir.multiplyScalar(dist));
    }
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); this.dirty = true; return; }
    this.tween = { p0: this.camera.position.clone(), p1: pos, t0: this.controls.target.clone(), t1: tgt, start: performance.now(), dur: 900 };
  }

  requestLock() {
    // Pointer Lock needs a user gesture; newer browsers return a promise that may reject.
    try { const p = this.renderer.domElement.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ }
  }

  focusRoom(room) {
    if (!room || !this.design) return;
    const lvl = room.floor ?? 0;
    const tgt = new THREE.Vector3(this.wx(room.x + room.w / 2), this.elev(lvl), this.wz(room.y + room.h / 2));
    const dist = Math.max(room.w, room.h) * 1.4 + 5;
    const pos = tgt.clone().add(new THREE.Vector3(-dist * 0.4, dist * 0.95, dist * 0.6));
    this.tween = { p0: this.camera.position.clone(), p1: pos, t0: this.controls.target.clone(), t1: tgt, start: performance.now(), dur: 900 };
    this.highlight(room, 'sel');
  }

  spawnWalk() {
    const d = this.design;
    const k = this.walkLevelIdx || 0;
    const f = d.floors[k];
    const foy = f.rooms.find((r) => r.type === 'foyer') || f.rooms.find((r) => r.type === 'hall');
    const hall = f.rooms.find((r) => r.type === 'hall');
    const x = foy ? foy.x + foy.w / 2 : d.W / 2;
    const y = hall ? hall.y + hall.h / 2 : d.D / 2;
    this.camera.position.set(this.wx(x), this.elev(k) + 1.62, this.wz(y));
    this.camera.lookAt(this.wx(x), this.elev(k) + 1.5, this.wz(d.D));
    this.walkVel = new THREE.Vector3();
  }
  walkLevel(delta) {
    const n = Math.max(0, Math.min(this.F - 1, (this.walkLevelIdx || 0) + delta));
    this.walkLevelIdx = n;
    this.camera.position.y = this.elev(n) + 1.62;
    const f = this.design.floors[n], hall = f.rooms.find((r) => r.type === 'hall');
    const st = f.rooms.find((r) => r.type === 'stair');
    if (hall) this.camera.position.set(this.wx(st ? st.x + st.w / 2 : hall.x + hall.w / 2), this.elev(n) + 1.62, this.wz(hall.y + hall.h / 2));
    this.cb.onModeChange?.('walk', n);
    this.dirty = true;
  }
  updateWalk(dt) {
    if (!this.walk.isLocked) return false;
    const sp = (this.keys.ShiftLeft || this.keys.ShiftRight ? 4.2 : 2.2) * dt;
    let f = 0, r = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) f += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) f -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) r += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) r -= 1;
    if (!f && !r) return false;
    const before = this.camera.position.clone();
    this.walk.moveForward(f * sp);
    this.walk.moveRight(r * sp);
    // collide (circle vs AABB)
    const p = this.camera.position, rad = 0.22;
    for (const bx of this.wallBoxes[this.walkLevelIdx || 0] || []) {
      const cx = Math.max(bx.minX, Math.min(p.x, bx.maxX)), cz = Math.max(bx.minZ, Math.min(p.z, bx.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < rad * rad) {
        if (d2 < 1e-8) { p.x = before.x; p.z = before.z; continue; }
        const dd = Math.sqrt(d2); p.x = cx + (dx / dd) * rad; p.z = cz + (dz / dd) * rad;
      }
    }
    return true;
  }

  // ── selection overlays ────────────────────────────────────
  highlight(room, kind = 'hl') {
    const m = kind === 'sel' ? this.sel : this.hl;
    if (!room || !this.design) { m.visible = false; this.dirty = true; return; }
    const lvl = room.floor ?? 0;
    m.scale.set(room.w - 0.1, 1, room.h - 0.1);
    m.position.set(this.wx(room.x + room.w / 2), this.elev(lvl) + 0.045, this.wz(room.y + room.h / 2));
    m.visible = true;
    this.dirty = true;
  }

  // ── loop ──────────────────────────────────────────────────
  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.paused) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    let changed = false;
    if (this.mode === 'walk') changed = this.updateWalk(dt) || this.walk.isLocked;
    else {
      if (this.tween) {
        const tw = this.tween, k = Math.min(1, (performance.now() - tw.start) / tw.dur), e = 1 - Math.pow(1 - k, 3);
        this.camera.position.lerpVectors(tw.p0, tw.p1, e);
        this.controls.target.lerpVectors(tw.t0, tw.t1, e);
        if (k >= 1) this.tween = null;
        changed = true;
      }
      if (this.autoRotate) { this.controls.autoRotate = true; this.controls.autoRotateSpeed = this.showcase ? 0.9 : 0.6; } else this.controls.autoRotate = false;
      changed = this.controls.update() || changed || this.autoRotate;
    }
    if (this.pickPending && this.mode !== 'walk') {
      const pp = this.pickPending; this.pickPending = null;
      const hit = this.pick();
      if (hit) this.highlight(hit.room, 'hl'); else this.hl.visible = false;
      this.cb.onHover?.(hit ? { room: hit.room, x: pp.x, y: pp.y } : null);
      changed = true;
    }
    if (changed || this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      this.dirty = false;
      if (this.design) {
        const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
        const phi = Math.atan2(fwd.x, -fwd.z) / DEG;
        const heading = (AZ[compass('N', this.design.brief.street)] + phi + 360) % 360;
        this.cb.onCompass?.(heading);
      }
    }
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** IFC4 BIM model of the current design, written from this scene. */
  exportIFC() {
    return writeIFC(this.design, this);
  }

  exportGLB() {
    return new Promise((res, rej) => {
      const exp = new GLTFExporter();
      const labels = this.labelObjs.map((o) => [o, o.parent]);
      labels.forEach(([o, p]) => p.remove(o));
      exp.parse(this.world, (glb) => { labels.forEach(([o, p]) => p.add(o)); res(new Blob([glb], { type: 'model/gltf-binary' })); },
        (err) => { labels.forEach(([o, p]) => p.add(o)); rej(err); }, { binary: true, onlyVisible: false });
    });
  }
}

function d_styleTile(d) { return ['industrial', 'mediterranean'].includes(d.styleKey); }

function bbox(rects) {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function subtractRect(rects, hole) {
  const out = [];
  for (const r of rects) {
    const ix0 = Math.max(r.x, hole.x), iy0 = Math.max(r.y, hole.y), ix1 = Math.min(r.x + r.w, hole.x + hole.w), iy1 = Math.min(r.y + r.h, hole.y + hole.h);
    if (ix1 <= ix0 + 1e-4 || iy1 <= iy0 + 1e-4) { out.push(r); continue; }
    if (iy0 > r.y + 1e-4) out.push({ x: r.x, y: r.y, w: r.w, h: iy0 - r.y });
    if (r.y + r.h > iy1 + 1e-4) out.push({ x: r.x, y: iy1, w: r.w, h: r.y + r.h - iy1 });
    if (ix0 > r.x + 1e-4) out.push({ x: r.x, y: iy0, w: ix0 - r.x, h: iy1 - iy0 });
    if (r.x + r.w > ix1 + 1e-4) out.push({ x: ix1, y: iy0, w: r.x + r.w - ix1, h: iy1 - iy0 });
  }
  return out;
}
