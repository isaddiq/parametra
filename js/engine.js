// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Parametric layout engine
//
//  Typology: "banded spine" plan. Each storey is three bands:
//     front band (street) · circulation spine · back band (garden)
//  Rooms are packed into bands as slots (single rooms or stacked
//  columns such as walk-in + ensuite). Widths are solved with a
//  weighted flex distribution, a U-stair aligns through all levels,
//  then walls / doors / windows / furniture are derived and every
//  variant is scored against the brief.
// ─────────────────────────────────────────────────────────────
import { ROOM_TYPES, STYLES, HABITABLE, WET, BEDROOMS, OPTION_NAMES } from './data.js';
import { furnishRoom } from './furniture.js';

export const CORR = 1.2;       // spine width
export const STAIR_W = 2.6;    // U-stair slot width
export const GARAGE_D = 6.0;   // garage depth
export const T_EXT = 0.25;     // exterior wall thickness
export const T_INT = 0.12;     // interior wall thickness
export const SLAB = 0.3;       // floor slab thickness

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const map = (v, a, b, c, d) => clamp(c + ((v - a) / (b - a)) * (d - c), Math.min(c, d), Math.max(c, d));

// ── Program ───────────────────────────────────────────────────
let _uid = 0;
function room(type, extra = {}) {
  const t = ROOM_TYPES[type];
  return { id: type + (++_uid), type, label: t.label, zone: t.zone, area: t.area, ...extra };
}
const single = (r) => ({ kind: 'single', rooms: [r] });
const column = (inner, outer) => ({ kind: 'column', rooms: [inner, outer] });
const item = (slots, o = {}) => ({ slots, order: 10, band: 'any', pin: null, ...o });

function buildProgram(b) {
  _uid = 0;
  const R = {};
  R.foyer = room('foyer');
  R.living = room('living');
  R.dining = room('dining');
  R.kitchen = room('kitchen', { area: b.kitchen === 'island' ? 15.5 : b.kitchen === 'galley' ? 10 : 13 });
  R.pantry = b.pantry ? room('pantry', { parent: R.kitchen.id }) : null;
  R.family = b.family ? room('family') : null;
  R.powder = b.powder ? room('powder') : null;
  R.laundry = b.laundry ? room('laundry') : null;
  R.storage = b.storage ? room('storage') : null;
  R.study = b.study ? room('study') : null;
  R.gym = b.gym ? room('gym') : null;
  R.media = b.media ? room('media') : null;
  R.garage = b.garage > 0 ? room('garage', { cars: b.garage, label: b.garage > 1 ? 'Double Garage' : 'Garage' }) : null;
  R.guest = b.guest ? room('guest') : null;
  R.master = room('master');
  R.ensuite = b.masterSuite ? room('ensuite', { parent: R.master.id }) : null;
  R.wic = b.walkIn ? room('wic', { parent: R.master.id }) : null;
  R.bedrooms = [];
  for (let i = 2; i <= Math.max(1, b.bedrooms); i++) R.bedrooms.push(room('bedroom', { label: `Bedroom ${i}` }));
  const nb = Math.max(0, b.bathrooms - (R.ensuite ? 1 : 0));
  R.baths = [];
  for (let i = 0; i < nb; i++) R.baths.push(room('bath', { label: nb > 1 ? `Bathroom ${i + 1}` : 'Bathroom' }));
  return R;
}

function masterItem(R, o) {
  const slots = [];
  if (R.ensuite && R.wic) slots.push(column(R.wic, R.ensuite));
  else if (R.ensuite) slots.push(column(room('linen'), R.ensuite));
  else if (R.wic) slots.push(single(R.wic));
  slots.push(single(R.master));
  return item(slots, { key: 'master', ...o });
}

// ── Slot metrics & flex distribution ──────────────────────────
function slotM(slot, depth, scale) {
  if (slot.kind === 'single') {
    const r = slot.rooms[0], t = ROOM_TYPES[r.type];
    if (r.type === 'garage') { const w = r.cars > 1 ? 6.4 : 3.8; return { pref: w, min: w, max: w, flex: 0 }; }
    if (r.type === 'stair') return { pref: STAIR_W, min: STAIR_W, max: STAIR_W, flex: 0 };
    const k = t.flex >= 0.5 ? scale : Math.sqrt(scale);
    const pref = clamp((r.area * k) / depth, t.minW, t.maxW);
    return { pref, min: t.minW, max: Math.max(t.maxW, pref), flex: t.flex };
  }
  const [a, c] = slot.rooms;
  const min = Math.max(ROOM_TYPES[a.type].minW, ROOM_TYPES[c.type].minW, 1.8);
  const pref = clamp(((a.area + c.area) * Math.sqrt(scale)) / depth, min, 3.2);
  return { pref, min, max: 3.4, flex: 0.12 };
}
const itemW = (it, depth, scale) => sum(it.slots.map((s) => slotM(s, depth, scale).pref));
const itemMin = (it, depth, scale) => sum(it.slots.map((s) => slotM(s, depth, scale).min));

function fillSegment(slots, L, depth, scale, filler) {
  const M = slots.map((s) => slotM(s, depth, scale));
  const ws = M.map((m) => m.pref);
  let delta = L - sum(ws);
  for (let it = 0; it < 12 && Math.abs(delta) > 1e-4; it++) {
    const f = M.map((m, i) => (delta > 0 ? (ws[i] < m.max - 1e-6 ? m.flex : 0) : ws[i] > m.min + 1e-6 ? m.flex : 0));
    const Fs = sum(f);
    if (Fs <= 0) break;
    for (let i = 0; i < ws.length; i++) if (f[i]) ws[i] = clamp(ws[i] + (delta * f[i]) / Fs, M[i].min, M[i].max);
    delta = L - sum(ws);
  }
  let out = slots.map((s, i) => ({ slot: s, w: ws[i] }));
  let overflow = 0;
  if (delta > 1e-3) {
    if (filler && (delta >= filler.minW || out.length === 0)) {
      const f = { slot: single(filler.make(delta)), w: delta };
      const idx = filler.at === 'start' ? 0 : filler.at === 'end' ? out.length : clamp(filler.at, 0, out.length);
      out.splice(idx, 0, f);
    } else if (out.length) {
      let f = M.map((m) => (m.flex > 0 ? m.flex : 0));
      if (sum(f) <= 0) f = M.map(() => 1);
      const Fs = sum(f);
      out.forEach((o, i) => (o.w += (delta * f[i]) / Fs));
    }
  } else if (delta < -1e-3) {
    overflow = -delta;
    const tot = sum(ws);
    out.forEach((o) => (o.w *= L / tot));
  }
  return { out, overflow };
}

function placeBand(out, x0, y0, depth, band, floor, list) {
  let x = x0;
  for (const { slot, w } of out) {
    if (slot.kind === 'single') {
      const r = slot.rooms[0];
      let y = y0, h = depth;
      if (r.type === 'garage' && depth < GARAGE_D) { h = GARAGE_D; if (band === 'front') y = y0 + depth - GARAGE_D; }
      list.push({ ...r, x: r3(x), y: r3(y), w: r3(w), h: r3(h), band, floor });
    } else {
      const [inn, outer] = slot.rooms;
      const di = clamp((depth * inn.area) / (inn.area + outer.area), 1.5, depth - 1.8);
      if (band === 'front') {
        list.push({ ...inn, x: r3(x), y: r3(y0 + depth - di), w: r3(w), h: r3(di), band, floor });
        list.push({ ...outer, x: r3(x), y: r3(y0), w: r3(w), h: r3(depth - di), band, floor });
      } else {
        list.push({ ...inn, x: r3(x), y: r3(y0), w: r3(w), h: r3(di), band, floor });
        list.push({ ...outer, x: r3(x), y: r3(y0 + di), w: r3(w), h: r3(depth - di), band, floor });
      }
    }
    x += w;
  }
}

