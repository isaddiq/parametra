// ─────────────────────────────────────────────────────────────
//  PARAMETRA · IFC4 exporter (STEP physical file)
//
//  The BIM model is written from the live 3D scene, so what you see in
//  the viewer is what lands in Revit / ArchiCAD / Bonsai / Solibri:
//
//  • Geometry: every mesh is triangulated into IfcTriangulatedFaceSet
//    (IFC4 tessellation), one face set per material, in the exact
//    position, size and shape it has in the 3D view.
//  • Appearance: each material becomes an IfcSurfaceStyle with colour,
//    transparency, roughness and reflectance, plus its texture embedded
//    as an IfcBlobTexture with per-vertex UVs (IfcIndexedTriangleTexture
//    Map). The surface colour is the texture's average, so viewers that
//    ignore textures still show the right colours.
//  • Semantics: build code tags scene objects with `userData.ifc`
//    ({ cls, name, type, ... }) so they export as IfcWall, IfcSlab, IfcDoor,
//    IfcWindow, IfcRoof, IfcStair, IfcRailing, IfcCovering, IfcFurniture,
//    IfcSanitaryTerminal, IfcGeographicElement (trees, lawn), etc. Doors
//    and windows void and fill their host walls; furniture sits in its
//    IfcSpace; materials are attached as IfcMaterial with styles.
//  • Spatial structure Project › Site › Building › Storeys › Spaces, with
//    true north, property sets and base quantities.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { compass } from './engine.js';

// ── STEP encoding helpers ────────────────────────────────────
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function fnv(str, seed) { let h = seed >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Deterministic IFC GlobalId (22 chars, 128 bits) so re-exports keep the same ids. */
function guidOf(str) {
  const w = [fnv(str, 2166136261), fnv(str, 0x9e3779b9), fnv(str, 0x85ebca6b), fnv(str, 0xc2b2ae35)];
  const n = (BigInt(w[0]) << 96n) | (BigInt(w[1]) << 64n) | (BigInt(w[2]) << 32n) | BigInt(w[3]);
  let s = B64[Number(n >> 126n)];
  for (let i = 0; i < 21; i++) s += B64[Number((n >> BigInt(120 - 6 * i)) & 63n)];
  return s;
}
/** IFC REAL: rounded to 0.1 mm, always with a decimal point. */
const R = (v) => { const x = Math.round(v * 1e4) / 1e4; const s = String(x === 0 ? 0 : x); return /[.eE]/.test(s) ? s : `${s}.`; };
/** IFC STRING with ISO 10303-21 escaping (non-ASCII as \X2\…\X0\). */
function S(s) {
  let o = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "'") o += "''";
    else if (ch === '\\') o += '\\\\';
    else if (c >= 32 && c <= 126) o += ch;
    else if (c <= 0xffff) o += `\\X2\\${c.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`;
  }
  return `'${o}'`;
}
const E = (v) => `.${v}.`;

