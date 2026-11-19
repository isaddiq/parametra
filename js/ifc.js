// ─────────────────────────────────────────────────────────────
//  PARAMETRA · IFC4 exporter (STEP physical file)
//  Spatial structure Project › Site › Building › Storeys, with
//  IfcWall + IfcOpeningElement voids filled by IfcDoor / IfcWindow,
//  IfcSlab floors/roof and IfcSpace per room. Opens in Revit,
//  ArchiCAD, BlenderBIM/Bonsai, Solibri, xBIM, IFC.js viewers.
// ─────────────────────────────────────────────────────────────
import { T_EXT, T_INT, SLAB, rectUnion } from './engine.js';

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function guid() { let s = B64[Math.floor(Math.random() * 4)]; for (let i = 0; i < 21; i++) s += B64[Math.floor(Math.random() * 64)]; return s; }
const R = (v) => { const n = Math.round(v * 1e5) / 1e5; let s = String(n); if (!/[.eE]/.test(s)) s += '.'; return s; };
const S = (s) => `'${String(s).replace(/'/g, "''").replace(/[^\x20-\x7E]/g, '')}'`;

export function exportIFC(d) {
  const lines = [];
  let id = 0;
  const add = (txt) => { id += 1; lines.push(`#${id}=${txt};`); return `#${id}`; };
  const pt3 = (x, y, z) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`);
  const pt2 = (x, y) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`);
  const dir3 = (x, y, z) => add(`IFCDIRECTION((${R(x)},${R(y)},${R(z)}))`);

  const origin = pt3(0, 0, 0);
  const zAxis = dir3(0, 0, 1), xAxis = dir3(1, 0, 0), yAxis = dir3(0, 1, 0);
  const wcs = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const u1 = add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const u2 = add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)');
  const u3 = add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)');
  const u4 = add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const units = add(`IFCUNITASSIGNMENT((${u1},${u2},${u3},${u4}))`);
  const project = add(`IFCPROJECT('${guid()}',$,${S(`Parametra ${d.name || ''}`)},${S('Parametric residential design')},$,$,$,(${ctx}),${units})`);
  const sitePl = add(`IFCLOCALPLACEMENT($,${wcs})`);
  const site = add(`IFCSITE('${guid()}',$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = add(`IFCLOCALPLACEMENT(${sitePl},${add(`IFCAXIS2PLACEMENT3D(${pt3(d.site.ox, d.site.oy, 0)},$,$)`)})`);
  const bld = add(`IFCBUILDING('${guid()}',$,${S(`${d.style.name} House`)},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${site},(${bld}))`);

  const rectSolid = (cx, cy, w, h, depth, pos3 = null) => {
    const p2 = add(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`);
    const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${p2},${R(w)},${R(h)})`);
    const pos = pos3 || add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    return add(`IFCEXTRUDEDAREASOLID(${prof},${pos},${zAxis},${R(depth)})`);
  };
  const shape = (solid) => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`);
  const place = (rel, x, y, z, rx = 1, ry = 0) => {
    const ax = add(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},${zAxis},${rx === 1 && ry === 0 ? xAxis : rx === 0 && ry === 1 ? yAxis : dir3(rx, ry, 0)})`);
    return add(`IFCLOCALPLACEMENT(${rel},${ax})`);
  };

  const storeys = [];
  d.floors.forEach((f, k) => {
    const z = k * d.H;
    const stPl = place(bldPl, 0, 0, z);
    const storey = add(`IFCBUILDINGSTOREY('${guid()}',$,${S(k === 0 ? 'Ground Floor' : `Level ${k}`)},$,$,${stPl},$,$,.ELEMENT.,${R(z)})`);
    storeys.push(storey);
    const contained = [];
    const spaces = [];

    // walls + openings
    for (const w of f.walls) {
      if (w.type === 'open') continue;
      const ext = w.type === 'ext';
      const t = ext ? T_EXT : T_INT;
      const h = ext ? d.H : d.ceiling;
      const a0 = w.s, len = w.e - w.s;
      const wPl = w.axis === 'h' ? place(stPl, a0, w.c, 0, 1, 0) : place(stPl, w.c, a0, 0, 0, 1);
      const wall = add(`IFCWALL('${guid()}',$,${S(ext ? 'Exterior Wall' : 'Interior Wall')},$,$,${wPl},${shape(rectSolid(len / 2, 0, len, t, h))},$,.${ext ? 'STANDARD' : 'PARTITIONING'}.)`);
      contained.push(wall);
      const ops = f.openings.filter((o) => o.axis === w.axis && Math.abs(o.c - w.c) < 1e-3 && o.s < w.e - 1e-3 && o.e > w.s + 1e-3);
      for (const o of ops) {
        const os = Math.max(o.s, w.s), oe = Math.min(o.e, w.e), ow = oe - os;
        const oh = o.head - o.sill;
        if (ow < 0.2 || oh < 0.2) continue;
        const oPl = place(wPl, os - a0, 0, o.sill);
        const opening = add(`IFCOPENINGELEMENT('${guid()}',$,'Opening',$,$,${oPl},${shape(rectSolid(ow / 2, 0, ow, t + 0.1, oh))},$,.OPENING.)`);
        add(`IFCRELVOIDSELEMENT('${guid()}',$,$,$,${wall},${opening})`);
        const fPl = place(oPl, 0, 0, 0);
        const panel = shape(rectSolid(ow / 2, 0, ow, 0.06, oh));
        let filler;
        if (o.kind === 'window') filler = add(`IFCWINDOW('${guid()}',$,'Window',$,$,${fPl},${panel},$,${R(oh)},${R(ow)},.WINDOW.,.SINGLE_PANEL.,$)`);
        else {
          const op = o.kind === 'slide' ? '.SLIDING_TO_LEFT.' : o.kind === 'double' ? '.DOUBLE_DOOR_SINGLE_SWING.' : o.kind === 'garage' ? '.ROLLINGUP.' : '.SINGLE_SWING_LEFT.';
          const pre = o.kind === 'garage' ? '.GATE.' : '.DOOR.';
          filler = add(`IFCDOOR('${guid()}',$,${S(o.kind === 'front' ? 'Entrance Door' : o.kind === 'garage' ? 'Garage Door' : o.kind === 'slide' ? 'Sliding Door' : 'Door')},$,$,${fPl},${panel},$,${R(oh)},${R(ow)},${pre},${op},$)`);
        }
        add(`IFCRELFILLSELEMENT('${guid()}',$,$,$,${opening},${filler})`);
        contained.push(filler);
      }
    }

    // floor slab
    const enc = f.rooms;
    const slabRects = rectUnion(k === 0 ? enc : [...enc, ...f.terraces, ...d.floors[k - 1].rooms]);
    for (const r of slabRects) {
      const sPl = place(stPl, 0, 0, -SLAB);
      contained.push(add(`IFCSLAB('${guid()}',$,${S(k === 0 ? 'Ground Slab' : 'Floor Slab')},$,$,${sPl},${shape(rectSolid(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, SLAB))},$,.${k === 0 ? 'BASESLAB' : 'FLOOR'}.)`));
    }
    // roof slab on top level
    if (k === d.nFloors - 1) {
      for (const r of rectUnion(enc)) {
        const sPl = place(stPl, 0, 0, d.ceiling);
        const slab = add(`IFCSLAB('${guid()}',$,'Roof Slab',$,$,${sPl},${shape(rectSolid(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, SLAB))},$,.ROOF.)`);
        contained.push(slab);
      }
    }
    // spaces
    for (const r of [...f.rooms, ...f.terraces]) {
      const sPl = place(stPl, 0, 0, 0);
      const sp = add(`IFCSPACE('${guid()}',$,${S(r.id)},${S(r.type)},$,${sPl},${shape(rectSolid(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, r.type === 'terrace' ? 1.0 : d.ceiling))},${S(r.label)},.ELEMENT.,.${r.type === 'terrace' ? 'EXTERNAL' : 'INTERNAL'}.,$)`);
      spaces.push(sp);
      const q = add(`IFCQUANTITYAREA('NetFloorArea',$,$,${R(r.w * r.h)},$)`);
      const eq = add(`IFCELEMENTQUANTITY('${guid()}',$,'Qto_SpaceBaseQuantities',$,$,(${q}))`);
      add(`IFCRELDEFINESBYPROPERTIES('${guid()}',$,$,$,(${sp}),${eq})`);
    }
    if (spaces.length) add(`IFCRELAGGREGATES('${guid()}',$,$,$,${storey},(${spaces.join(',')}))`);
    if (contained.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',$,$,$,(${contained.join(',')}),${storey})`);
  });
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${bld},(${storeys.join(',')}))`);

  const now = new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${S(`parametra-${(d.name || 'design').toLowerCase()}.ifc`)},'${now}',('Parametra'),('Parametra'),'Parametra IFC4 exporter','Parametra','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
}