const sortItems = (a) =>
  a.sort((p, q) => (p.pin === 'start' ? -1e3 : p.pin === 'end' ? 1e3 : p.order) - (q.pin === 'start' ? -1e3 : q.pin === 'end' ? 1e3 : q.order));
const flatSlots = (items) => items.flatMap((i) => i.slots);
const endIndex = (items) => { // slot index just before the first pinned-end item
  let n = 0;
  for (const it of items) { if (it.pin === 'end') return n; n += it.slots.length; }
  return n;
};

// ── Floor assignment ──────────────────────────────────────────
function assignProgram(b, R, F, v) {
  const G = [];
  const U = Array.from({ length: F - 1 }, () => []);
  G.push(item([...(R.pantry ? [single(R.pantry)] : []), single(R.kitchen)], {
    key: 'kitchen', band: v.kitchenFront ? 'front' : 'back', order: v.kitchenFront ? 1.5 : 0, pin: v.kitchenFront ? null : 'start',
  }));
  G.push(item([single(R.dining)], { band: 'back', order: 1 }));
  G.push(item([single(R.living)], { band: 'back', order: 2 }));
  if (R.family) G.push(item([single(R.family)], { band: 'back', order: 3, movable: true }));
  G.push(item([single(R.foyer)], { band: 'front', order: 3, key: 'foyer' }));
  if (R.garage) G.push(item([single(R.garage)], { band: 'front', pin: 'start', key: 'garage' }));
  if (R.laundry && R.storage) { R.storage.parent = R.laundry.id; R.storage.label = 'Utility Store'; G.push(item([column(R.laundry, R.storage)], { band: 'front', order: 1 })); }
  else if (R.laundry) G.push(item([single(R.laundry)], { band: 'front', order: 1 }));
  if (R.powder) G.push(item([single(R.powder)], { band: 'front', order: 2 }));
  if (R.storage && !R.laundry) G.push(item([single(R.storage)], { band: 'front', order: 5 }));
  if (F > 1) G.push(item([single(room('stair'))], { band: 'front', order: [3.5, 2.5, 5.5][v.stair] ?? 3.5, key: 'stair' }));
  if (R.study) G.push(item([single(R.study)], { order: 6, movable: true }));

  const baths = [...R.baths];
  if (F === 1) {
    if (R.guest) G.push(item([single(R.guest)], { order: 7 }));
    if (R.gym) G.push(item([single(R.gym)], { order: 8 }));
    if (R.media) G.push(item([single(R.media)], { order: 8.5 }));
    G.push(masterItem(R, { band: 'back', pin: 'end' }));
    R.bedrooms.forEach((r, i) => G.push(item([single(r)], { order: 20 + i * 2 })));
    baths.forEach((r, i) => G.push(item([single(r)], { order: 21 + i * 2 })));
    return { G, U };
  }

  // multi-storey
  if (R.guest) {
    const gb = baths.length >= 2 ? baths.pop() : null;
    if (gb) gb.label = 'Guest Bath';
    G.push(item([single(R.guest), ...(gb ? [single(gb)] : [])], { order: 7, movable: true }));
  }
  const top = U.length - 1;
  U[top].push(masterItem(R, { band: 'back', pin: 'end' }));
  const load = U.map(() => 0);
  load[top] = (R.master.area + (R.ensuite?.area || 0) + (R.wic?.area || 0)) * 1.1;
  const bedFloor = U.map(() => 0);
  for (const bd of R.bedrooms) {
    let k = 0;
    for (let i = 1; i < U.length; i++) if (load[i] < load[k]) k = i;
    U[k].push(item([single(bd)], { order: 20 + U[k].length }));
    load[k] += bd.area; bedFloor[k]++;
  }
  // bathrooms: one per bedroom floor first
  const needBath = U.map((_, i) => bedFloor[i] > 0 || (i === top && !R.ensuite));
  needBath.forEach((n, i) => { if (n && baths.length) { const bt = baths.shift(); U[i].push(item([single(bt)], { order: 21 + U[i].length })); load[i] += bt.area; } });
  const groundHasWC = R.powder || G.some((it) => it.slots.some((s) => s.rooms.some((r) => r.type === 'bath')));
  if (!groundHasWC && baths.length) { const bt = baths.shift(); bt.label = 'Bathroom'; G.push(item([single(bt)], { order: 2.2, band: 'front' })); }
  while (baths.length) {
    let k = 0;
    for (let i = 1; i < U.length; i++) if (bedFloor[i] > bedFloor[k]) k = i;
    const bt = baths.shift();
    U[k].push(item([single(bt)], { order: 21 + U[k].length })); load[k] += bt.area; bedFloor[k] -= 0.5;
  }
  // gym / media go to the lighter of the top floor or ground
  const groundLoad = sum(G.flatMap((it) => it.slots.flatMap((s) => s.rooms.map((r) => r.area))));
  for (const ex of [R.media, R.gym].filter(Boolean)) {
    if (load[top] + ex.area < groundLoad * 0.92) { U[top].push(item([single(ex)], { order: 5 })); load[top] += ex.area; }
    else G.push(item([single(ex)], { order: 8, movable: true }));
  }
  return { G, U };
}

/** Move flexible ground-floor rooms upstairs while it narrows the overall footprint. */
function rebalanceFloors(G, U, dF, dB, scale) {
  if (!U.length) return;
  const mid = (dF + dB) / 2;
  const gNeed = () => { const b = balance(G.map((i) => ({ ...i })), dF, dB, scale); return Math.max(b.lf, b.lb); };
  const uNeed = (k) => (sum(U[k].map((i) => itemW(i, mid, scale))) + STAIR_W) / 2 + 0.4;
  for (let guard = 0; guard < 6; guard++) {
    const cur = Math.max(gNeed(), ...U.map((_, k) => uNeed(k)));
    let best = null;
    for (const it of G.filter((i) => i.movable)) {
      for (let k = 0; k < U.length; k++) {
        const gi = G.indexOf(it);
        G.splice(gi, 1); U[k].push(it);
        const nw = Math.max(gNeed(), ...U.map((_, j) => uNeed(j)));
        U[k].pop(); G.splice(gi, 0, it);
        if (nw < cur - 0.3 && (!best || nw < best.nw)) best = { it, k, nw };
      }
    }
    if (!best) break;
    G.splice(G.indexOf(best.it), 1);
    best.it.band = 'any'; best.it.order = 5;
    for (const s of best.it.slots) for (const r of s.rooms) if (r.type === 'family') r.label = 'Family Lounge';
    U[best.k].push(best.it);
  }
}

function balance(items, dF, dB, scale) {
  const front = items.filter((i) => i.band === 'front');
  const back = items.filter((i) => i.band === 'back');
  const any = items.filter((i) => i.band === 'any').sort((p, q) => itemW(q, (dF + dB) / 2, scale) - itemW(p, (dF + dB) / 2, scale));
  let lf = sum(front.map((i) => itemW(i, dF, scale)));
  let lb = sum(back.map((i) => itemW(i, dB, scale)));
  for (const it of any) {
    const wf = itemW(it, dF, scale), wb = itemW(it, dB, scale);
    if (lf + wf <= lb + wb) { front.push(it); lf += wf; } else { back.push(it); lb += wb; }
  }
  sortItems(front); sortItems(back);
  return { front, back, lf, lb };
}

