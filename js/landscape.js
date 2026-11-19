// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Landscape
//  Lawn shader with macro variation, instanced grass tufts,
//  branching trees with leaf-card crowns (alpha cut-outs that cast
//  dappled shadows), shrubs, clipped hedges and style-specific
//  boundary walls and fences. All geometry is procedural.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { tex, leafTex } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.BoxGeometry(1, 1, 1); UNIT.userData.shared = true;
const CARD = new THREE.PlaneGeometry(1, 1); CARD.userData.shared = true;
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

export function boxUV(geo, sx, sy, sz, ox = 0, oy = 0, oz = 0) {
  const uv = geo.attributes.uv;
  const dims = [[sz, sy, oz, oy], [sz, sy, oz, oy], [sx, sz, ox, oz], [sx, sz, ox, oz], [sx, sy, ox, oy], [sx, sy, ox, oy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] + dims[f][2], uv.getY(k) * dims[f][1] + dims[f][3]); }
  uv.needsUpdate = true;
}
function texMat(kind, color, o = {}) {
  return cached(`tm|${kind}|${color}`, () => new THREE.MeshStandardMaterial({ map: tex(kind, color), roughness: 0.9, ...o }));
}
function colorMat(color, o = {}) {
  return cached(`cm|${color}|${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
}
function texturedBox(group, mat, cx, cy, cz, sx, sy, sz, cast = true) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  boxUV(g, sx, sy, sz, cx - sx / 2, cy - sy / 2, cz - sz / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(cx, cy, cz); m.castShadow = cast; m.receiveShadow = true;
  group.add(m); return m;
}

/** Instanced unit boxes (posts, slats, pickets, rails). */
class Boxes {
  constructor(mat) { this.mat = mat; this.a = []; }
  add(cx, cy, cz, sx, sy, sz) { this.a.push([cx, cy, cz, sx, sy, sz]); }
  build(group) {
    if (!this.a.length) return;
    const m = new THREE.InstancedMesh(UNIT, this.mat, this.a.length);
    const M = new THREE.Matrix4();
    this.a.forEach((b, i) => { M.makeScale(b[3], b[4], b[5]); M.setPosition(b[0], b[1], b[2]); m.setMatrixAt(i, M); });
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
}

// ── lawn ────────────────────────────────────────────────────
export function grassMaterial(color) {
  return cached(`lawn|${color}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: tex('grass', color), roughness: 0.97 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGW;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
          float gf(vec2 p){ return gn(p) * 0.55 + gn(p * 2.03) * 0.3 + gn(p * 4.11) * 0.15; }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            // second, rotated sample breaks up visible tiling
            vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * vGW.xz;
            vec4 t2 = texture2D(map, q * 0.173 + vec2(0.37, 0.11));
            diffuseColor.rgb = mix(diffuseColor.rgb, t2.rgb, 0.45);
            float n = gf(vGW.xz * 0.055);
            float m = gf(vGW.xz * 0.21 + 7.3);
            vec3 lush = vec3(0.80, 0.95, 0.74), dry = vec3(1.16, 1.06, 0.74);
            diffuseColor.rgb *= mix(lush, dry, smoothstep(0.42, 0.78, n));
            diffuseColor.rgb *= 0.86 + 0.26 * m;
          }`);
    };
    m.customProgramCacheKey = () => 'lawn-v1';
    return m;
  });
}

let TUFT = null;
function tuftGeometry() {
  if (TUFT) return TUFT;
  const pos = [], col = [], nrm = [];
  const base = new THREE.Color('#2C4620'), mid = new THREE.Color('#5A7F35'), tip = new THREE.Color('#A6BE6A');
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.7, lean = 0.02 + r() * 0.07, h = 0.6 + r() * 0.4, w = 0.006 + r() * 0.005;
    const ox = Math.cos(a) * 0.035 * r(), oz = Math.sin(a) * 0.035 * r();
    const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, h, tz);
    const tc = tip.clone().lerp(mid, r() * 0.6);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tc.r, tc.g, tc.b);
    for (let k = 0; k < 3; k++) nrm.push(0, 1, 0); // lit like the lawn underneath
  }
  TUFT = new THREE.BufferGeometry();
  TUFT.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  TUFT.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  TUFT.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  TUFT.userData.shared = true;
  return TUFT;
}

/** Scatter instanced grass tufts over free lawn inside world-space bounds. */
export function scatterGrass(group, bounds, free, count, rand) {
  if (count <= 0) return;
  const mat = cached('tuft', () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, count);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  let n = 0;
  for (let t = 0; t < count * 3 && n < count; t++) {
    const x = lerp(bounds.x0, bounds.x1, rand()), z = lerp(bounds.z0, bounds.z1, rand());
    if (!free(x, z)) continue;
    q.setFromAxisAngle(UP, rand() * Math.PI * 2);
    const h = 0.09 + rand() * 0.13;
    s.set(0.8 + rand() * 0.8, h, 0.8 + rand() * 0.8);
    p.set(x, 0, z);
    M.compose(p, q, s); mesh.setMatrixAt(n, M);
    const k = 0.78 + rand() * 0.4; c.setRGB(k * (0.96 + rand() * 0.1), k, k * 0.92); mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
}

// ── foliage cards ───────────────────────────────────────────
function leafMat(kind) {
  // emissive driven by the leaf texture fakes light passing through the canopy
  return cached(`leaf|${kind}`, () => new THREE.MeshStandardMaterial({ map: leafTex(kind), emissiveMap: leafTex(kind), emissive: new THREE.Color(0.28, 0.3, 0.24), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.78 }));
}
export class Foliage {
  constructor() { this.b = new Map(); }
  add(kind, x, y, z, size, rx, ry, rz, shade = 1) {
    if (!this.b.has(kind)) this.b.set(kind, []);
    this.b.get(kind).push([x, y, z, size, rx, ry, rz, shade]);
  }
  build(group) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (const [kind, arr] of this.b) {
      const mesh = new THREE.InstancedMesh(CARD, leafMat(kind), arr.length);
      arr.forEach((a, i) => {
        p.set(a[0], a[1], a[2]); e.set(a[4], a[5], a[6]); q.setFromEuler(e); s.set(a[3], a[3], a[3]);
        M.compose(p, q, s); mesh.setMatrixAt(i, M);
        c.setRGB(a[7], a[7], a[7] * 0.97); mesh.setColorAt(i, c);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

// ── trees ───────────────────────────────────────────────────
const SPECIES = {
  oak:       { leaf: 'broad',  bark: ['bark', '#5E4B3C'], h: [5.5, 7.5], trunk: 0.38, r: 0.21, crown: [2.7, 2.1], cards: 300, size: [1.1, 1.6], branches: 6 },
  birch:     { leaf: 'small',  bark: ['birch', '#E8E4DA'], h: [6.5, 8.5], trunk: 0.48, r: 0.12, crown: [1.6, 2.7], cards: 230, size: [0.9, 1.3], branches: 5 },
  maple:     { leaf: 'maple',  bark: ['bark', '#4E3E33'], h: [4.2, 5.6], trunk: 0.36, r: 0.15, crown: [2.4, 1.7], cards: 240, size: [1.0, 1.4], branches: 6 },
  olive:     { leaf: 'olive',  bark: ['bark', '#7A7166'], h: [3.4, 4.4], trunk: 0.4, r: 0.2, crown: [2.4, 1.3], cards: 320, size: [1.1, 1.5], branches: 5 },
  broadleaf: { leaf: 'tropic', bark: ['bark', '#6A5A45'], h: [5, 6.5], trunk: 0.45, r: 0.18, crown: [2.7, 1.9], cards: 220, size: [1.3, 1.9], branches: 6 },
  cypress:   { conifer: 'column', leaf: 'needle', bark: ['bark', '#5A4636'], h: [6.5, 9], r: 0.14, rad: 0.8, cards: 210, size: [0.9, 1.3] },
  pine:      { conifer: 'cone', leaf: 'needle', bark: ['bark', '#5A4636'], h: [7, 10], r: 0.2, rad: 2.2, cards: 300, size: [1.2, 1.8] },
  palm:      { palm: true, bark: ['palmbark', '#9C8A6A'], h: [5, 7.5] },
};
export const GARDEN_SPECIES = {
  minimal: ['oak', 'cypress', 'oak', 'birch'],
  meadow: ['birch', 'oak', 'pine', 'birch'],
  zen: ['maple', 'pine', 'maple'],
  olive: ['olive', 'cypress', 'olive'],
  tropical: ['palm', 'palm', 'broadleaf'],
};
export const STREET_SPECIES = { minimal: 'oak', meadow: 'birch', zen: 'maple', olive: 'olive', tropical: 'palm' };
export const SHRUB_KIND = { minimal: 'shrub', meadow: 'shrub', zen: 'shrub', olive: 'lavender', tropical: 'tropic' };

function barkMat(sp) {
  const S = SPECIES[sp];
  return cached(`bark|${sp}`, () => {
    const t = tex(S.bark[0], S.bark[1]).clone(); t.needsUpdate = true; t.repeat.set(S.palm ? 1 : 2, S.palm ? 10 : 3);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  });
}
/** Merge non-indexed geometries into one (keeps tree limbs to one draw call). */
function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = parts[0].attributes[name].itemSize;
    const total = parts.reduce((s, g) => s + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  geos.forEach((g) => g.dispose());
  return out;
}
function limbGeo(p0, p1, r0, r1, seg = 7) {
  const dir = new THREE.Vector3().subVectors(p1, p0); const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  const m = new THREE.Matrix4().compose(p0.clone().addScaledVector(dir, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function plantTree(sp, x, z, rand, group, foliage, scale = 1) {
  const S = SPECIES[sp] || SPECIES.oak;
  const H = lerp(S.h[0], S.h[1], rand()) * scale;
  if (S.palm) return plantPalm(x, z, H, rand, group);
  const limbs = [];
  const base = new THREE.Vector3(x, 0, z);
  if (S.conifer) {
    const top = new THREE.Vector3(x + (rand() - 0.5) * 0.2, H * 0.92, z + (rand() - 0.5) * 0.2);
    limbs.push(limbGeo(base, top, S.r * scale, 0.03));
    const rad = S.rad * scale * (0.85 + rand() * 0.3);
    const y0 = S.conifer === 'cone' ? H * 0.18 : H * 0.06;
    for (let i = 0; i < S.cards * scale; i++) {
      const t = Math.pow(rand(), 0.85);
      const y = lerp(y0, H, t);
      const prof = S.conifer === 'cone' ? Math.pow(1 - t, 0.95) : Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * (1 - t))), 0.7) * (1 - 0.35 * t);
      const th = rand() * Math.PI * 2, rr = rad * prof * (0.45 + 0.55 * rand());
      const size = lerp(S.size[0], S.size[1], rand()) * (0.55 + 0.45 * prof) * scale;
      const shade = 0.55 + 0.45 * (rr / Math.max(rad * prof, 0.01)) * (0.75 + 0.25 * t);
      foliage.add(S.leaf, x + Math.cos(th) * rr, y, z + Math.sin(th) * rr, size, (rand() - 0.5) * 0.9, -th, -0.25 - rand() * 0.2, shade);
    }
  } else {
    const trunkTop = H * S.trunk;
    const lean = new THREE.Vector3((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4);
    const tt = new THREE.Vector3(x, trunkTop, z).add(lean);
    limbs.push(limbGeo(base, tt, S.r * scale * 1.25, S.r * scale * 0.85, 8));
    const rx = S.crown[0] * scale * (0.85 + rand() * 0.3), ry = S.crown[1] * scale * (0.85 + rand() * 0.3);
    const center = new THREE.Vector3(tt.x, trunkTop + ry * 0.95, tt.z);
    for (let i = 0; i < S.branches; i++) {
      const a = (i / S.branches) * Math.PI * 2 + rand() * 0.8;
      const start = tt.clone().add(new THREE.Vector3(0, -rand() * trunkTop * 0.15, 0));
      const end = new THREE.Vector3(center.x + Math.cos(a) * rx * (0.45 + rand() * 0.35), center.y + ry * (rand() * 0.8 - 0.1), center.z + Math.sin(a) * rx * (0.45 + rand() * 0.35));
      limbs.push(limbGeo(start, end, S.r * scale * 0.55, 0.025, 6));
      const mid = start.clone().lerp(end, 0.55);
      const end2 = mid.clone().add(new THREE.Vector3(Math.cos(a + 1.1) * rx * 0.35, ry * 0.35, Math.sin(a + 1.1) * rx * 0.35));
      limbs.push(limbGeo(mid, end2, S.r * scale * 0.3, 0.02, 5));
    }
    for (let i = 0; i < S.cards * scale; i++) {
      let ux, uy, uz, l;
      do { ux = rand() * 2 - 1; uy = rand() * 2 - 1; uz = rand() * 2 - 1; l = ux * ux + uy * uy + uz * uz; } while (l > 1 || l < 0.01);
      l = Math.sqrt(l); const k = Math.pow(rand(), 0.3) / l; // bias to the crown surface
      ux *= k; uy *= k; uz *= k;
      const size = lerp(S.size[0], S.size[1], rand()) * scale;
      const shade = (0.5 + 0.3 * ((uy + 1) / 2) + 0.25 * Math.min(1, Math.hypot(ux, uy, uz))) * (0.9 + rand() * 0.15);
      foliage.add(S.leaf, center.x + ux * rx, center.y + uy * ry, center.z + uz * rx, size, (rand() - 0.5) * 1.4, Math.atan2(ux, uz) + (rand() - 0.5) * 1.2, rand() * Math.PI, Math.min(1.1, shade));
    }
  }
  const mesh = new THREE.Mesh(mergeGeos(limbs), barkMat(sp));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

let FROND = null;
function frondGeometry() {
  if (FROND) return FROND;
  const L = 3.2, Wd = 1.15;
  const g = new THREE.PlaneGeometry(L, Wd, 12, 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = (x + L / 2) / L;
    const across = y / (Wd / 2);
    pos.setXYZ(i, t * L, t * L * 0.45 - t * t * L * 0.75 - Math.abs(across) * 0.12 * t, y * (1 - t * 0.35));
    uv.setXY(i, (across + 1) / 2, t);
  }
  g.computeVertexNormals();
  g.userData.shared = true;
  FROND = g;
  return g;
}
function plantPalm(x, z, H, rand, group) {
  const lean = (rand() - 0.5) * 1.2, ang = rand() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; const off = Math.sin(t * 1.3) * lean; pts.push(new THREE.Vector3(x + Math.cos(ang) * off, t * H, z + Math.sin(ang) * off)); }
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.15, 8), barkMat('palm'));
  trunk.castShadow = true; trunk.receiveShadow = true; group.add(trunk);
  const top = pts[pts.length - 1];
  const mat = leafMat('frond');
  const n = 11 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(frondGeometry(), mat);
    m.position.copy(top);
    m.rotation.set(0, (i / n) * Math.PI * 2 + rand() * 0.4, (rand() - 0.3) * 0.5, 'YZX');
    const s = 0.8 + rand() * 0.35; m.scale.set(s, s, s);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), colorMat('#5B4A2A'));
  nut.position.copy(top).add(new THREE.Vector3(0, -0.25, 0)); group.add(nut);
}

export function plantShrub(x, z, r, rand, foliage, kind = 'shrub', h = null) {
  const hh = h ?? r * 1.15;
  const n = Math.round(16 + r * r * 42);
  for (let i = 0; i < n; i++) {
    let ux, uy, uz, l;
    do { ux = rand() * 2 - 1; uy = rand() * 2 - 1; uz = rand() * 2 - 1; l = ux * ux + uy * uy + uz * uz; } while (l > 1);
    const yy = (uy * 0.5 + 0.5);
    foliage.add(kind, x + ux * r, Math.max(0.12, yy * hh), z + uz * r, r * (0.55 + rand() * 0.45) + 0.18, (rand() - 0.5) * 1.6, rand() * Math.PI * 2, rand() * Math.PI, 0.55 + 0.45 * yy);
  }
}

/** Clipped hedge: textured box with leaf cards breaking up the silhouette. */
export function hedge(group, foliage, x0, z0, x1, z1, h, w, rand) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (len < 0.5) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mat = cached('hedge', () => new THREE.MeshStandardMaterial({ map: tex('hedge', '#5A7F42'), roughness: 0.95 }));
  texturedBox(group, mat, cx, h / 2, cz, alongX ? len : w, h, alongX ? w : len);
  const n = Math.round(len * 9);
  for (let i = 0; i < n; i++) {
    const t = rand() - 0.5, face = rand();
    let px, py, pz;
    if (face < 0.4) { py = h + 0.02; const o = (rand() - 0.5) * w; px = alongX ? cx + t * len : cx + o; pz = alongX ? cz + o : cz + t * len; }
    else { const side = face < 0.7 ? -1 : 1; py = 0.3 + rand() * (h - 0.3); px = alongX ? cx + t * len : cx + side * w / 2; pz = alongX ? cz + side * w / 2 : cz + t * len; }
    foliage.add('shrub', px, py, pz, 0.32 + rand() * 0.18, (rand() - 0.5) * 2, rand() * 6.3, rand() * 3.1, 0.7 + rand() * 0.3);
  }
}

// ── boundaries ──────────────────────────────────────────────
const BOUNDARY = {
  modern:        { front: { type: 'wall', h: 1.0, mat: ['render', '#E6E4DE'], cap: '#C9C5BC' }, side: { type: 'slatwall', h: 1.8, mat: ['render', '#E6E4DE'], cap: '#C9C5BC', wood: '#8A6340' } },
  scandi:        { front: { type: 'fence', h: 1.1, wood: '#34373A' }, side: { type: 'fence', h: 1.8, wood: '#3B3E40' } },
  japandi:       { front: { type: 'slatwall', h: 1.4, mat: ['render', '#3E3D3A'], cap: '#2E2D2B', wood: '#9A7550' }, side: { type: 'fence', h: 1.8, wood: '#8E6A48' } },
  mediterranean: { front: { type: 'wall', h: 1.2, mat: ['stucco', '#EDE1CA'], cap: '#B65A37' }, side: { type: 'wall', h: 1.9, mat: ['stucco', '#EDE1CA'], cap: '#B65A37' }, hedge: true },
  industrial:    { front: { type: 'wall', h: 1.1, mat: ['brick', '#8A4B35'], cap: '#55585B' }, side: { type: 'wall', h: 1.9, mat: ['brick', '#8A4B35'], cap: '#55585B' } },
  farmhouse:     { front: { type: 'picket', h: 1.0, wood: '#F1EEE7' }, side: { type: 'postrail', h: 1.25, wood: '#E9E5DC' }, hedge: true },
  tropical:      { front: { type: 'wall', h: 1.0, mat: ['stone', '#B5A88F'], cap: '#D8D1C2' }, side: { type: 'wall', h: 1.8, mat: ['render', '#E9E5DC'], cap: '#D3CCBD' } },
};
export const boundarySpec = (key) => BOUNDARY[key] || BOUNDARY.modern;

/**
 * runs: [{ kind: 'front'|'side', axis: 'x'|'z', fixed, a, b, gaps: [[g0, g1]], inward: ±1 }]
 * axis 'x' = the run goes along world X at z = fixed; 'z' = along world Z at x = fixed.
 */
export function buildBoundary(group, styleKey, runs) {
  const spec = boundarySpec(styleKey);
  const posts = new Map();
  const boxes = (key, mat) => { if (!posts.has(key)) posts.set(key, new Boxes(mat)); return posts.get(key); };
  for (const run of runs) {
    const sp = run.kind === 'front' ? spec.front : spec.side;
    let segs = [[run.a, run.b]];
    for (const [g0, g1] of run.gaps || []) segs = segs.flatMap(([s, e]) => (g1 <= s || g0 >= e ? [[s, e]] : [[s, g0], [g1, e]].filter(([p, q]) => q - p > 0.3)));
    const P = (t, off = 0, y = 0) => (run.axis === 'x' ? [t, y, run.fixed + off] : [run.fixed + off, y, t]);
    const B = (t, cy, off, len, sy, thick) => (run.axis === 'x' ? [t, cy, run.fixed + off, len, sy, thick] : [run.fixed + off, cy, t, thick, sy, len]);
    for (const [s, e] of segs) {
      const len = e - s, mid = (s + e) / 2;
      const nPier = Math.max(1, Math.round(len / 3.4));
      const pierAt = Array.from({ length: nPier + 1 }, (_, i) => s + (len * i) / nPier);
      if (sp.type === 'wall' || sp.type === 'slatwall') {
        const wm = texMat(sp.mat[0], sp.mat[1]);
        const cm = colorMat(sp.cap, { roughness: 0.7 });
        const wh = sp.type === 'wall' ? sp.h : 0.55;
        const wb = B(mid, wh / 2, 0, len, wh, 0.2);
        texturedBox(group, wm, wb[0], wb[1], wb[2], wb[3], wb[4], wb[5]);
        const cap = B(mid, wh + 0.03, 0, len + 0.04, 0.06, 0.28);
        texturedBox(group, cm, cap[0], cap[1], cap[2], cap[3], cap[4], cap[5]);
        const pierH = sp.h + 0.15;
        for (const t of pierAt) {
          const pb = B(t, pierH / 2, 0, 0.42, pierH, 0.42);
          texturedBox(group, wm, pb[0], pb[1], pb[2], pb[3], pb[4], pb[5]);
          const pc = B(t, pierH + 0.035, 0, 0.5, 0.07, 0.5);
          texturedBox(group, cm, pc[0], pc[1], pc[2], pc[3], pc[4], pc[5]);
        }
        if (sp.type === 'slatwall') {
          const bat = boxes(`bat|${sp.wood}`, colorMat(sp.wood, { roughness: 0.7 }));
          const sh = sp.h - wh - 0.06, y = wh + 0.06 + sh / 2;
          for (let t = s + 0.25; t < e - 0.2; t += 0.11) bat.add(...B(t, y, 0, 0.045, sh, 0.05));
          const rail = B(mid, sp.h - 0.02, 0, len, 0.04, 0.08);
          bat.add(...rail);
        }
      } else if (sp.type === 'fence') {
        const wood = boxes(`wood|${sp.wood}`, colorMat(sp.wood, { roughness: 0.75 }));
        const n = Math.max(1, Math.round(len / 2.4));
        for (let i = 0; i <= n; i++) wood.add(...B(s + (len * i) / n, (sp.h + 0.08) / 2, 0, 0.09, sp.h + 0.08, 0.09));
        const rows = Math.floor((sp.h - 0.08) / 0.145);
        for (let r = 0; r < rows; r++) wood.add(...B(mid, 0.1 + r * 0.145 + 0.0625, run.inward * 0.06, len, 0.125, 0.022));
        wood.add(...B(mid, sp.h + 0.02, run.inward * 0.03, len + 0.05, 0.04, 0.14));
      } else if (sp.type === 'picket') {
        const wood = boxes(`wood|${sp.wood}`, colorMat(sp.wood, { roughness: 0.6 }));
        const n = Math.max(1, Math.round(len / 2.4));
        for (let i = 0; i <= n; i++) wood.add(...B(s + (len * i) / n, (sp.h + 0.12) / 2, 0, 0.09, sp.h + 0.12, 0.09));
        for (const y of [0.25, sp.h - 0.2]) wood.add(...B(mid, y, run.inward * 0.06, len, 0.07, 0.03));
        for (let t = s + 0.12; t < e - 0.08; t += 0.15) wood.add(...B(t, (sp.h + 0.04) / 2, run.inward * 0.085, 0.07, sp.h - 0.04, 0.02));
      } else if (sp.type === 'postrail') {
        const wood = boxes(`wood|${sp.wood}`, colorMat(sp.wood, { roughness: 0.7 }));
        const n = Math.max(1, Math.round(len / 2.6));
        for (let i = 0; i <= n; i++) wood.add(...B(s + (len * i) / n, sp.h / 2, 0, 0.12, sp.h, 0.12));
        for (const y of [0.35, 0.75, sp.h - 0.12]) wood.add(...B(mid, y, run.inward * 0.07, len, 0.13, 0.04));
      }
      void P;
    }
  }
  for (const b of posts.values()) b.build(group);
  return spec;
}

export function rock(group, x, z, r, rand) {
  const g = new THREE.DodecahedronGeometry(r, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 0.8 + rand() * 0.35; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.6, pos.getZ(i) * k); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, texMat('stone', '#8F8A82', { roughness: 1 }));
  m.position.set(x, r * 0.25, z); m.rotation.y = rand() * 6.3; m.castShadow = true; m.receiveShadow = true;
  group.add(m);
}