// ── colour + texture baking ──────────────────────────────────
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const l2s = (v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0'));
function b64ToHex(b64) {
  const bin = atob(b64); const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = HEX[bin.charCodeAt(i)];
  return out.join('');
}

const TEX_MAX = 512;
const bakeCache = new WeakMap();
/**
 * Render a texture's image as it appears on screen (tinted by the material
 * colour, rows in X3D/IFC order with t=0 at the bottom) and encode it.
 * Returns { format, hex, avg: [r,g,b] sRGB 0..1, alpha }.
 */
function bakeTexture(map, color) {
  const img = map?.image;
  if (!img || !img.width || !img.height) return null;
  const tint = color ? [color.r, color.g, color.b] : [1, 1, 1]; // linear working space
  const key = tint.map((v) => v.toFixed(4)).join(',');
  let per = bakeCache.get(img);
  if (!per) { per = new Map(); bakeCache.set(img, per); }
  if (per.has(key)) return per.get(key);

  const sw = img.width, sh = img.height, k = Math.min(1, TEX_MAX / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * k)), th = Math.max(1, Math.round(sh * k));
  const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (img.data) {
    // DataTexture: rows are stored bottom-up (v=0 first) and flipY is off
    const src = document.createElement('canvas'); src.width = sw; src.height = sh;
    const id = new ImageData(sw, sh);
    for (let y = 0; y < sh; y++) id.data.set(img.data.subarray((sh - 1 - y) * sw * 4, (sh - y) * sw * 4), y * sw * 4);
    src.getContext('2d').putImageData(id, 0, 0);
    ctx.drawImage(src, 0, 0, tw, th);
  } else {
    ctx.drawImage(img, 0, 0, tw, th);
  }
  const id = ctx.getImageData(0, 0, tw, th), p = id.data;
  const white = tint.every((v) => Math.abs(v - 1) < 1e-3);
  let ar = 0, ag = 0, ab = 0, an = 0, alpha = false;
  for (let i = 0; i < p.length; i += 4) {
    const r = S2L[p[i]] * tint[0], g = S2L[p[i + 1]] * tint[1], b = S2L[p[i + 2]] * tint[2];
    if (!white) { p[i] = Math.round(l2s(r) * 255); p[i + 1] = Math.round(l2s(g) * 255); p[i + 2] = Math.round(l2s(b) * 255); }
    if (p[i + 3] < 250) alpha = true;
    if (p[i + 3] > 128) { ar += r; ag += g; ab += b; an++; }
  }
  if (!white) ctx.putImageData(id, 0, 0);
  an = Math.max(1, an);
  const url = cv.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.85);
  const res = { format: alpha ? 'PNG' : 'JPG', hex: b64ToHex(url.slice(url.indexOf(',') + 1)), avg: [l2s(ar / an), l2s(ag / an), l2s(ab / an)], alpha };
  per.set(key, res);
  return res;
}

// ── semantic tags for furniture (used by the 3D builder) ─────
const FURN = {
  bed: ['IfcFurniture', 'BED', 'Bed'],
  nightstand: ['IfcFurniture', 'USERDEFINED', 'Bedside table'],
  wardrobe: ['IfcFurniture', 'USERDEFINED', 'Wardrobe'],
  sofa: ['IfcFurniture', 'SOFA', 'Sofa'],
  armchair: ['IfcFurniture', 'CHAIR', 'Armchair'],
  coffee: ['IfcFurniture', 'TABLE', 'Coffee table'],
  tvunit: ['IfcFurniture', 'USERDEFINED', 'TV unit'],
  lamp: ['IfcLightFixture', 'POINTSOURCE', 'Floor lamp'],
  plant: ['IfcFurniture', 'USERDEFINED', 'Indoor plant'],
  rug: ['IfcFurniture', 'USERDEFINED', 'Rug'],
  table: ['IfcFurniture', 'TABLE', 'Dining table'],
  rtable: ['IfcFurniture', 'TABLE', 'Round table'],
  dchair: ['IfcFurniture', 'CHAIR', 'Dining chair'],
  chair: ['IfcFurniture', 'CHAIR', 'Chair'],
  desk: ['IfcFurniture', 'DESK', 'Desk'],
  sideboard: ['IfcFurniture', 'USERDEFINED', 'Sideboard'],
  console: ['IfcFurniture', 'TABLE', 'Console table'],
  bench: ['IfcFurniture', 'USERDEFINED', 'Bench'],
  counter: ['IfcFurniture', 'USERDEFINED', 'Kitchen counter'],
  island: ['IfcFurniture', 'USERDEFINED', 'Kitchen island'],
  stool: ['IfcFurniture', 'CHAIR', 'Bar stool'],
  fridge: ['IfcElectricAppliance', 'REFRIGERATOR', 'Refrigerator'],
  tall: ['IfcFurniture', 'USERDEFINED', 'Tall cabinet'],
  toilet: ['IfcSanitaryTerminal', 'TOILETPAN', 'WC'],
  vanity: ['IfcSanitaryTerminal', 'WASHHANDBASIN', 'Vanity basin'],
  basin: ['IfcSanitaryTerminal', 'WASHHANDBASIN', 'Basin'],
  tub: ['IfcSanitaryTerminal', 'BATH', 'Bath'],
  shower: ['IfcSanitaryTerminal', 'SHOWER', 'Shower'],
  shelf: ['IfcFurniture', 'SHELF', 'Bookshelf'],
  washer: ['IfcElectricAppliance', 'WASHINGMACHINE', 'Washing machine'],
  car: ['IfcBuildingElementProxy', 'USERDEFINED', 'Car'],
  treadmill: ['IfcFurniture', 'USERDEFINED', 'Treadmill'],
  mat: ['IfcFurniture', 'USERDEFINED', 'Exercise mat'],
  mirror: ['IfcFurniture', 'USERDEFINED', 'Mirror'],
  rack: ['IfcFurniture', 'USERDEFINED', 'Weights rack'],
  screen: ['IfcFurniture', 'USERDEFINED', 'Projection screen'],
  dresser: ['IfcFurniture', 'USERDEFINED', 'Dresser'],
  lounger: ['IfcFurniture', 'USERDEFINED', 'Sun lounger'],
  otable: ['IfcFurniture', 'TABLE', 'Outdoor dining set'],
  planter: ['IfcFurniture', 'USERDEFINED', 'Planter'],
};
/** IFC tag for a furniture item placed in room `space` (room id). */
export function furnitureTag(it, space = null) {
  let [cls, type, name] = FURN[it.t] || ['IfcFurniture', 'USERDEFINED', it.t];
  if (it.t === 'washer' && it.dryer) { type = 'TUMBLEDRYER'; name = 'Tumble dryer'; }
  if (it.t === 'wardrobe' && it.open) name = 'Open wardrobe';
  return { cls, type, name, objectType: type === 'USERDEFINED' ? name : null, space };
}