// ── Geometry helpers ─────────────────────────────────────────
export function shared(a, b, minLen = 0.5) {
  const e = 0.01;
  if (Math.abs(a.x + a.w - b.x) < e || Math.abs(b.x + b.w - a.x) < e) {
    const c = Math.abs(a.x + a.w - b.x) < e ? b.x : a.x;
    const s = Math.max(a.y, b.y), t = Math.min(a.y + a.h, b.y + b.h);
    if (t - s >= minLen) return { axis: 'v', c, s, e: t };
  }
  if (Math.abs(a.y + a.h - b.y) < e || Math.abs(b.y + b.h - a.y) < e) {
    const c = Math.abs(a.y + a.h - b.y) < e ? b.y : a.y;
    const s = Math.max(a.x, b.x), t = Math.min(a.x + a.w, b.x + b.w);
    if (t - s >= minLen) return { axis: 'h', c, s, e: t };
  }
  return null;
}
const inRect = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const uniq = (arr) => {
  const s = [...arr].sort((a, b) => a - b), o = [];
  for (const v of s) if (!o.length || v - o[o.length - 1] > 0.004) o.push(v);
  return o;
};

/** Walls via elementary-interval classification. Works for any orthogonal room set. */
export function computeWalls(rooms, open) {
  const xs = uniq(rooms.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniq(rooms.flatMap((r) => [r.y, r.y + r.h]));
  const at = (x, y) => rooms.find((r) => inRect(r, x, y)) || null;
  const pieces = [];
  const scan = (axis, lines, cross) => {
    for (const c of lines) {
      let cur = null;
      for (let i = 0; i < cross.length - 1; i++) {
        const s = cross[i], e = cross[i + 1], m = (s + e) / 2;
        const A = axis === 'h' ? at(m, c - 0.01) : at(c - 0.01, m);
        const B = axis === 'h' ? at(m, c + 0.01) : at(c + 0.01, m);
        let type = null;
        if (A && B && A.id === B.id) type = null;
        else if (!A && !B) type = null;
        else if (!A || !B) type = 'ext';
        else type = open.has(pkey(A.id, B.id)) ? 'open' : 'int';
        const a = A?.id || null, b = B?.id || null;
        if (type && cur && cur.type === type && cur.a === a && cur.b === b && Math.abs(cur.e - s) < 1e-3) cur.e = e;
        else {
          if (cur) pieces.push(cur);
          cur = type ? { axis, c, s, e, type, a, b } : null;
        }
      }
      if (cur) pieces.push(cur);
    }
  };
  scan('h', ys, xs);
  scan('v', xs, ys);
  return pieces;
}

/** Boundary of a set of rects against "outside" (used for railings / parapets). */
export function outerEdges(rects, solid) {
  const all = [...rects, ...solid];
  const xs = uniq(all.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniq(all.flatMap((r) => [r.y, r.y + r.h]));
  const inSet = (set, x, y) => set.some((r) => inRect(r, x, y));
  const out = [];
  for (const [axis, lines, cross] of [['h', ys, xs], ['v', xs, ys]]) {
    for (const c of lines) {
      let cur = null;
      for (let i = 0; i < cross.length - 1; i++) {
        const s = cross[i], e = cross[i + 1], m = (s + e) / 2;
        const p1 = axis === 'h' ? [m, c - 0.01] : [c - 0.01, m];
        const p2 = axis === 'h' ? [m, c + 0.01] : [c + 0.01, m];
        const i1 = inSet(rects, ...p1), i2 = inSet(rects, ...p2);
        const s1 = inSet(solid, ...p1) || i1, s2 = inSet(solid, ...p2) || i2;
        const edge = (i1 && !s2) || (i2 && !s1);
        if (edge && cur && Math.abs(cur.e - s) < 1e-3) cur.e = e;
        else { if (cur) out.push(cur); cur = edge ? { axis, c, s, e, outside: i1 ? 'b' : 'a' } : null; }
      }
      if (cur) out.push(cur);
    }
  }
  return out;
}

export function rectUnion(rects) {
  if (!rects.length) return [];
  const xs = uniq(rects.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniq(rects.flatMap((r) => [r.y, r.y + r.h]));
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let cur = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
      const cov = rects.some((r) => inRect(r, mx, my));
      if (cov && cur) cur.w = xs[i + 1] - cur.x;
      else if (cov) cur = { x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] };
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
  }
  // merge vertically identical strips
  const merged = [];
  for (const r of out) {
    const m = merged.find((q) => Math.abs(q.x - r.x) < 1e-3 && Math.abs(q.w - r.w) < 1e-3 && Math.abs(q.y + q.h - r.y) < 1e-3);
    if (m) m.h += r.h; else merged.push({ ...r });
  }
  return merged;
}

// ── Orientation ──────────────────────────────────────────────
const DIRS = ['N', 'E', 'S', 'W'];
export function compass(planSide, street) {
  const off = DIRS.indexOf(street) - DIRS.indexOf('S');
  return DIRS[(DIRS.indexOf(planSide) + off + 8) % 4];
}

// ── Main generator ───────────────────────────────────────────
export function generateDesign(b, v, { furnish = true } = {}) {
  const style = STYLES[b.style] || STYLES.modern;
  const R = buildProgram(b);
  const F = clamp(Math.round(b.floors), 1, 3);
  const H = b.ceiling + SLAB;
  const risers = Math.ceil(H / 0.18);
  const stairNeed = F > 1 ? Math.ceil(risers / 2) * 0.26 + 1.55 : 0;
  const sizeK = clamp(Math.sqrt(b.area / (F * 115)), 0.9, 1.2);
  const dB = r3(Math.round(v.dB * sizeK * 10) / 10);
  const dF = r3(Math.max(Math.round(v.dF * sizeK * 10) / 10, stairNeed));
  const D = r3(dF + CORR + dB);

  const progRooms = [R.foyer, R.living, R.dining, R.kitchen, R.pantry, R.family, R.powder, R.laundry, R.storage, R.study, R.gym, R.media, R.guest, R.master, R.ensuite, R.wic, ...R.bedrooms, ...R.baths].filter(Boolean);
  const baseSum = sum(progRooms.map((r) => r.area));
  const stairArea = F > 1 ? STAIR_W * dF * F : 0;
  const scale = clamp((b.area * 0.8 - stairArea) / baseSum, 0.72, 1.8);

  const { G, U } = assignProgram(b, R, F, v);
  rebalanceFloors(G, U, dF, dB, scale);
  const gB = balance(G, dF, dB, scale);
  const midD = (dF + dB) / 2;
  const upperNeed = U.map((items) => (sum(items.map((i) => itemW(i, midD, scale))) + STAIR_W) / 2 + 0.4);
  const upperMin = U.map((items) => (sum(items.map((i) => itemMin(i, midD, scale))) + STAIR_W) / 2 + 0.3);
  const Wt = b.area / (F * D);
  let W = r3(Math.max(Wt, gB.lf, gB.lb, ...upperMin, ...upperNeed.map((n) => n * 0.85)));

  let floors, overflow, sx = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    floors = []; overflow = 0;
    // ── ground floor
    const g = [];
    const fillerG = (at) => ({ minW: 1.3, at, make: (d) => room(d >= 2.6 ? 'flex' : 'storage') });
    const bOut = fillSegment(flatSlots(gB.back), W, dB, scale, fillerG(endIndex(gB.back)));
    const fOut = fillSegment(flatSlots(gB.front), W, dF, scale, fillerG(endIndex(gB.front)));
    overflow = Math.max(overflow, bOut.overflow, fOut.overflow);
    placeBand(fOut.out, 0, 0, dF, 'front', 0, g);
    placeBand(bOut.out, 0, dF + CORR, dB, 'back', 0, g);
    g.push({ ...room('hall', { label: F > 1 ? 'Hall' : 'Gallery' }), x: 0, y: dF, w: W, h: CORR, band: 'spine', floor: 0 });
    const st = g.find((r) => r.type === 'stair');
    sx = st ? st.x : 0;
    floors.push({ level: 0, rooms: g });

    // ── upper floors
    for (let k = 0; k < U.length; k++) {
      const lvl = k + 1;
      const bins = [
        { key: 'back', cap: W, items: [], load: 0, depth: dB },
        { key: 'fl', cap: sx, items: [], load: 0, depth: dF },
        { key: 'fr', cap: W - sx - STAIR_W, items: [], load: 0, depth: dF },
      ];
      const items = [...U[k]].sort((p, q) => itemW(q, midD, scale) - itemW(p, midD, scale));
      for (const it of items) {
        if (it.key === 'master') { bins[0].items.push(it); bins[0].load += itemW(it, dB, scale); continue; }
      }
      for (const it of items) {
        if (it.key === 'master') continue;
        let best = null, bestV = Infinity;
        for (const bin of bins) {
          const w = itemW(it, bin.depth, scale);
          if (bin.cap < itemMin(it, bin.depth, scale) * 0.98) continue;
          const val = (bin.load + w) / Math.max(bin.cap, 0.1);
          if (val < bestV) { bestV = val; best = bin; }
        }
        best = best || bins[0];
        best.items.push(it); best.load += itemW(it, best.depth, scale);
      }
      const u = [];
      const isTop = lvl === F - 1;
      const term = (at) => ({ minW: 1.8, at, make: () => room('terrace', { label: isTop ? 'Roof Terrace' : 'Terrace' }) });
      for (const bin of bins) {
        sortItems(bin.items);
        // interleave baths between bedrooms
        const free = bin.items.filter((i) => !i.pin), pinned = bin.items.filter((i) => i.pin);
        const beds = free.filter((i) => i.slots.some((s) => s.rooms.some((r) => r.type === 'bedroom')));
        const baths = free.filter((i) => i.slots.some((s) => s.rooms.some((r) => r.type === 'bath')));
        const others = free.filter((i) => !beds.includes(i) && !baths.includes(i));
        const seq = [...others];
        while (beds.length || baths.length) {
          if (beds.length) seq.push(beds.shift());
          if (baths.length && (seq.length % 2 === 1 || !beds.length)) seq.push(baths.shift());
        }
        bin.items = [...seq, ...pinned];
        if (bin.cap <= 0.05) continue;
        const x0 = bin.key === 'fr' ? sx + STAIR_W : 0;
        const fill = fillSegment(flatSlots(bin.items), bin.cap, bin.depth, scale, term(bin.key === 'fr' ? 'end' : 'start'));
        overflow = Math.max(overflow, fill.overflow);
        placeBand(fill.out, x0, bin.key === 'back' ? dF + CORR : 0, bin.depth, bin.key === 'back' ? 'back' : 'front', lvl, u);
      }
      u.push({ ...room('stair'), x: sx, y: 0, w: STAIR_W, h: dF, band: 'front', floor: lvl });
      // spine spans enclosed rooms; the rest becomes terrace
      const enc = u.filter((r) => r.type !== 'terrace');
      const hx0 = Math.min(...enc.map((r) => r.x)), hx1 = Math.max(...enc.map((r) => r.x + r.w));
      u.push({ ...room('hall', { label: 'Landing' }), x: r3(hx0), y: dF, w: r3(hx1 - hx0), h: CORR, band: 'spine', floor: lvl });
      if (hx0 > 0.05) u.push({ ...room('terrace', { label: isTop ? 'Roof Terrace' : 'Terrace' }), x: 0, y: dF, w: r3(hx0), h: CORR, band: 'spine', floor: lvl });
      if (W - hx1 > 0.05) u.push({ ...room('terrace', { label: isTop ? 'Roof Terrace' : 'Terrace' }), x: r3(hx1), y: dF, w: r3(W - hx1), h: CORR, band: 'spine', floor: lvl });
      floors.push({ level: lvl, rooms: u });
    }
    if (overflow < 0.3) break;
    W = r3(W + overflow + 0.2);
  }

  // mirror
  if (v.mirror) for (const f of floors) for (const r of f.rooms) r.x = r3(W - r.x - r.w);

  const design = {
    id: `v-${v.dB}-${v.dF}-${v.stair}-${v.mirror ? 1 : 0}-${v.kitchenFront ? 1 : 0}`,
    variant: v, brief: b, style, styleKey: b.style, W, D, dF, dB, H, ceiling: b.ceiling, nFloors: F, overflow,
    floors: [],
  };

  for (const f of floors) design.floors.push(processFloor(f, design));
  design.site = computeSite(design);
  if (furnish) furnishDesign(design);
  design.metrics = computeMetrics(design);
  return design;
}

