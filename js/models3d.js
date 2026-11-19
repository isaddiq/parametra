// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Low-poly furniture & landscape models
//  Local frame: footprint a (x) × b (z), floor at y=0,
//  back of the object at -z, front facing +z.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { tex } from './textures.js';

const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function B(g, w, h, d, m, x = 0, y = 0, z = 0, shadow = true) {
  if (w <= 0 || h <= 0 || d <= 0) return null;
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function C(g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function S(g, r, m, x, y, z, detail = 1, sy = 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
  mesh.position.set(x, y, z); mesh.scale.y = sy; mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}

export function furnitureMaterials(style) {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
  const fabricTex = (c) => { const t = tex('fabric', c).clone(); t.needsUpdate = true; t.repeat.set(2, 2); return t; };
  const M = {
    wood: std(style.wood, { roughness: 0.6 }),
    woodDark: std(new THREE.Color(style.wood).multiplyScalar(0.55), { roughness: 0.6 }),
    fabric: std(style.fabric, { map: fabricTex(style.fabric), roughness: 0.95 }),
    fabric2: std(style.fabric2, { map: fabricTex(style.fabric2), roughness: 0.95 }),
    white: std('#F4F2EE', { roughness: 0.4 }),
    ceramic: std('#FBFBF9', { roughness: 0.15 }),
    black: std('#1d1e20', { roughness: 0.35 }),
    screen: std('#0b0c0e', { roughness: 0.15, metalness: 0.2 }),
    steel: std('#b9bcc0', { roughness: 0.3, metalness: 0.8 }),
    metal: std(style.metal, { roughness: 0.4, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    mirror: std('#dfe7ea', { roughness: 0.02, metalness: 1 }),
    rug: std(style.rug, { map: fabricTex(style.rug), roughness: 1 }),
    plant: std('#4f7a45', { roughness: 0.85, flatShading: true }),
    plant2: std('#6d9558', { roughness: 0.85, flatShading: true }),
    pot: std('#c9c2b6', { roughness: 0.8 }),
    counterTop: std(style.key === 'industrial' ? '#3a3b3d' : style.key === 'mediterranean' ? '#e9e1d2' : '#ecebe8', { roughness: 0.25 }),
    cabinet: std(['scandi', 'modern'].includes(style.key) ? '#f2f0ec' : style.key === 'industrial' ? '#2c2e30' : style.key === 'contemporary' ? '#3a3b3e' : style.wood, { roughness: 0.5 }),
    cabinet2: std(style.fabric2, { roughness: 0.5 }),
    shade: new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffdca0', emissiveIntensity: 0.6, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#7fc1d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 }),
    book: ['#8a4f3c', '#3f5c6e', '#c9a46c', '#2f3a33', '#b8b2a6'].map((c) => std(c)),
    carMats: {},
    outdoor: std('#6b5a48', { roughness: 0.8 }),
    cushion: std('#e8e2d6', { roughness: 1 }),
    concrete: std('#a8a59f', { roughness: 0.9 }),
  };
  // readable names, carried into the IFC export as materials
  const NAMES = {
    wood: 'Furniture timber', woodDark: 'Furniture timber - dark', fabric: 'Upholstery', fabric2: 'Upholstery - accent', white: 'White lacquer',
    ceramic: 'Sanitary ceramic', black: 'Black finish', screen: 'Screen glass', steel: 'Stainless steel', metal: 'Metal finish', glass: 'Shower glass',
    mirror: 'Mirror', rug: 'Rug', plant: 'Plant foliage', plant2: 'Plant foliage - light', pot: 'Plant pot', counterTop: 'Worktop', cabinet: 'Cabinetry',
    cabinet2: 'Cabinetry - accent', shade: 'Lamp shade', water: 'Bath water', outdoor: 'Outdoor timber', cushion: 'Cushions', concrete: 'Planter concrete',
  };
  for (const [k, v] of Object.entries(NAMES)) M[k].name = v;
  M.book.forEach((m, i) => (m.name = `Book spines ${i + 1}`));
  return M;
}

const carMat = (M, c) => (M.carMats[c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.6, name: 'Car paint' }));

export function buildFurniture(it, M, env = {}) {
  const g = new THREE.Group();
  const a = it.back === 'N' || it.back === 'S' ? it.w : it.h;
  const b = it.back === 'N' || it.back === 'S' ? it.h : it.w;
  const f = MODELS[it.t];
  if (!f) return null;
  f(g, a, b, M, it, env);
  return g;
}

const MODELS = {
  bed(g, a, b, M) {
    B(g, a, 0.28, b, M.woodDark);
    B(g, a - 0.06, 0.22, b - 0.12, M.white, 0, 0.28, 0.04);
    B(g, a, 0.07, b * 0.62, M.fabric, 0, 0.47, b * 0.19);
    B(g, a + 0.06, 0.08, 0.3, M.fabric2, 0, 0.5, b * 0.45 - 0.16);
    B(g, a + 0.04, 1.05, 0.09, M.fabric2, 0, 0, -b / 2 + 0.045);
    const pw = a / 2 - 0.14;
    B(g, pw, 0.13, 0.36, M.white, -a / 4, 0.5, -b / 2 + 0.34);
    B(g, pw, 0.13, 0.36, M.white, a / 4, 0.5, -b / 2 + 0.34);
  },
  nightstand(g, a, b, M) {
    B(g, a, 0.5, b, M.wood);
    C(g, 0.06, 0.08, 0.25, M.black, 0, 0.5, -0.02);
    C(g, 0.1, 0.13, 0.18, M.shade, 0, 0.72, -0.02);
  },
  wardrobe(g, a, b, M, it) {
    if (it.open) {
      B(g, 0.03, 2.2, b, M.wood, -a / 2 + 0.015); B(g, 0.03, 2.2, b, M.wood, a / 2 - 0.015);
      B(g, a, 0.03, b, M.wood, 0, 2.17);
      for (const y of [0.05, 0.4, 1.7]) B(g, a - 0.06, 0.025, b, M.wood, 0, y);
      C(g, 0.012, 0.012, a - 0.06, M.steel, 0, 1.55, 0).rotation.z = Math.PI / 2;
      const n = Math.floor(a / 0.12);
      for (let i = 0; i < n; i++) B(g, 0.05, 0.75 + (i % 3) * 0.12, b * 0.8, M.book[i % M.book.length], -a / 2 + 0.1 + i * 0.12, 0.8, 0, false);
      return;
    }
    B(g, a, 2.2, b, M.cabinet);
    const n = Math.max(2, Math.round(a / 0.6));
    for (let i = 1; i < n; i++) B(g, 0.008, 2.1, 0.01, M.black, -a / 2 + (a / n) * i, 0.05, b / 2, false);
    for (let i = 0; i < n; i++) B(g, 0.02, 0.3, 0.03, M.metal, -a / 2 + (a / n) * (i + 0.5) + (i % 2 ? -0.06 : 0.06), 1.0, b / 2 + 0.015, false);
  },
  sofa(g, a, b, M, it) {
    const deep = !!it.deep;
    B(g, a, 0.42, b, M.fabric);
    B(g, a, 0.45, 0.24, M.fabric, 0, 0.4, -b / 2 + 0.12);
    B(g, 0.2, 0.22, b, M.fabric, -a / 2 + 0.1, 0.42, 0); B(g, 0.2, 0.22, b, M.fabric, a / 2 - 0.1, 0.42, 0);
    const n = Math.max(2, Math.round((a - 0.4) / 0.85));
    const cw = (a - 0.4) / n;
    for (let i = 0; i < n; i++) B(g, cw - 0.03, 0.12, b - 0.3, M.cushion, -a / 2 + 0.2 + cw * (i + 0.5), 0.42, 0.1);
    B(g, 0.42, 0.36, 0.14, M.fabric2, -a / 2 + 0.45, 0.52, -b / 2 + 0.33).rotation.x = -0.25;
    B(g, 0.42, 0.36, 0.14, M.fabric2, a / 2 - 0.45, 0.52, -b / 2 + 0.33).rotation.x = -0.25;
    if (deep) B(g, a - 0.4, 0.02, 0.6, M.fabric2, 0, 0.55, b / 2 - 0.35);
  },
  armchair(g, a, b, M) {
    B(g, a, 0.4, b, M.fabric2);
    B(g, a, 0.4, 0.18, M.fabric2, 0, 0.4, -b / 2 + 0.09);
    B(g, 0.12, 0.2, b, M.fabric2, -a / 2 + 0.06, 0.4, 0); B(g, 0.12, 0.2, b, M.fabric2, a / 2 - 0.06, 0.4, 0);
    B(g, a - 0.26, 0.1, b - 0.22, M.cushion, 0, 0.4, 0.08);
  },
  coffee(g, a, b, M) { B(g, a, 0.05, b, M.wood, 0, 0.36); B(g, a - 0.2, 0.36, b - 0.2, M.woodDark); B(g, 0.2, 0.06, 0.14, M.book[1], 0.15, 0.41, 0); C(g, 0.06, 0.05, 0.16, M.ceramic, -0.2, 0.41, 0.02); },
  tvunit(g, a, b, M) {
    B(g, a, 0.42, b, M.wood);
    const tw = Math.min(a - 0.2, 1.65);
    B(g, tw, tw * 0.56, 0.05, M.screen, 0, 0.95, -b / 2 + 0.08);
    C(g, 0.05, 0.07, 0.3, M.ceramic, a / 2 - 0.2, 0.42, 0);
  },
  lamp(g, a, b, M) { C(g, 0.13, 0.15, 0.03, M.black); C(g, 0.015, 0.015, 1.45, M.black, 0, 0.03); C(g, 0.17, 0.22, 0.3, M.shade, 0, 1.45); },
  plant(g, a, b, M) { const r = Math.min(a, b) / 2; C(g, r * 0.7, r * 0.55, 0.42, M.pot); S(g, r * 0.95, M.plant, 0, 0.85, 0, 1, 1.3); S(g, r * 0.65, M.plant2, r * 0.25, 1.15, -r * 0.1, 1); },
  rug(g, a, b, M) { B(g, a, 0.012, b, M.rug, 0, 0, 0, false); },
  table(g, a, b, M, it, env) {
    B(g, a, 0.05, b, M.wood, 0, 0.72);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.06, 0.72, 0.06, M.woodDark, sx * (a / 2 - 0.1), 0, sz * (b / 2 - 0.1));
    if (it.pendant && env.ceiling) {
      const n = a > 1.8 ? 3 : 2;
      const long = a >= b ? 'x' : 'z';
      for (let i = 0; i < n; i++) {
        const off = ((i + 0.5) / n - 0.5) * (long === 'x' ? a : b) * 0.8;
        const x = long === 'x' ? off : 0, z = long === 'x' ? 0 : off;
        C(g, 0.005, 0.005, env.ceiling - 1.62, M.black, x, 1.62, z, 4);
        C(g, 0.04, 0.17, 0.2, M.metal, x, 1.45, z);
        C(g, 0.1, 0.1, 0.02, M.shade, x, 1.44, z);
      }
    }
    C(g, 0.08, 0.06, 0.22, M.ceramic, 0, 0.77, 0);
  },
  rtable(g, a, b, M) { C(g, a / 2, a / 2, 0.04, M.wood, 0, 0.72, 0, 28); C(g, 0.05, 0.25, 0.72, M.woodDark); },
  dchair(g, a, b, M) {
    B(g, a * 0.9, 0.05, b * 0.88, M.wood, 0, 0.45, 0.02);
    B(g, a * 0.9, 0.42, 0.04, M.wood, 0, 0.5, -b / 2 + 0.04);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.035, 0.45, 0.035, M.woodDark, sx * (a * 0.42), 0, sz * (b * 0.4));
  },
  chair(g, a, b, M, it) {
    const m = it.outdoor ? M.outdoor : M.fabric2;
    B(g, a * 0.85, 0.07, b * 0.85, m, 0, 0.46, 0);
    B(g, a * 0.85, 0.45, 0.05, m, 0, 0.53, -b / 2 + 0.05);
    C(g, 0.025, 0.025, 0.46, M.metal); C(g, 0.22, 0.22, 0.02, M.metal, 0, 0, 0, 5);
  },
  desk(g, a, b, M) {
    B(g, a, 0.035, b, M.wood, 0, 0.72);
    B(g, 0.04, 0.72, b - 0.05, M.metal, -a / 2 + 0.04); B(g, 0.04, 0.72, b - 0.05, M.metal, a / 2 - 0.04);
    B(g, 0.55, 0.32, 0.025, M.screen, 0, 0.9, -b / 2 + 0.12); B(g, 0.08, 0.17, 0.05, M.metal, 0, 0.755, -b / 2 + 0.12);
    C(g, 0.07, 0.09, 0.03, M.black, a / 2 - 0.2, 0.755, -b / 2 + 0.15); C(g, 0.01, 0.01, 0.35, M.black, a / 2 - 0.2, 0.78, -b / 2 + 0.15, 4);
  },
  sideboard(g, a, b, M) { B(g, a, 0.78, b, M.wood); B(g, a, 0.08, b - 0.05, M.woodDark, 0, 0, 0.0); C(g, 0.08, 0.06, 0.3, M.ceramic, -a / 4, 0.78, 0); S(g, 0.12, M.plant, a / 4, 0.95, 0, 0); },
  console(g, a, b, M) { B(g, a, 0.04, b, M.wood, 0, 0.8); B(g, 0.04, 0.8, b, M.metal, -a / 2 + 0.02); B(g, 0.04, 0.8, b, M.metal, a / 2 - 0.02); B(g, a * 0.6, 0.6, 0.02, M.mirror, 0, 1.15, -b / 2 + 0.01); C(g, 0.06, 0.08, 0.25, M.ceramic, a / 3, 0.84, 0); },
  bench(g, a, b, M) { B(g, a, 0.06, b, M.wood, 0, 0.4); B(g, 0.05, 0.4, b - 0.04, M.woodDark, -a / 2 + 0.06); B(g, 0.05, 0.4, b - 0.04, M.woodDark, a / 2 - 0.06); },
  counter(g, a, b, M, it) {
    B(g, a, 0.1, b - 0.08, M.black, 0, 0, -0.04, false);
    B(g, a, 0.76, b - 0.02, M.cabinet, 0, 0.1, -0.01);
    B(g, a, 0.04, b + 0.02, M.counterTop, 0, 0.86, 0.01);
    const n = Math.max(1, Math.round(a / 0.6));
    for (let i = 1; i < n; i++) B(g, 0.006, 0.7, 0.01, M.black, -a / 2 + (a / n) * i, 0.13, b / 2, false);
    if (it.sink != null) { const x = (it.sink - 0.5) * a; B(g, Math.min(0.7, a - 0.1), 0.012, 0.42, M.steel, x, 0.9, 0.02, false); C(g, 0.015, 0.02, 0.32, M.steel, x, 0.9, -b / 2 + 0.1, 8); }
    if (it.hob != null) { const x = (it.hob - 0.5) * a; B(g, Math.min(0.75, a - 0.1), 0.012, 0.5, M.screen, x, 0.9, 0.0, false); if (it.uppers !== false) B(g, 0.8, 0.45, 0.45, M.steel, x, 1.6, -b / 2 + 0.225); }
    if (it.uppers) {
      const hx = it.hob != null ? (it.hob - 0.5) * a : null;
      // upper cabinets except above the hood
      const segs = hx == null ? [[-a / 2, a / 2]] : [[-a / 2, hx - 0.42], [hx + 0.42, a / 2]];
      for (const [s, e] of segs) if (e - s > 0.3) B(g, e - s, 0.72, 0.35, M.cabinet, (s + e) / 2, 1.45, -b / 2 + 0.175);
    }
  },
  island(g, a, b, M) {
    B(g, a, 0.88, b - 0.3, M.cabinet2, 0, 0, -0.15);
    B(g, a + 0.08, 0.05, b + 0.02, M.counterTop, 0, 0.88, 0.0);
    C(g, 0.08, 0.06, 0.2, M.ceramic, a / 3, 0.93, -0.1);
    S(g, 0.1, M.plant2, -a / 3, 1.0, -0.1, 0);
  },
  stool(g, a, b, M) { C(g, 0.18, 0.18, 0.05, M.wood, 0, 0.66); C(g, 0.02, 0.02, 0.66, M.metal); C(g, 0.16, 0.16, 0.015, M.metal, 0, 0.25); C(g, 0.18, 0.18, 0.015, M.metal); },
  fridge(g, a, b, M) { B(g, a - 0.02, 2.05, b - 0.02, M.steel); B(g, 0.02, 0.6, 0.04, M.black, a / 2 - 0.12, 1.2, b / 2); B(g, 0.02, 0.4, 0.04, M.black, a / 2 - 0.12, 0.5, b / 2); B(g, a - 0.02, 0.01, 0.01, M.black, 0, 0.95, b / 2, false); },
  tall(g, a, b, M) { B(g, a, 2.1, b, M.cabinet); B(g, 0.008, 2.0, 0.01, M.black, 0, 0.05, b / 2, false); },
  toilet(g, a, b, M) {
    const bowl = C(g, 0.2, 0.16, 0.4, M.ceramic, 0, 0, 0.06, 20); bowl.scale.z = 1.25;
    B(g, 0.38, 0.36, 0.17, M.ceramic, 0, 0.42, -b / 2 + 0.09);
    const seat = C(g, 0.21, 0.21, 0.03, M.ceramic, 0, 0.4, 0.06, 20); seat.scale.z = 1.25;
  },
  vanity(g, a, b, M, it) {
    B(g, a, 0.5, b, M.wood, 0, 0.3);
    B(g, a + 0.02, 0.04, b + 0.02, M.counterTop, 0, 0.8);
    const n = it.double ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i ? 1 : -1) * a / 4;
      const bs = C(g, 0.2, 0.15, 0.12, M.ceramic, x, 0.84, 0.03, 20); bs.scale.z = 0.8;
      C(g, 0.012, 0.012, 0.22, M.steel, x, 0.84, -b / 2 + 0.06, 8);
    }
    B(g, a * 0.92, 0.85, 0.02, M.mirror, 0, 1.15, -b / 2 + 0.01);
  },
  basin(g, a, b, M) { C(g, 0.06, 0.06, 0.8, M.ceramic, 0, 0, 0.02, 12); const bs = C(g, 0.2, 0.14, 0.12, M.ceramic, 0, 0.78, 0.02, 20); bs.scale.z = 0.8; B(g, 0.35, 0.5, 0.02, M.mirror, 0, 1.1, -b / 2 + 0.01); },
  tub(g, a, b, M) { B(g, a, 0.56, b, M.ceramic); B(g, a - 0.14, 0.01, b - 0.14, M.water, 0, 0.5, 0, false); C(g, 0.015, 0.015, 0.2, M.steel, 0, 0.56, -b / 2 + 0.05, 8); },
  shower(g, a, b, M) {
    B(g, a, 0.04, b, M.ceramic);
    B(g, a * 0.65, 2.0, 0.012, M.glass, -a * 0.175, 0.04, b / 2 - 0.01, false);
    C(g, 0.1, 0.1, 0.012, M.steel, 0, 2.1, -b / 2 + 0.25, 16);
    C(g, 0.012, 0.012, 1.1, M.steel, 0, 1.0, -b / 2 + 0.03, 6);
  },
  shelf(g, a, b, M, it) {
    const h = b > 0.5 ? 1.9 : 2.0;
    B(g, 0.03, h, b, M.wood, -a / 2 + 0.015); B(g, 0.03, h, b, M.wood, a / 2 - 0.015);
    const n = 5;
    for (let i = 0; i <= n; i++) B(g, a - 0.03, 0.025, b, M.wood, 0, (h - 0.03) * (i / n));
    let seed = Math.round(a * 1000 + b * 77);
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      let x = -a / 2 + 0.05;
      while (x < a / 2 - 0.12) {
        const w = 0.03 + r() * 0.05; const hh = 0.18 + r() * 0.12;
        if (r() > 0.25) B(g, w, hh, b * 0.8, M.book[Math.floor(r() * M.book.length)], x + w / 2, (h - 0.03) * (i / n) + 0.025, 0, false);
        x += w + (r() > 0.85 ? 0.2 : 0.005);
      }
    }
  },
  washer(g, a, b, M, it) {
    B(g, a - 0.02, 0.86, b - 0.02, M.white);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24), it.dryer ? M.black : M.screen);
    d.rotation.x = Math.PI / 2; d.position.set(0, 0.45, b / 2); g.add(d);
    B(g, a - 0.06, 0.08, 0.01, M.steel, 0, 0.74, b / 2, false);
  },
  car(g, a, b, M, it) {
    const m = carMat(M, it.color || '#3D4B5C');
    B(g, a, 0.55, b, m, 0, 0.25, 0);
    const cab = B(g, a * 0.86, 0.48, b * 0.5, M.screen, 0, 0.78, -b * 0.04);
    cab.scale.x = 1;
    B(g, a * 0.84, 0.04, b * 0.46, m, 0, 1.26, -b * 0.04);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18), M.black);
      w.rotation.z = Math.PI / 2; w.position.set(sx * (a / 2 - 0.1), 0.33, sz * (b * 0.33)); w.castShadow = true; g.add(w);
    }
    B(g, 0.25, 0.08, 0.02, M.shade, -a / 2 + 0.25, 0.6, b / 2, false); B(g, 0.25, 0.08, 0.02, M.shade, a / 2 - 0.25, 0.6, b / 2, false);
  },
  treadmill(g, a, b, M) { B(g, a * 0.75, 0.18, b, M.black); B(g, a * 0.6, 0.02, b * 0.85, M.screen, 0, 0.18, 0.05); B(g, 0.05, 1.1, 0.05, M.metal, -a * 0.35, 0.18, -b / 2 + 0.12); B(g, 0.05, 1.1, 0.05, M.metal, a * 0.35, 0.18, -b / 2 + 0.12); B(g, a * 0.75, 0.25, 0.12, M.black, 0, 1.2, -b / 2 + 0.12); },
  mat(g, a, b, M) { B(g, a, 0.012, b, M.cabinet2, 0, 0, 0, false); },
  mirror(g, a, b, M) { B(g, a, 1.9, 0.03, M.mirror, 0, 0.2, -b / 2 + 0.015); },
  rack(g, a, b, M) { B(g, a, 0.04, b, M.metal, 0, 0.35); B(g, a, 0.04, b, M.metal, 0, 0.7); B(g, 0.04, 0.8, b, M.metal, -a / 2 + 0.02); B(g, 0.04, 0.8, b, M.metal, a / 2 - 0.02); for (let i = 0; i < 4; i++) { const d = C(g, 0.06, 0.06, 0.28, M.black, -a / 2 + 0.2 + i * (a - 0.3) / 3, 0.78, 0, 10); d.rotation.x = Math.PI / 2; d.position.y = 0.82; } },
  screen(g, a, b, M) { const w = Math.min(a, 3); B(g, w, Math.min(w * 0.5625, 1.6), 0.05, M.screen, 0, 0.55, -b / 2 + 0.03); B(g, w * 0.9, 0.12, 0.3, M.black, 0, 0, -b / 2 + 0.2); },
  dresser(g, a, b, M) { B(g, a, 0.9, b, M.wood); B(g, a + 0.02, 0.03, b + 0.02, M.counterTop, 0, 0.9); },
  lounger(g, a, b, M) {
    B(g, a, 0.28, b, M.outdoor);
    B(g, a - 0.06, 0.08, b * 0.65, M.cushion, 0, 0.28, b * 0.15);
    const back = B(g, a - 0.06, 0.08, b * 0.35, M.cushion, 0, 0.42, -b * 0.28); back.rotation.x = 0.6;
  },
  otable(g, a, b, M, it) {
    if (it.round) { C(g, a / 2, a / 2, 0.03, M.outdoor, 0, 0.7, 0, 20); C(g, 0.03, 0.15, 0.7, M.metal); return; }
    B(g, a, 0.04, b, M.outdoor, 0, 0.72);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.05, 0.72, 0.05, M.metal, sx * (a / 2 - 0.08), 0, sz * (b / 2 - 0.08));
    const n = it.chairs || 0;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, along = (Math.floor(i / 2) + 0.5) / Math.ceil(n / 2) - 0.5;
      const cg = new THREE.Group(); MODELS.dchair(cg, 0.48, 0.48, { ...M, wood: M.outdoor, woodDark: M.metal });
      if (a >= b) { cg.position.set(along * a, 0, side * (b / 2 + 0.3)); cg.rotation.y = side > 0 ? Math.PI : 0; }
      else { cg.position.set(side * (a / 2 + 0.3), 0, along * b); cg.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      g.add(cg);
    }
  },
  planter(g, a, b, M) { B(g, a, 0.5, b, M.concrete); S(g, Math.min(a, b) * 0.45, M.plant, 0, 0.75, 0, 1, 0.9); S(g, Math.min(a, b) * 0.3, M.plant2, a * 0.15, 0.95, 0, 1); },
};