// ── exporter ─────────────────────────────────────────────────
/**
 * @param d       design (as returned by the engine)
 * @param viewer  Viewer3D that currently shows `d`
 */
export function exportIFC(d, viewer) {
  if (!viewer || viewer.design !== d) throw new Error('IFC export needs the 3D view of this design');
  const L = [];
  let n = 0;
  const add = (t) => { n += 1; L.push(`#${n}=${t};`); return `#${n}`; };
  const seed = `parametra|${d.name}|${d.letter}|${d.styleKey}|${d.W}|${d.D}|${d.nFloors}`;
  let gn = 0;
  const gid = () => S(guidOf(`${seed}|${++gn}`));
  const pt3 = (x, y, z) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`);
  const dir = (...v) => add(`IFCDIRECTION((${v.map(R).join(',')}))`);

  // header entities
  const person = add("IFCPERSON($,$,'Parametra user',$,$,$,$,$)");
  const org = add("IFCORGANIZATION($,'Parametra',$,$,$)");
  const app = add(`IFCAPPLICATION(${org},'2.0','Parametra','Parametra')`);
  const stamp = Math.floor(Date.now() / 1000);
  const OH = add(`IFCOWNERHISTORY(${add(`IFCPERSONANDORGANIZATION(${person},${org},$)`)},${app},$,.ADDED.,${stamp},$,$,${stamp})`);

  const origin = pt3(0, 0, 0);
  const zAxis = dir(0, 0, 1), xAxis = dir(1, 0, 0);
  const wcs = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const A = { N: 0, E: 90, S: 180, W: 270 }[compass('N', d.brief.street)] * (Math.PI / 180);
  const north = dir(-Math.sin(A), Math.cos(A));
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},${north})`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT((${[
    'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)', 'IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)',
    'IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)', 'IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)',
  ].map(add).join(',')}))`);
  const project = add(`IFCPROJECT(${gid()},${OH},${S(`Parametra ${d.name || ''}`.trim())},${S(`Option ${d.letter} - ${d.style.name}`)},$,$,$,(${ctx}),${units})`);

  // spatial structure
  const s = d.site;
  const sitePl = add(`IFCLOCALPLACEMENT($,${wcs})`);
  const site = add(`IFCSITE(${gid()},${OH},'Site',${S(`${d.brief.plotW} x ${d.brief.plotD} m plot`)},$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = add(`IFCLOCALPLACEMENT(${sitePl},${add(`IFCAXIS2PLACEMENT3D(${pt3(s.ox, s.oy, 0)},$,$)`)})`);
  const bld = add(`IFCBUILDING(${gid()},${OH},${S(`${d.name} - ${d.style.name} house`)},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES(${gid()},${OH},$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES(${gid()},${OH},$,$,${site},(${bld}))`);
  const storeys = [], storeyPl = [];
  for (let k = 0; k < d.nFloors; k++) {
    const z = viewer.elev(k);
    storeyPl[k] = add(`IFCLOCALPLACEMENT(${bldPl},${add(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, z)},$,$)`)})`);
    storeys[k] = add(`IFCBUILDINGSTOREY(${gid()},${OH},${S(k === 0 ? 'Ground Floor' : `Level ${k}`)},$,$,${storeyPl[k]},$,$,.ELEMENT.,${R(z)})`);
  }
  add(`IFCRELAGGREGATES(${gid()},${OH},$,$,${bld},(${storeys.join(',')}))`);
  const containerPl = (c) => (c === 'site' ? sitePl : storeyPl[c]);
  const contained = new Map(); // spatial element -> [products]
  const contain = (where, ent) => { if (!contained.has(where)) contained.set(where, []); contained.get(where).push(ent); };

  // property sets / quantities
  const val = (v) => {
    if (typeof v === 'boolean') return `IFCBOOLEAN(${v ? '.T.' : '.F.'})`;
    if (typeof v === 'string') return `IFCLABEL(${S(v)})`;
    if (Number.isInteger(v)) return `IFCINTEGER(${v})`;
    if (v && v.t) return `${v.t.toUpperCase()}(${R(v.v)})`;
    return `IFCREAL(${R(v)})`;
  };
  const props = (ent, tag) => {
    for (const [name, list] of Object.entries(tag.pset || {})) {
      const ps = Object.entries(list).filter(([, v]) => v != null).map(([k, v]) => add(`IFCPROPERTYSINGLEVALUE(${S(k)},$,${val(v)},$)`));
      if (!ps.length) continue;
      add(`IFCRELDEFINESBYPROPERTIES(${gid()},${OH},$,$,(${ent}),${add(`IFCPROPERTYSET(${gid()},${OH},${S(name)},$,(${ps.join(',')}))`)})`);
    }
    for (const [name, list] of Object.entries(tag.qto || {})) {
      const qs = Object.entries(list).filter(([, v]) => v && v[0] > 0).map(([k, [v, kind]]) => (kind === 'area'
        ? add(`IFCQUANTITYAREA(${S(k)},$,$,${R(v)},$)`)
        : kind === 'vol' ? add(`IFCQUANTITYVOLUME(${S(k)},$,$,${R(v)},$)`) : add(`IFCQUANTITYLENGTH(${S(k)},$,$,${R(v)},$)`)));
      if (!qs.length) continue;
      add(`IFCRELDEFINESBYPROPERTIES(${gid()},${OH},$,$,(${ent}),${add(`IFCELEMENTQUANTITY(${gid()},${OH},${S(name)},$,$,(${qs.join(',')}))`)})`);
    }
  };
  props(bld, { pset: { Pset_BuildingCommon: { NumberOfStoreys: d.nFloors, GrossPlannedArea: { t: 'IfcAreaMeasure', v: d.metrics?.gross ?? d.floors.reduce((a, f) => a + f.rooms.reduce((b, r) => b + r.w * r.h, 0), 0) } } } });

  // ── materials → surface styles + IfcMaterial ───────────────
  const styles = new Map(); // THREE.Material -> { ent, tex, mat, name }
  const usedNames = new Map();
  const matName = (m) => {
    let base = m.name || `${m.map?.userData?.kind ? `${m.map.userData.kind[0].toUpperCase()}${m.map.userData.kind.slice(1)}` : 'Colour'} #${m.color ? m.color.getHexString() : 'ffffff'}`;
    const seen = usedNames.get(base) || 0; usedNames.set(base, seen + 1);
    return seen ? `${base} (${seen + 1})` : base;
  };
  const styleFor = (m) => {
    if (styles.has(m)) return styles.get(m);
    const name = matName(m);
    let col = m.color ? [l2s(m.color.r), l2s(m.color.g), l2s(m.color.b)] : [0.8, 0.8, 0.8];
    let texEnt = null;
    const baked = m.map ? bakeTexture(m.map, m.color) : null;
    if (baked) {
      col = baked.avg;
      texEnt = add(`IFCBLOBTEXTURE(.T.,.T.,'REPLACE',$,$,'${baked.format}',"0${baked.hex}")`);
    }
    const c = add(`IFCCOLOURRGB(${S(name)},${R(col[0])},${R(col[1])},${R(col[2])})`);
    const rough = m.roughness ?? 0.8, metal = m.metalness ?? 0;
    const transp = m.transparent ? Math.min(0.95, Math.max(0, 1 - (m.opacity ?? 1))) : 0;
    const method = transp > 0.3 ? 'GLASS' : metal > 0.9 && rough < 0.1 ? 'MIRROR' : metal >= 0.5 ? 'METAL' : rough < 0.35 ? 'PLASTIC' : 'MATT';
    const spec = metal >= 0.5 ? 0.6 + 0.4 * metal * (1 - rough) : 0.5 * (1 - rough);
    const rend = add(`IFCSURFACESTYLERENDERING(${c},${R(transp)},${c},$,$,$,IFCNORMALISEDRATIOMEASURE(${R(spec)}),IFCSPECULARROUGHNESS(${R(Math.min(1, Math.max(0, rough)))}),${E(method)})`);
    const parts = [rend];
    if (texEnt) parts.push(add(`IFCSURFACESTYLEWITHTEXTURES((${texEnt}))`));
    const ent = add(`IFCSURFACESTYLE(${S(name)},${m.side === THREE.DoubleSide ? '.BOTH.' : '.POSITIVE.'},(${parts.join(',')}))`);
    const mat = add(`IFCMATERIAL(${S(name)},$,$)`);
    add(`IFCMATERIALDEFINITIONREPRESENTATION($,$,(${add(`IFCSTYLEDREPRESENTATION(${ctx},'Style','Material',(${add(`IFCSTYLEDITEM($,(${ent}),${S(name)})`)}))`)}),${mat})`);
    const out = { ent, tex: texEnt, mat, name };
    styles.set(m, out);
    return out;
  };

  // ── walk the scene ─────────────────────────────────────────
  const cx = viewer.cx, cy = viewer.cy;
  const elements = new Map(); // tag key -> element
  const fallback = new Map();
  let untagged = 0;
  const elementFor = (tag, container) => {
    const key = tag.key ?? tag;
    let el = elements.get(key);
    if (!el) { el = { tag, container, parts: new Map(), min: [Infinity, Infinity, Infinity] }; elements.set(key, el); }
    return el;
  };
  const M4 = new THREE.Matrix4(), IM = new THREE.Matrix4(), V = new THREE.Vector3(), UVV = new THREE.Vector2();
  const addMesh = (mesh, c) => {
    const geo = mesh.userData.ifcGeometry || mesh.geometry;
    const pos = geo?.attributes?.position;
    if (!pos || c.container == null) return;
    const uvA = geo.attributes.uv, idx = geo.index;
    const multi = Array.isArray(mesh.material);
    const mats = multi ? mesh.material : [mesh.material];
    const total = idx ? idx.count : pos.count;
    const groups = multi && geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const off = c.container === 'site' ? [s.ox, s.oy, 0] : [0, 0, -viewer.elev(c.container)];
    const nInst = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < nInst; i++) {
      let tag = mesh.userData.instanceIfc?.[i] || c.tag;
      if (!tag) {
        if (!fallback.has(mesh)) { fallback.set(mesh, { cls: 'IfcBuildingElementProxy', type: 'NOTDEFINED', name: mesh.name || 'Element' }); untagged++; }
        tag = fallback.get(mesh);
      }
      if (tag.skip) continue;
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, IM); M4.multiplyMatrices(mesh.matrixWorld, IM); } else M4.copy(mesh.matrixWorld);
      const mirrored = M4.determinant() < 0;
      const el = elementFor(tag, c.container);
      for (const g of groups) {
        const m = mats[g.materialIndex ?? 0];
        if (!m || m.visible === false) continue;
        let part = el.parts.get(m);
        if (!part) { part = { m, P: [], T: [], UV: m.map ? [] : null }; el.parts.set(m, part); }
        let uvT = null;
        if (m.map && uvA) { m.map.updateMatrix(); uvT = m.map.matrix; }
        const flip = mirrored !== (m.side === THREE.BackSide);
        const remap = new Map();
        const end = Math.min(g.start + g.count, total);
        for (let t = g.start; t + 2 < end; t += 3) {
          const tri = [0, 0, 0];
          for (let q = 0; q < 3; q++) {
            const vi = idx ? idx.getX(t + q) : t + q;
            let li = remap.get(vi);
            if (li === undefined) {
              V.fromBufferAttribute(pos, vi).applyMatrix4(M4);
              const X = V.x + cx + off[0], Y = cy - V.z + off[1], Z = V.y + off[2];
              li = part.P.length / 3;
              part.P.push(X, Y, Z);
              if (X < el.min[0]) el.min[0] = X; if (Y < el.min[1]) el.min[1] = Y; if (Z < el.min[2]) el.min[2] = Z;
              if (part.UV) {
                if (uvA) { UVV.fromBufferAttribute(uvA, vi); if (uvT) UVV.applyMatrix3(uvT); part.UV.push(UVV.x, UVV.y); } else part.UV.push(0, 0);
              }
              remap.set(vi, li);
            }
            tri[q] = li;
          }
          if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;
          if (flip) part.T.push(tri[0], tri[2], tri[1]); else part.T.push(tri[0], tri[1], tri[2]);
        }
      }
    }
  };
  const walk = (o, c) => {
    if (o.isCSS2DObject || o.userData.ifcSkip) return;
    let cc = c;
    if (o.userData.site) cc = { ...cc, container: 'site' };
    else if (o.isGroup && typeof o.userData.level === 'number') cc = { ...cc, container: o.userData.level };
    if (o.userData.ifc) cc = { ...cc, tag: o.userData.ifc };
    if (o.isMesh) addMesh(o, cc);
    for (const ch of o.children) walk(ch, cc);
  };
  viewer.world.updateMatrixWorld(true);
  walk(viewer.world, { container: null, tag: null });
  if (untagged) console.warn(`IFC export: ${untagged} untagged meshes exported as IfcBuildingElementProxy`);

  // ── spaces ─────────────────────────────────────────────────
  const spaceStyle = add(`IFCSURFACESTYLE('Space',.BOTH.,(${add(`IFCSURFACESTYLERENDERING(${add("IFCCOLOURRGB($,0.55,0.7,0.85)")},0.85,$,$,$,$,$,$,.FLAT.)`)}))`);
  const boxSet = (x0, y0, z0, x1, y1, z1) => {
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const T = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
    return add(`IFCTRIANGULATEDFACESET(${add(`IFCCARTESIANPOINTLIST3D((${P.map((p) => `(${p.map(R).join(',')})`).join(',')}))`)},$,.T.,(${T.map((t) => `(${t.join(',')})`).join(',')}),$)`);
  };
  const tessShape = (items) => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${items.join(',')}))`)}))`);
  const spaces = new Map(); // `${k}|${roomId}` -> ent
  d.floors.forEach((f, k) => {
    const list = [];
    [...f.rooms, ...f.terraces].forEach((r, i) => {
      const ext = r.type === 'terrace';
      const h = ext ? 1.0 : d.ceiling;
      const fs = boxSet(r.x, r.y, 0, r.x + r.w, r.y + r.h, h);
      add(`IFCSTYLEDITEM(${fs},(${spaceStyle}),$)`);
      const sp = add(`IFCSPACE(${gid()},${OH},${S(`${k}${String(i + 1).padStart(2, '0')}`)},${S(r.type)},$,${add(`IFCLOCALPLACEMENT(${storeyPl[k]},${add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)})`)},${tessShape([fs])},${S(r.label)},.ELEMENT.,${E(ext ? 'EXTERNAL' : 'INTERNAL')},$)`);
      spaces.set(`${k}|${r.id}`, sp);
      list.push(sp);
      props(sp, {
        pset: { Pset_SpaceCommon: { IsExternal: ext, Reference: r.type } },
        qto: { Qto_SpaceBaseQuantities: { NetFloorArea: [r.w * r.h, 'area'], GrossFloorArea: [r.w * r.h, 'area'], Height: [h, 'len'], NetPerimeter: [2 * (r.w + r.h), 'len'] } },
      });
    });
    if (list.length) add(`IFCRELAGGREGATES(${gid()},${OH},$,$,${storeys[k]},(${list.join(',')}))`);
  });

  // ── products ───────────────────────────────────────────────
  const entityLine = (tag, g, pl, shape) => {
    const cls = tag.cls;
    const type = tag.type || 'NOTDEFINED';
    const ot = tag.objectType || (type === 'USERDEFINED' ? tag.name : null);
    const head = `${g},${OH},${S(tag.name || cls.slice(3))},${tag.desc ? S(tag.desc) : '$'},${ot ? S(ot) : '$'},${pl},${shape},$`;
    const a = tag.attrs || {};
    switch (cls) {
      case 'IfcCivilElement': return `IFCCIVILELEMENT(${head})`;
      case 'IfcDoor': return `IFCDOOR(${head},${R(a.h)},${R(a.w)},${E(tag.type || 'DOOR')},${E(a.op || 'NOTDEFINED')},$)`;
      case 'IfcWindow': return `IFCWINDOW(${head},${R(a.h)},${R(a.w)},${E(tag.type || 'WINDOW')},${E(a.part || 'NOTDEFINED')},$)`;
      case 'IfcStairFlight': return `IFCSTAIRFLIGHT(${head},${a.risers ?? '$'},${a.treads ?? '$'},${a.riser != null ? R(a.riser) : '$'},${a.tread != null ? R(a.tread) : '$'},${E(type === 'NOTDEFINED' ? 'STRAIGHT' : type)})`;
      default: return `${cls.toUpperCase()}(${head},${E(type)})`;
    }
  };
  const fmtPts = (P, o) => { const a = new Array(P.length / 3); for (let i = 0, j = 0; i < P.length; i += 3, j++) a[j] = `(${R(P[i] - o[0])},${R(P[i + 1] - o[1])},${R(P[i + 2] - o[2])})`; return a.join(','); };
  const fmtUV = (U) => { const a = new Array(U.length / 2); for (let i = 0, j = 0; i < U.length; i += 2, j++) a[j] = `(${R(U[i])},${R(U[i + 1])})`; return a.join(','); };
  const fmtTri = (T) => { const a = new Array(T.length / 3); for (let i = 0, j = 0; i < T.length; i += 3, j++) a[j] = `(${T[i] + 1},${T[i + 1] + 1},${T[i + 2] + 1})`; return a.join(','); };

  const matSets = new Map(); // key -> { rel target, elements }
  const constituentSet = (list) => {
    const key = list.map((x) => x.mat).join(',');
    if (!matSets.has(key)) {
      const target = list.length === 1 ? list[0].mat
        : add(`IFCMATERIALCONSTITUENTSET($,$,(${list.map((x) => add(`IFCMATERIALCONSTITUENT(${S(x.name)},$,${x.mat},$,$)`)).join(',')}))`);
      matSets.set(key, { target, els: [] });
    }
    return matSets.get(key);
  };
  const parents = new Map(); // parent tag -> { container, children: [] }
  const covers = new Map(); // space -> [coverings]
  const written = [];
  for (const el of elements.values()) {
    const parts = [...el.parts.values()].filter((p) => p.T.length);
    if (!parts.length) continue;
    const o = el.min.map((v) => Math.floor(v * 1000) / 1000);
    const relPl = containerPl(el.container);
    const pl = add(`IFCLOCALPLACEMENT(${relPl},${add(`IFCAXIS2PLACEMENT3D(${pt3(o[0], o[1], o[2])},$,$)`)})`);
    const items = [];
    const mats = [];
    for (const p of parts) {
      const st = styleFor(p.m);
      const tri = fmtTri(p.T);
      const fs = add(`IFCTRIANGULATEDFACESET(${add(`IFCCARTESIANPOINTLIST3D((${fmtPts(p.P, o)}))`)},$,$,(${tri}),$)`);
      if (st.tex && p.UV) add(`IFCINDEXEDTRIANGLETEXTUREMAP((${st.tex}),${fs},${add(`IFCTEXTUREVERTEXLIST((${fmtUV(p.UV)}))`)},(${tri}))`);
      add(`IFCSTYLEDITEM(${fs},(${st.ent}),$)`);
      items.push(fs);
      if (!mats.includes(st)) mats.push(st);
    }
    const ent = add(entityLine(el.tag, gid(), pl, tessShape(items)));
    el.ent = ent; el.pl = pl; el.origin = o;
    written.push(el);
    constituentSet(mats).els.push(ent);
    props(ent, el.tag);
    const tag = el.tag;
    if (tag.part) {
      if (!parents.has(tag.part)) parents.set(tag.part, { container: el.container, children: [] });
      parents.get(tag.part).children.push(ent);
    } else if (tag.space != null && tag.cls !== 'IfcCovering' && spaces.has(`${el.container}|${tag.space}`)) {
      contain(spaces.get(`${el.container}|${tag.space}`), ent);
    } else contain(el.container, ent);
    if (tag.cls === 'IfcCovering' && tag.space != null && spaces.has(`${el.container}|${tag.space}`)) {
      const sp = spaces.get(`${el.container}|${tag.space}`);
      if (!covers.has(sp)) covers.set(sp, []);
      covers.get(sp).push(ent);
    }
  }
  // aggregates (roof planes in IfcRoof, flights + landing in IfcStair)
  for (const [ptag, info] of parents) {
    const pl = add(`IFCLOCALPLACEMENT(${containerPl(info.container)},${add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)})`);
    const ent = add(entityLine(ptag, gid(), pl, '$'));
    add(`IFCRELAGGREGATES(${gid()},${OH},$,$,${ent},(${info.children.join(',')}))`);
    props(ent, ptag);
    contain(info.container, ent);
  }
  // openings: void the host wall, filled by the door / window
  for (const el of written) {
    const tag = el.tag;
    if (!tag.host || !tag.opening) continue;
    const host = elements.get(tag.host.key ?? tag.host);
    if (!host || !host.ent) continue;
    const b = tag.opening, ho = host.origin;
    const fs = boxSet(b.x0 - ho[0], b.y0 - ho[1], b.z0 - ho[2], b.x1 - ho[0], b.y1 - ho[1], b.z1 - ho[2]);
    const opl = add(`IFCLOCALPLACEMENT(${host.pl},${add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)})`);
    const op = add(`IFCOPENINGELEMENT(${gid()},${OH},${S(`Opening for ${tag.name}`)},$,$,${opl},${tessShape([fs])},$,.OPENING.)`);
    add(`IFCRELVOIDSELEMENT(${gid()},${OH},$,$,${host.ent},${op})`);
    add(`IFCRELFILLSELEMENT(${gid()},${OH},$,$,${op},${el.ent})`);
  }
  for (const [sp, list] of covers) add(`IFCRELCOVERSSPACES(${gid()},${OH},$,$,${sp},(${list.join(',')}))`);
  for (const { target, els } of matSets.values()) add(`IFCRELASSOCIATESMATERIAL(${gid()},${OH},$,$,(${els.join(',')}),${target})`);
  for (const [where, list] of contained) {
    const struct = where === 'site' ? site : typeof where === 'number' ? storeys[where] : where;
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${gid()},${OH},$,$,(${list.join(',')}),${struct})`);
  }

  const now = new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${S(`parametra-${(d.name || 'design').toLowerCase()}.ifc`)},'${now}',('Parametra'),('Parametra'),'Parametra IFC4 exporter','Parametra','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...L,
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
}