// ── Per-floor derivation: open pairs, walls, doors, windows ──
function processFloor(f, d) {
  const b = d.brief;
  const rooms = f.rooms.filter((r) => r.type !== 'terrace');
  const terraces = f.rooms.filter((r) => r.type === 'terrace');
  const byId = Object.fromEntries(f.rooms.map((r) => [r.id, r]));
  const hall = rooms.find((r) => r.type === 'hall');
  const openK = b.kitchen === 'open' || b.kitchen === 'island';
  const open = new Set();
  const isOpen = (x, y) => open.has(pkey(x.id, y.id));
  const addOpen = (x, y) => x && y && shared(x, y, 0.3) && open.add(pkey(x.id, y.id));

  for (const r of rooms) {
    if (!hall) break;
    if (r.type === 'stair' || r.type === 'foyer') addOpen(r, hall);
    if (r.type === 'living' || r.type === 'family') addOpen(r, hall);
    if (r.type === 'dining' && b.dining === 'open') addOpen(r, hall);
    if (r.type === 'kitchen' && openK) addOpen(r, hall);
  }
  for (const r of rooms) for (const q of rooms) {
    if (r.id >= q.id) continue;
    const t = [r.type, q.type].sort().join('+');
    if (openK && (t === 'dining+kitchen' || t === 'family+kitchen')) addOpen(r, q);
    if (b.dining === 'open' && t === 'dining+living') addOpen(r, q);
    if (t === 'family+living') addOpen(r, q);
  }

  const walls = computeWalls(rooms, open);
  const openings = [];
  const doorH = Math.min(2.2, b.ceiling - 0.35);
  const winHead = r3(b.ceiling - 0.3);
  const stair = rooms.find((r) => r.type === 'stair');
  const pivotX = stair ? stair.x + STAIR_W / 2 : (rooms.find((r) => r.type === 'foyer')?.x ?? d.W / 2);
  const pivotY = d.dF + CORR / 2;

  const addOpening = (seg, s, w, kind, r1, r2, extra = {}) => {
    // orient a/b by geometry
    let a = null, bb = null;
    const probe = (rr) => {
      if (!rr) return 0;
      const cx = rr.x + rr.w / 2, cy = rr.y + rr.h / 2;
      return seg.axis === 'h' ? (cy < seg.c ? -1 : 1) : (cx < seg.c ? -1 : 1);
    };
    for (const rr of [r1, r2]) { if (!rr) continue; if (probe(rr) < 0) a = rr.id; else bb = rr.id; }
    openings.push({ axis: seg.axis, c: seg.c, s: r3(s), e: r3(s + w), kind, a, b: bb, sill: 0, head: doorH, ...extra });
  };
  const placeDoor = (seg, w, pivot) => {
    const L = seg.e - seg.s, m = 0.2;
    if (L < w + 2 * m) { const ww = Math.max(0.65, L - 2 * m); return { s: seg.s + (L - ww) / 2, w: ww, hinge: 's' }; }
    const nearS = Math.abs(pivot - seg.s) <= Math.abs(pivot - seg.e);
    return nearS ? { s: seg.s + m, w, hinge: 's' } : { s: seg.e - m - w, w, hinge: 'e' };
  };
  const doorW = (t) => (['bath', 'ensuite', 'powder', 'wic', 'pantry', 'linen', 'storage', 'laundry'].includes(t) ? 0.8 : 0.9);
  const interior = (r, p, w, kind = 'door') => {
    const seg = shared(r, p, 0.75);
    if (!seg) return false;
    const pv = seg.axis === 'h' ? pivotX : pivotY;
    const pd = placeDoor(seg, w, pv);
    addOpening(seg, pd.s, pd.w, kind, r, p, { into: r.id, hinge: pd.hinge });
    return true;
  };

  for (const r of rooms) {
    if (['hall', 'stair'].includes(r.type)) continue;
    const parent = r.parent ? byId[r.parent] : hall;
    if (parent && isOpen(r, parent)) continue;
    let ok = parent ? interior(r, parent, doorW(r.type)) : false;
    if (!ok && hall && parent !== hall && !isOpen(r, hall)) ok = interior(r, hall, doorW(r.type));
    if (!ok) {
      const alt = rooms.find((q) => q !== r && ['hall', 'foyer', 'living', 'dining', 'family', 'flex', 'kitchen'].includes(q.type) && shared(r, q, 0.75));
      if (alt && !isOpen(r, alt)) interior(r, alt, doorW(r.type));
      r.unreachable = !alt;
    }
  }
  // secondary connections
  for (const r of rooms) for (const q of rooms) {
    if (r.id >= q.id || isOpen(r, q)) continue;
    const t = [r.type, q.type].sort().join('+');
    if (t === 'dining+living' && b.dining !== 'open') interior(r, q, 1.6, 'double');
    if (t === 'dining+kitchen' && !openK) interior(r, q, 0.9);
    if (t === 'garage+laundry') interior(q.type === 'laundry' ? q : r, q.type === 'laundry' ? r : q, 0.8);
  }

  // exterior openings
  const extSeg = (r, side) => walls.find((w) => w.type === 'ext' && ((side === 'S' && w.axis === 'h' && Math.abs(w.c - r.y) < 1e-3 && w.b === r.id) || (side === 'N' && w.axis === 'h' && Math.abs(w.c - (r.y + r.h)) < 1e-3 && w.a === r.id)) && w.e - w.s > 0.9);
  const isLvl0 = f.level === 0;
  if (isLvl0) {
    const foy = rooms.find((r) => r.type === 'foyer');
    const s = foy && extSeg(foy, 'S');
    if (s) { const w = Math.min(1.1, s.e - s.s - 0.5); addOpening(s, (s.s + s.e) / 2 - w / 2, w, 'front', null, foy, { head: Math.min(2.4, b.ceiling - 0.2) }); }
    const gar = rooms.find((r) => r.type === 'garage');
    const gs = gar && extSeg(gar, 'S');
    if (gs) { const w = Math.min(gar.cars > 1 ? 5.0 : 2.7, gs.e - gs.s - 0.6); addOpening(gs, (gs.s + gs.e) / 2 - w / 2, w, 'garage', null, gar, { head: 2.3 }); }
    for (const r of rooms) {
      if (!['living', 'family', 'dining'].includes(r.type) || r.band !== 'back') continue;
      const sN = extSeg(r, 'N');
      if (!sN) continue;
      const L = sN.e - sN.s;
      const frac = r.type === 'living' ? 0.66 : r.type === 'family' ? 0.55 : 0.5;
      const w = clamp(L * frac, 1.6, r.type === 'living' ? 4.8 : 3.0);
      addOpening(sN, (sN.s + sN.e) / 2 - w / 2, w, 'slide', r, null, { head: winHead });
      r.gardenDoor = true;
    }
  }
  const balconies = [];
  if (!isLvl0 && b.balcony && f.level === d.nFloors - 1) {
    const m = rooms.find((r) => r.type === 'master');
    const sN = m && m.band === 'back' ? extSeg(m, 'N') : null;
    if (sN) {
      const w = clamp((sN.e - sN.s) * 0.6, 1.6, 3.2);
      addOpening(sN, (sN.s + sN.e) / 2 - w / 2, w, 'slide', m, null, { head: winHead });
      balconies.push({ x: r3(m.x + 0.1), y: d.D, w: r3(m.w - 0.2), h: 1.5, label: 'Balcony' });
    }
  }
  // terrace access
  const terraceGroups = rectUnion(terraces);
  for (const t of terraces) {
    if (t.w * t.h < 2.5) continue;
    const cands = rooms.filter((r) => shared(r, t, 1.2) && ['hall', 'master', 'bedroom', 'media', 'family', 'gym', 'study', 'flex'].includes(r.type))
      .sort((p, q) => (p.type === 'hall' ? -1 : 0) - (q.type === 'hall' ? -1 : 0) || q.w * q.h - p.w * p.h);
    const r = cands[0];
    if (!r) continue;
    const seg = shared(r, t, 1.2);
    if (openings.some((o) => o.axis === seg.axis && Math.abs(o.c - seg.c) < 1e-3 && o.s < seg.e && o.e > seg.s)) continue;
    const w = clamp(seg.e - seg.s - 0.5, 0.9, 2.4);
    addOpening(seg, (seg.s + seg.e) / 2 - w / 2, w, r.type === 'hall' && w < 1.4 ? 'door' : 'slide', r, null, { head: r.type === 'hall' ? doorH : winHead, into: r.id, hinge: 's' });
  }

  // windows
  const style = d.style;
  for (const w of walls) {
    if (w.type !== 'ext') continue;
    const r = byId[w.a || w.b];
    if (!r) continue;
    const L = w.e - w.s;
    if (L < 0.9) continue;
    const side = w.axis === 'h' ? (w.a ? 'N' : 'S') : (w.a ? 'E' : 'W');
    const specs = windowSpecs(r, L, side, style, b, winHead, d);
    if (!specs.length) continue;
    // free intervals
    const occ = openings.filter((o) => o.axis === w.axis && Math.abs(o.c - w.c) < 1e-3 && o.s < w.e && o.e > w.s)
      .map((o) => [o.s - 0.35, o.e + 0.35]).sort((p, q) => p[0] - q[0]);
    const free = [];
    let cur = w.s + 0.3;
    for (const [s, e] of occ) { if (s - cur > 0.6) free.push([cur, s]); cur = Math.max(cur, e); }
    if (w.e - 0.3 - cur > 0.6) free.push([cur, w.e - 0.3]);
    free.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const slot = free[0];
    if (!slot) continue;
    const avail = slot[1] - slot[0];
    const n = specs.length;
    for (let i = 0; i < n; i++) {
      const sp = specs[i];
      const ww = Math.min(sp.w, avail / n - (n > 1 ? 0.3 : 0));
      if (ww < 0.5) continue;
      const cx = slot[0] + (avail * (i + 0.5)) / n;
      openings.push({ axis: w.axis, c: w.c, s: r3(cx - ww / 2), e: r3(cx + ww / 2), kind: 'window', a: w.a, b: w.b, sill: sp.sill, head: sp.head, room: r.id, side });
    }
  }

  return { level: f.level, rooms, terraces, terraceGroups, balconies, walls, openings, open: [...open] };
}

function windowSpecs(r, L, side, style, b, head, d) {
  const g = style.glazing;
  const t = r.type;
  const street = side === 'S';
  if (['garage', 'pantry', 'linen', 'storage'].includes(t)) return [];
  if (t === 'stair') return L > 1.4 ? [{ w: 1.0, sill: 0.35, head }] : [];
  if (t === 'hall') return L <= CORR + 0.4 ? [{ w: 0.9, sill: 0.1, head }] : [];
  if (t === 'foyer') return L > 2.4 ? [{ w: 0.6, sill: 0.1, head: Math.min(2.4, head) }] : [];
  if (WET.has(t) || t === 'wic') return [{ w: clamp(L * 0.35, 0.6, 1.2), sill: 1.55, head: Math.min(2.15, head) }];
  if (t === 'kitchen') return [{ w: clamp(L * 0.45, 0.9, 2.6), sill: 1.05, head }];
  let w = clamp(L * g, 1.0, L - 0.7);
  const tall = style.fullHeight && ['living', 'family', 'dining', 'master', 'media', 'study'].includes(t);
  let sill = tall ? 0.05 : BEDROOMS.has(t) ? 0.75 : 0.85;
  if (street && BEDROOMS.has(t) && b.pri.privacy > 65 && r.floor === 0) { sill = 1.2; w *= 0.7; }
  if (street && BEDROOMS.has(t) && b.pri.privacy > 80) w *= 0.8;
  if (!tall && w > 3.0) return [{ w: w / 2, sill, head }, { w: w / 2, sill, head }];
  return [{ w, sill, head }];
}

// ── Site ─────────────────────────────────────────────────────
function computeSite(d) {
  const b = d.brief;
  const g = d.floors[0];
  const gar = g.rooms.find((r) => r.type === 'garage');
  const prot = gar ? Math.max(0, -gar.y) : 0;
  const bw = b.plotW - 2 * b.setSide;
  const ox = r3(clamp((b.plotW - d.W) / 2, Math.min(b.setSide, (b.plotW - d.W) / 2), b.plotW));
  const oy = r3(b.setFront + prot);
  const rear = b.plotD - oy - d.D;
  const fitsW = d.W <= bw + 0.01;
  const fitsD = d.D + prot <= b.plotD - b.setFront - b.setRear + 0.01;
  // patio behind garden rooms
  let patio = null;
  const gardenRooms = g.rooms.filter((r) => r.gardenDoor);
  if (b.terrace && gardenRooms.length && rear > 3) {
    const x0 = Math.min(...gardenRooms.map((r) => r.x)), x1 = Math.max(...gardenRooms.map((r) => r.x + r.w));
    patio = { x: r3(x0), y: d.D, w: r3(x1 - x0), h: r3(Math.min(3.4, rear - 1)) };
  }
  let pool = null;
  const py = d.D + (patio ? patio.h : 0) + 1.4;
  if (b.pool && b.plotD - oy - py > 4.6) {
    const pw = Math.min(10, d.W * 0.7, b.plotW - 3);
    const ph = Math.min(4, b.plotD - oy - py - 1.2);
    const cx = patio ? patio.x + patio.w / 2 : d.W / 2;
    let px = clamp(cx - pw / 2, -ox + 1, -ox + b.plotW - 1 - pw);
    pool = { x: r3(px), y: r3(py), w: r3(pw), h: r3(ph) };
  }
  const driveway = gar ? { x: gar.x + 0.2, y: -oy, w: gar.w - 0.4, h: oy + gar.y } : null;
  const foy = g.rooms.find((r) => r.type === 'foyer');
  const path = foy ? { x: foy.x + foy.w / 2 - 0.7, y: -oy, w: 1.4, h: oy } : null;
  return { plotW: b.plotW, plotD: b.plotD, ox, oy, prot, rear, fitsW, fitsD, overW: d.W - bw, patio, pool, driveway, path };
}

// ── Furniture ───────────────────────────────────────────────
function furnishDesign(d) {
  for (const f of d.floors) {
    f.furniture = {};
    for (const r of [...f.rooms, ...f.terraces]) f.furniture[r.id] = furnishRoom(r, f, d);
    f.balconies.forEach((bc, i) => (f.furniture['balcony' + i] = furnishRoom({ ...bc, id: 'balcony' + i, type: 'balcony' }, f, d)));
  }
  d.furnished = true;
}
export function ensureFurnished(d) { if (!d.furnished) furnishDesign(d); return d; }

// ── Metrics & scoring ───────────────────────────────────────
function computeMetrics(d) {
  const b = d.brief;
  const all = d.floors.flatMap((f) => f.rooms);
  const area = (r) => r.w * r.h;
  const garageA = sum(all.filter((r) => r.type === 'garage').map(area));
  const gross = sum(all.map(area)) - garageA;
  const circ = sum(all.filter((r) => r.type === 'hall' || r.type === 'stair').map(area));
  const net = gross - circ;
  const terraceA = sum(d.floors.flatMap((f) => f.terraces).map(area)) + sum(d.floors.flatMap((f) => f.balconies).map(area));
  const M = {};

  M.efficiency = map(net / gross, 0.72, 0.9, 30, 100);

  // proportions
  let pw = 0, ps = 0;
  for (const r of all) {
    if (['hall', 'stair', 'garage'].includes(r.type)) continue;
    const ar = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    let s = ar <= 1.55 ? 100 : ar >= 3.2 ? 15 : 100 - ((ar - 1.55) / 1.65) * 85;
    if (['wic', 'pantry', 'linen', 'storage', 'laundry', 'powder', 'bath', 'ensuite'].includes(r.type)) s = Math.max(s, 70);
    const t = ROOM_TYPES[r.type];
    if (Math.min(r.w, r.h) < t.minW * 0.9) s -= 30;
    pw += area(r); ps += s * area(r);
  }
  M.proportion = clamp(ps / pw, 0, 100);

  // daylight + solar
  let lw = 0, ls = 0, sw = 0, ss = 0, litRooms = 0, habit = 0;
  const hemi = b.hemisphere === 'S' ? 'S' : 'N';
  const sunTable = {
    public: { S: 100, E: 78, W: 62, N: 38 },
    kitchen: { E: 100, S: 85, N: 62, W: 50 },
    bed: { E: 100, S: 80, N: 70, W: 45 },
  };
  for (const f of d.floors) {
    for (const r of f.rooms) {
      if (!HABITABLE.has(r.type)) continue;
      habit++;
      const wins = f.openings.filter((o) => (o.kind === 'window' || o.kind === 'slide') && (o.a === r.id || o.b === r.id) && (o.kind === 'window' ? o.room === r.id : !(o.a && o.b)));
      const wa = sum(wins.map((o) => (o.e - o.s) * (o.head - o.sill)));
      if (wa > 0) litRooms++;
      const ratio = wa / area(r);
      const s = clamp(ratio / 0.17, 0, 1) * 100;
      lw += area(r); ls += s * area(r);
      // solar
      const tbl = ['living', 'family', 'dining', 'media', 'flex'].includes(r.type) ? sunTable.public : r.type === 'kitchen' ? sunTable.kitchen : sunTable.bed;
      const dirs = wins.map((o) => {
        const ps = o.side || (o.axis === 'h' ? (o.a ? 'N' : 'S') : (o.a ? 'E' : 'W'));
        let c = compass(ps, b.street);
        if (hemi === 'S') c = { N: 'S', S: 'N', E: 'E', W: 'W' }[c];
        return { c, a: (o.e - o.s) * (o.head - o.sill) };
      });
      if (dirs.length) {
        const tot = sum(dirs.map((x) => x.a));
        const sc = sum(dirs.map((x) => tbl[x.c] * x.a)) / tot;
        const best = Math.max(...dirs.map((x) => tbl[x.c]));
        sw += area(r); ss += (sc * 0.5 + best * 0.5) * area(r);
      }
    }
  }
  M.light = clamp((ls / Math.max(lw, 1)) * 0.8 + (litRooms / Math.max(habit, 1)) * 20, 0, 100);
  M.sun = sw ? ss / sw : 50;

  // functional adjacency
  const find = (t) => all.filter((r) => r.type === t);
  const adj = (a, c) => a && c && a.floor === c.floor && !!shared(a, c, 0.8);
  const near = (a, c, dist = 6) => a && c && a.floor === c.floor && Math.hypot(a.x + a.w / 2 - c.x - c.w / 2, a.y + a.h / 2 - c.y - c.h / 2) < dist;
  const K = find('kitchen')[0], Dn = find('dining')[0], L = find('living')[0], Ms = find('master')[0];
  const checks = [];
  const chk = (w, ok, label) => checks.push({ w, ok: ok === true ? 1 : ok || 0, label });
  chk(3, adj(K, Dn) ? 1 : near(K, Dn, 5.5) ? 0.6 : 0, 'Kitchen ↔ dining');
  chk(2, adj(Dn, L) ? 1 : near(Dn, L, 6) ? 0.6 : 0, 'Dining ↔ living');
  chk(2, L && L.band === 'back' && L.floor === 0, 'Living opens to garden');
  if (find('ensuite')[0]) chk(2, adj(Ms, find('ensuite')[0]), 'Master ↔ ensuite');
  if (find('wic')[0]) chk(1, adj(Ms, find('wic')[0]), 'Master ↔ walk-in');
  if (find('pantry')[0]) chk(1, adj(K, find('pantry')[0]), 'Kitchen ↔ pantry');
  const Gg = find('garage')[0];
  if (Gg) chk(1.5, near(Gg, K, 9) ? 1 : near(Gg, K, 13) ? 0.5 : 0, 'Garage → kitchen (groceries)');
  if (Gg && find('laundry')[0]) chk(0.8, adj(Gg, find('laundry')[0]) ? 1 : near(Gg, find('laundry')[0], 6) ? 0.5 : 0, 'Garage ↔ laundry (mudroom)');
  const st = find('stair').find((r) => r.floor === 0), fy = find('foyer')[0];
  if (st) chk(1, near(st, fy, 4.5) ? 1 : near(st, fy, 7) ? 0.5 : 0, 'Entry ↔ stair');
  // every bedroom floor has a shared bath (or the bedroom is master w/ ensuite)
  for (const f of d.floors) {
    const beds = f.rooms.filter((r) => r.type === 'bedroom' || r.type === 'guest' || (r.type === 'master' && !find('ensuite')[0]));
    if (!beds.length) continue;
    chk(2, f.rooms.some((r) => r.type === 'bath'), `Bath on level ${f.level}`);
  }
  if (all.some((r) => r.unreachable)) chk(4, false, 'All rooms reachable');
  M.adjacency = (sum(checks.map((c) => c.w * c.ok)) / sum(checks.map((c) => c.w))) * 100;
  d.adjChecks = checks;

  // privacy
  let p = 100;
  const publicT = new Set(['living', 'kitchen', 'dining', 'family', 'media', 'garage', 'gym']);
  for (const f of d.floors) {
    for (const r of f.rooms) {
      if (!BEDROOMS.has(r.type)) continue;
      if (d.nFloors > 1 && f.level === 0 && r.type !== 'guest') p -= 14;
      if (r.band === 'front' && f.level === 0) p -= 5;
      for (const q of f.rooms) if (publicT.has(q.type) && shared(r, q, 0.8)) p -= 7;
    }
  }
  if (d.nFloors === 1 && L && Ms) p += map(Math.abs(L.x - Ms.x) / d.W, 0.2, 0.6, -10, 6);
  M.privacy = clamp(p, 0, 100);

  // area fit
  M.areaFit = clamp(100 - (Math.abs(gross - b.area) / b.area) * 260, 0, 100);

  // site
  const plotA = b.plotW * b.plotD;
  const fp = sum(d.floors[0].rooms.map(area));
  const s = d.site;
  const hard = (s.driveway ? s.driveway.w * s.driveway.h : 0) + (s.patio ? s.patio.w * s.patio.h : 0) + (s.pool ? s.pool.w * s.pool.h : 0);
  const gardenRatio = (plotA - fp - hard) / plotA;
  let site = map(gardenRatio, 0.3, 0.7, 40, 100);
  if (!s.fitsW) site -= 25 + clamp(s.overW, 0, 5) * 8;
  if (!s.fitsD) site -= 30;
  M.site = clamp(site, 0, 100);

  // economy: compactness, wet-stack, roof simplicity
  const P = 2 * (d.W + d.D);
  const compact = (4 * Math.sqrt(d.W * d.D)) / P;
  let stacked = 1;
  if (d.nFloors > 1) {
    const ups = d.floors.slice(1).flatMap((f) => f.rooms.filter((r) => WET.has(r.type)));
    const below = (r) => d.floors[r.floor - 1].rooms.some((q) => (WET.has(q.type) || q.type === 'kitchen' || q.type === 'laundry') && q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y);
    stacked = ups.length ? ups.filter(below).length / ups.length : 1;
  }
  const terr = d.floors.some((f) => f.terraces.length) ? 0.85 : 1;
  const storeyK = { 1: 0.86, 2: 1, 3: 0.92 }[d.nFloors];
  M.economy = clamp((map(compact, 0.65, 0.95, 30, 100) * 0.55 + stacked * 100 * 0.25 + 100 * terr * 0.2) * storeyK, 0, 100);

  // weighted overall
  const pr = b.pri;
  const W = {
    efficiency: 1 + pr.budget / 100, proportion: 1.3, light: 0.8 + pr.light / 50, adjacency: 1.3 + pr.open / 100,
    privacy: 0.6 + pr.privacy / 50, sun: 0.5 + pr.light / 100, areaFit: 1.1, site: 0.6 + pr.garden / 50, economy: 0.4 + pr.budget / 40,
  };
  const score = sum(Object.keys(W).map((k) => W[k] * M[k])) / sum(Object.values(W));

  // cost
  const rate = d.style.rate;
  const storeyCost = { 1: 1.06, 2: 1, 3: 1.04 }[d.nFloors];
  let cost = gross * rate * storeyCost + garageA * 950 + terraceA * 650;
  if (s.pool) cost += 48000;
  if (s.patio) cost += s.patio.w * s.patio.h * 280;
  if (b.kitchen === 'island') cost += 9000;
  cost *= 1 + map(b.ceiling, 2.6, 3.6, 0, 0.08);

  return {
    ...Object.fromEntries(Object.entries(M).map(([k, v]) => [k, Math.round(v)])),
    score: Math.round(score),
    gross: Math.round(gross), net: Math.round(net), garage: Math.round(garageA), terrace: Math.round(terraceA),
    circ: Math.round(circ), footprint: Math.round(fp), gardenRatio, compact,
    cost, costLow: cost * 0.88, costHigh: cost * 1.14,
  };
}

// ── Narrative insights ──────────────────────────────────────
export function describe(d) {
  const b = d.brief, M = d.metrics;
  const all = d.floors.flatMap((f) => f.rooms);
  const lines = [], warns = [];
  const L = all.find((r) => r.type === 'living');
  const gF = d.floors[0];
  const slide = gF.openings.find((o) => o.kind === 'slide' && (o.a === L?.id || o.b === L?.id));
  const rearDir = compass('N', b.street);
  const dirName = { N: 'north', S: 'south', E: 'east', W: 'west' };
  if (L && slide) lines.push(`Living room opens ${(slide.e - slide.s).toFixed(1)} m of sliding glass onto the ${dirName[rearDir]}-facing garden.`);
  const K = all.find((r) => r.type === 'kitchen');
  if (K) lines.push(b.kitchen === 'island' || b.kitchen === 'open'
    ? `${b.kitchen === 'island' ? 'Island kitchen' : 'Open kitchen'} flows straight into dining${d.variant.kitchenFront ? ' across the spine, keeping the street side active' : ' along the garden façade'}.`
    : `${b.kitchen === 'galley' ? 'Galley' : 'Enclosed'} kitchen keeps cooking contained, with a direct door to dining.`);
  const Ms = all.find((r) => r.type === 'master');
  if (Ms) {
    const corner = Ms.x < 0.05 || Ms.x + Ms.w > d.W - 0.05;
    const ex = [all.find((r) => r.type === 'ensuite') && 'ensuite', all.find((r) => r.type === 'wic') && 'walk-in closet'].filter(Boolean).join(' & ');
    lines.push(`Master suite${d.nFloors > 1 ? ` on level ${Ms.floor}` : ''}${corner ? ' takes a dual-aspect corner' : ''}${ex ? ` with ${ex}` : ''}${d.floors[Ms.floor].balconies.length ? ' and a private balcony' : ''}.`);
  }
  if (d.nFloors > 1) lines.push(`U-stair sits ${(() => { const s = all.find((r) => r.type === 'stair'); const c = (s.x + STAIR_W / 2) / d.W; return c < 0.3 || c > 0.7 ? 'to the side' : 'centrally'; })()} off the entry, aligning all ${d.nFloors} levels on one vertical core.`);
  const terr = d.floors.flatMap((f) => f.terraces);
  if (terr.length) lines.push(`Upper volume steps back to create ${Math.round(sum(terr.map((t) => t.w * t.h)))} m² of terrace.`);
  if (M.economy > 75 && d.nFloors > 1) lines.push('Wet rooms stack vertically — shorter plumbing runs and lower build cost.');
  if (d.site.pool) lines.push('Pool positioned beyond the patio, aligned with the living axis.');
  if (!d.site.fitsW) warns.push(`Footprint is ${d.site.overW.toFixed(1)} m wider than the buildable width — consider another storey or a smaller brief.`);
  if (!d.site.fitsD) warns.push('Footprint exceeds buildable depth after setbacks.');
  for (const c of d.adjChecks || []) if (c.ok < 0.5 && c.w >= 2) warns.push(`Weak link: ${c.label}.`);
  if (M.areaFit < 60) warns.push(`Gross area ${M.gross} m² deviates from the ${b.area} m² target — the program needs ${M.gross > b.area ? 'more' : 'less'} space than requested.`);
  return { lines, warns };
}

// ── Variant search & recommendation ─────────────────────────
export function recommend(b, count = 4) {
  const F = clamp(Math.round(b.floors), 1, 3);
  const dBs = [4.4, 5.0, 5.6];
  const dFs = b.garage ? [4.0, 4.6, 5.2] : [3.8, 4.4, 5.0];
  const stairs = F > 1 ? [0, 1, 2] : [0];
  const cands = [];
  for (const dB of dBs) for (const dF of dFs) for (const stair of stairs) for (const mirror of [false, true]) for (const kitchenFront of [false, true]) {
    try {
      cands.push(generateDesign(b, { dB, dF, stair, mirror, kitchenFront }, { furnish: false }));
    } catch (e) { console.warn('variant failed', e); }
  }
  cands.sort((p, q) => q.metrics.score - p.metrics.score || p.metrics.gross - q.metrics.gross);
  // drop geometric duplicates (different parameters can converge on the same plan)
  const seen = new Set();
  const uniqC = cands.filter((d) => {
    const g = d.floors.map((f) => f.rooms.map((r) => `${r.type}${r.x.toFixed(1)},${r.y.toFixed(1)},${r.w.toFixed(1)}`).sort().join(';')).join('|');
    if (seen.has(g)) return false; seen.add(g); return true;
  });
  cands.length = 0; cands.push(...uniqC);
  const picks = [];
  const sig = (d) => `${d.variant.kitchenFront}|${d.variant.stair}`;
  for (const c of cands) { if (picks.length >= count) break; if (!picks.some((p) => sig(p) === sig(c))) picks.push(c); }
  for (const c of cands) { if (picks.length >= count) break; if (!picks.includes(c) && !picks.some((p) => p.variant.mirror === c.variant.mirror && sig(p) === sig(c) && Math.abs(p.W - c.W) < 0.6)) picks.push(c); }
  picks.sort((p, q) => q.metrics.score - p.metrics.score);
  const seed = Math.abs(hash(JSON.stringify(b))) % OPTION_NAMES.length;
  picks.forEach((d, i) => {
    furnishDesign(d);
    d.name = OPTION_NAMES[(seed + i * 5) % OPTION_NAMES.length];
    d.letter = String.fromCharCode(65 + i);
    d.tags = tagsFor(d);
    d.story = describe(d);
  });
  return { picks, explored: cands.length };
}

function tagsFor(d) {
  const t = [];
  const ratio = d.W / d.D;
  t.push(ratio > 1.9 ? 'Linear' : ratio < 1.25 ? 'Compact' : 'Balanced');
  t.push(d.variant.kitchenFront ? 'Street kitchen' : 'Garden kitchen');
  if (d.nFloors > 1) {
    const s = d.floors[0].rooms.find((r) => r.type === 'stair');
    const c = (s.x + STAIR_W / 2) / d.W;
    t.push(c < 0.3 || c > 0.7 ? 'Side core' : 'Central core');
  }
  if (d.floors.some((f) => f.terraces.length)) t.push('Terrace');
  return t;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
