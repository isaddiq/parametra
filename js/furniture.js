// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Furniture layout
//  Each room is solved in a canonical frame where the entry wall is
//  "S" (v = 0). Items are placed against walls with collision checks
//  that respect door swings and open edges, then transformed back.
// ─────────────────────────────────────────────────────────────

const SIDE_MAP = {
  S: { S: 'S', N: 'N', W: 'W', E: 'E' },
  N: { S: 'N', N: 'S', W: 'E', E: 'W' },
  W: { S: 'W', W: 'N', N: 'E', E: 'S' },
  E: { S: 'E', W: 'S', N: 'W', E: 'N' },
};
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function planSides(r, f) {
  const defs = {
    S: { axis: 'h', c: r.y, s: r.x, e: r.x + r.w, me: 'b' },
    N: { axis: 'h', c: r.y + r.h, s: r.x, e: r.x + r.w, me: 'a' },
    W: { axis: 'v', c: r.x, s: r.y, e: r.y + r.h, me: 'b' },
    E: { axis: 'v', c: r.x + r.w, s: r.y, e: r.y + r.h, me: 'a' },
  };
  const out = {};
  for (const [k, df] of Object.entries(defs)) {
    const on = (o) => o.axis === df.axis && Math.abs(o.c - df.c) < 1e-3 && o.s < df.e - 1e-3 && o.e > df.s + 1e-3;
    const clip = (o) => [Math.max(o.s, df.s), Math.min(o.e, df.e)];
    const walls = (f.walls || []).filter((w) => on(w) && w[df.me] === r.id);
    const ops = (f.openings || []).filter((o) => on(o) && (o.a === r.id || o.b === r.id));
    out[k] = {
      ...df,
      solid: walls.filter((w) => w.type !== 'open').map(clip),
      open: walls.filter((w) => w.type === 'open').map(clip),
      doors: ops.filter((o) => o.kind !== 'window').map((o) => ({ iv: clip(o), kind: o.kind, into: o.into })),
      wins: ops.filter((o) => o.kind === 'window').map((o) => ({ iv: clip(o), sill: o.sill })),
    };
  }
  return out;
}

export function furnishRoom(r, f, d) {
  const ps = planSides(r, f);
  // entry side: side holding the door into this room, else biggest open edge, else the spine side
  let entry = null;
  for (const k of ['S', 'N', 'W', 'E']) if (ps[k].doors.some((dr) => dr.into === r.id && dr.kind !== 'slide')) { entry = k; break; }
  if (!entry) for (const k of ['S', 'N', 'W', 'E']) if (ps[k].doors.some((dr) => dr.kind === 'door' || dr.kind === 'double')) { entry = k; break; }
  if (!entry) {
    let best = 0;
    for (const k of ['S', 'N', 'W', 'E']) { const L = ps[k].open.reduce((s, [a, b]) => s + b - a, 0); if (L > best) { best = L; entry = k; } }
  }
  if (!entry) entry = r.band === 'back' ? 'S' : r.band === 'front' ? 'N' : 'S';
  if (r.type === 'garage') entry = ps.S.doors.some((x) => x.kind === 'garage') ? 'N' : ps.N.doors.some((x) => x.kind === 'garage') ? 'S' : entry;

  const T = {
    S: (u, v) => [r.x + u, r.y + v],
    N: (u, v) => [r.x + r.w - u, r.y + r.h - v],
    W: (u, v) => [r.x + v, r.y + r.h - u],
    E: (u, v) => [r.x + r.w - v, r.y + u],
  }[entry];
  const Tinv = {
    S: (px, py) => [px - r.x, py - r.y],
    N: (px, py) => [r.x + r.w - px, r.y + r.h - py],
    W: (px, py) => [r.y + r.h - py, px - r.x],
    E: (px, py) => [py - r.y, r.x + r.w - px],
  }[entry];
  const cw = entry === 'S' || entry === 'N' ? r.w : r.h;
  const ch = entry === 'S' || entry === 'N' ? r.h : r.w;
  const sm = SIDE_MAP[entry];

  // canonical sides
  const cs = {};
  for (const k of ['S', 'N', 'W', 'E']) {
    const p = ps[sm[k]];
    const conv = ([a, b]) => {
      const pa = p.axis === 'h' ? Tinv(a, p.c) : Tinv(p.c, a);
      const pb = p.axis === 'h' ? Tinv(b, p.c) : Tinv(p.c, b);
      const i = k === 'S' || k === 'N' ? 0 : 1;
      return [Math.min(pa[i], pb[i]), Math.max(pa[i], pb[i])];
    };
    cs[k] = {
      len: k === 'S' || k === 'N' ? cw : ch,
      solid: p.solid.map(conv), open: p.open.map(conv),
      doors: p.doors.map((x) => ({ ...x, iv: conv(x.iv) })),
      wins: p.wins.map((x) => ({ ...x, iv: conv(x.iv) })),
    };
  }

  const ctx = makeCtx(cw, ch, cs, d, r);
  const fn = LAYOUTS[r.type];
  if (fn) { try { fn(ctx); } catch (e) { console.warn('furnish', r.type, e); } }

  // back to plan
  return ctx.items.map((it) => {
    const [x1, y1] = T(it.x, it.y);
    const [x2, y2] = T(it.x + it.w, it.y + it.h);
    return { ...it, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), back: sm[it.back || 'N'] };
  });
}

// ── Placement context ───────────────────────────────────────
function makeCtx(cw, ch, cs, d, r) {
  const items = [];
  const reserved = [];
  // door swing clearances & open-edge strips
  for (const k of ['S', 'N', 'W', 'E']) {
    for (const dr of cs[k].doors) {
      const [a, b] = dr.iv; const dep = dr.kind === 'slide' || dr.kind === 'garage' ? 0.8 : Math.min(b - a + 0.15, 1.1);
      reserved.push(wallRectRaw(k, a - 0.05, b + 0.05, 0, dep, cw, ch));
    }
    for (const [a, b] of cs[k].open) reserved.push(wallRectRaw(k, a, b, 0, 0.55, cw, ch));
  }
  const overl = (p, q, m = 0) => p.x < q.x + q.w - m && p.x + p.w > q.x + m && p.y < q.y + q.h - m && p.y + p.h > q.y + m;
  const ctx = {
    cw, ch, cs, d, r, items, reserved,
    style: d.style, brief: d.brief,
    wr: (side, l0, l1, d0, d1) => wallRectRaw(side, l0, l1, d0, d1, cw, ch),
    fits(rect, { flat = false, ignoreReserved = false } = {}) {
      if (rect.w <= 0.05 || rect.h <= 0.05) return false;
      if (rect.x < -1e-3 || rect.y < -1e-3 || rect.x + rect.w > cw + 1e-3 || rect.y + rect.h > ch + 1e-3) return false;
      if (flat) return true;
      if (!ignoreReserved && reserved.some((q) => overl(rect, q, 0.01))) return false;
      return !items.some((q) => !q.flat && overl(rect, q, 0.01));
    },
    add(t, rect, back, opts = {}) {
      const it = { t, ...rect, back, ...opts };
      if (!ctx.fits(it, opts)) return null;
      items.push(it); return it;
    },
    force(t, rect, back, opts = {}) { const it = { t, ...rect, back, ...opts }; items.push(it); return it; },
    /** free (no door/open) intervals along a canonical side; tall=true also avoids windows */
    freeIntervals(side, { tall = false, margin = 0.08 } = {}) {
      const s = cs[side];
      let ivs = s.solid.map(([a, b]) => [a, b]);
      const cut = (lst, [a, b]) => lst.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, a], [b, y]].filter(([p, q]) => q - p > 0.05)));
      for (const dr of s.doors) ivs = cut(ivs, [dr.iv[0] - margin, dr.iv[1] + margin]);
      if (tall) for (const w of s.wins) ivs = cut(ivs, [w.iv[0] - 0.05, w.iv[1] + 0.05]);
      // merge adjacent
      ivs.sort((p, q) => p[0] - q[0]);
      const m = [];
      for (const iv of ivs) { const l = m[m.length - 1]; if (l && iv[0] - l[1] < 0.02) l[1] = Math.max(l[1], iv[1]); else m.push([...iv]); }
      return m;
    },
    longestFree(side, o) { return ctx.freeIntervals(side, o).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0] || null; },
    hasWindow(side, a = -1, b = 99) { return cs[side].wins.some((w) => w.iv[0] < b && w.iv[1] > a); },
    depthOf: (side) => (side === 'N' || side === 'S' ? ch : cw),
    lenOf: (side) => (side === 'N' || side === 'S' ? cw : ch),
    doorCenter(side = 'S') { const dr = cs[side].doors[0]; return dr ? (dr.iv[0] + dr.iv[1]) / 2 : null; },
    corners: () => [[0.05, 0.05], [cw - 0.55, 0.05], [0.05, ch - 0.55], [cw - 0.55, ch - 0.55]],
  };
  return ctx;
}

function wallRectRaw(side, l0, l1, d0, d1, cw, ch) {
  switch (side) {
    case 'N': return { x: l0, y: ch - d1, w: l1 - l0, h: d1 - d0 };
    case 'S': return { x: l0, y: d0, w: l1 - l0, h: d1 - d0 };
    case 'W': return { x: d0, y: l0, w: d1 - d0, h: l1 - l0 };
    case 'E': return { x: cw - d1, y: l0, w: d1 - d0, h: l1 - l0 };
  }
}

// try several positions along a wall
function alongWall(ctx, t, side, len, dep, { at = 'center', tall = false, d0 = 0, back, opts = {}, step = 0.15 } = {}) {
  const ivs = ctx.freeIntervals(side, { tall }).filter(([a, b]) => b - a >= len - 1e-3).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  for (const [a, b] of ivs) {
    let pos = [];
    for (let p = a; p <= b - len + 1e-3; p += step) pos.push(p);
    pos.push(b - len);
    if (at === 'center') { const c = (a + b) / 2; pos.sort((p, q) => Math.abs(p + len / 2 - c) - Math.abs(q + len / 2 - c)); }
    if (at === 'end') pos.reverse();
    for (const p of pos) {
      if (p < a - 1e-3 || p + len > b + 1e-3) continue;
      const it = ctx.add(t, ctx.wr(side, p, p + len, d0, d0 + dep), back || side, opts);
      if (it) return it;
    }
  }
  return null;
}

// ── Layouts ─────────────────────────────────────────────────
const LAYOUTS = {
  master: (c) => bedroom(c, 'master'),
  bedroom: (c) => bedroom(c, 'bedroom'),
  guest: (c) => bedroom(c, 'guest'),
  living: (c) => lounge(c, { sofa: 2.6, chairs: true }),
  family: (c) => lounge(c, { sofa: 2.3, chairs: true }),
  media: (c) => media(c),
  flex: (c) => { lounge(c, { sofa: 2.0, chairs: false }); alongWall(c, 'desk', 'N', 1.3, 0.6, { at: 'start' }); },
  dining: (c) => dining(c),
  kitchen: (c) => kitchen(c),
  bath: (c) => bath(c, false),
  ensuite: (c) => bath(c, true),
  powder: (c) => powder(c),
  wic: (c) => wic(c),
  pantry: (c) => shelves(c, 0.45, ['W', 'E', 'N']),
  linen: (c) => shelves(c, 0.5, ['N', 'W', 'E']),
  storage: (c) => shelves(c, 0.55, ['N', 'W', 'E']),
  laundry: (c) => laundry(c),
  study: (c) => study(c),
  gym: (c) => gym(c),
  foyer: (c) => foyer(c),
  garage: (c) => garage(c),
  terrace: (c) => terrace(c),
  balcony: (c) => balcony(c),
  hall: (c) => hall(c),
};

function bedroom(c, kind) {
  const { cw, ch } = c;
  const bw = kind === 'master' ? 1.8 : kind === 'guest' ? 1.6 : Math.min(cw, ch) >= 3.2 ? 1.6 : 1.4;
  const bl = 2.1;
  const dc = c.doorCenter('S') ?? cw / 2;
  const cands = [];
  for (const side of ['E', 'W', 'N']) {
    const depthAvail = c.depthOf(side), len = c.lenOf(side);
    if (depthAvail < bl + 0.7) continue;
    const span = bw + 1.0;
    const ivs = c.freeIntervals(side).filter(([a, b]) => b - a >= span);
    for (const [a, b] of ivs) {
      let center = side === 'N' ? (a + b) / 2 : clamp(len * 0.58, a + span / 2, b - span / 2);
      center = clamp(center, a + span / 2, b - span / 2);
      let score = 0;
      if (side !== 'N') score += (side === 'E') === (dc < cw / 2) ? 3 : 1;
      if (!c.hasWindow(side, center - bw / 2, center + bw / 2)) score += 1.5;
      if (side === 'N') score += 0.5;
      cands.push({ side, center, score });
    }
  }
  cands.sort((p, q) => q.score - p.score);
  let bed = null, bedSide = null, bc = 0;
  for (const cd of cands) {
    bed = c.add('bed', c.wr(cd.side, cd.center - bw / 2, cd.center + bw / 2, 0, bl), cd.side, { size: bw });
    if (bed) { bedSide = cd.side; bc = cd.center; break; }
  }
  if (!bed) { // fallback: center of room
    const x = cw / 2 - bw / 2, y = Math.max(0.9, ch - bl - 0.1);
    bed = c.force('bed', { x, y, w: bw, h: Math.min(bl, ch - 1) }, 'N', { size: bw }); bedSide = 'N'; bc = cw / 2;
  }
  c.items.unshift({ t: 'rug', ...c.wr(bedSide, bc - bw / 2 - 0.55, bc + bw / 2 + 0.55, 0.6, Math.min(bl + 0.6, c.depthOf(bedSide) - 0.3)), back: bedSide, flat: true });
  c.add('nightstand', c.wr(bedSide, bc - bw / 2 - 0.52, bc - bw / 2 - 0.06, 0, 0.42), bedSide);
  c.add('nightstand', c.wr(bedSide, bc + bw / 2 + 0.06, bc + bw / 2 + 0.52, 0, 0.42), bedSide);
  if (kind === 'master') c.add('bench', c.wr(bedSide, bc - bw / 2 + 0.15, bc + bw / 2 - 0.15, bl + 0.05, bl + 0.5), bedSide);
  const hasWic = kind === 'master' && c.d.floors.some((f) => f.rooms.some((x) => x.type === 'wic'));
  if (!hasWic) {
    const opp = OPP[bedSide];
    let ok = null;
    for (const side of [opp, 'S', 'N', bedSide === 'N' ? 'E' : 'S']) {
      const fi = c.longestFree(side, { tall: true });
      if (!fi) continue;
      const len = Math.min(2.4, fi[1] - fi[0] - 0.05);
      if (len < 1.2) continue;
      ok = alongWall(c, 'wardrobe', side, len, 0.6, { tall: true });
      if (ok) break;
    }
  }
  if (cw * ch > 11.5) {
    const desk = alongWall(c, 'desk', 'N', 1.1, 0.55, { at: bedSide === 'E' ? 'start' : 'end' }) || alongWall(c, 'desk', OPP[bedSide] === 'S' ? 'E' : OPP[bedSide], 1.1, 0.55, {});
    if (desk) addChairFor(c, desk);
  }
  if (kind === 'master' && cw * ch > 14) placeInCorner(c, 'armchair', 0.8, 0.8);
  placeInCorner(c, 'plant', 0.45, 0.45);
}

function addChairFor(c, desk) {
  const s = desk.back; const sz = 0.5;
  let rect;
  const cx = desk.x + desk.w / 2, cy = desk.y + desk.h / 2;
  if (s === 'N') rect = { x: cx - sz / 2, y: desk.y - sz + 0.1, w: sz, h: sz };
  if (s === 'S') rect = { x: cx - sz / 2, y: desk.y + desk.h - 0.1, w: sz, h: sz };
  if (s === 'W') rect = { x: desk.x + desk.w - 0.1, y: cy - sz / 2, w: sz, h: sz };
  if (s === 'E') rect = { x: desk.x - sz + 0.1, y: cy - sz / 2, w: sz, h: sz };
  return c.add('chair', rect, s, { ignoreReserved: false }) || null;
}

function placeInCorner(c, t, w, h) {
  const { cw, ch } = c;
  const pts = [[cw - w - 0.08, ch - h - 0.08, 'N'], [0.08, ch - h - 0.08, 'N'], [cw - w - 0.08, 0.08, 'S'], [0.08, 0.08, 'S']];
  for (const [x, y, b] of pts) { const it = c.add(t, { x, y, w, h }, b); if (it) return it; }
  return null;
}

function lounge(c, { sofa = 2.6, chairs = true }) {
  const { cw, ch } = c;
  // choose media wall
  const opts = [];
  for (const side of ['W', 'E', 'N', 'S']) {
    const fi = c.longestFree(side, { tall: false });
    if (!fi || fi[1] - fi[0] < 1.6) continue;
    const depth = c.depthOf(side);
    if (depth < 3.2) continue;
    let score = fi[1] - fi[0];
    if (c.hasWindow(side, fi[0], fi[1])) score -= 1.5;
    if (side === 'S') score -= 2;
    opts.push({ side, fi, score });
  }
  opts.sort((p, q) => q.score - p.score);
  for (const o of opts) {
    const { side, fi } = o;
    const len = c.lenOf(side);
    const depth = c.depthOf(side);
    const center = clamp(len / 2, fi[0] + 1.0, fi[1] - 1.0);
    const sl = Math.min(sofa, len - 1.4);
    if (sl < 1.6) continue;
    const dist = clamp(depth - 0.45 - 0.95 - 0.9, 2.0, 3.3);
    const tv = c.add('tvunit', c.wr(side, center - Math.min(1.1, (fi[1] - fi[0]) / 2 - 0.05), center + Math.min(1.1, (fi[1] - fi[0]) / 2 - 0.05), 0, 0.45), side);
    if (!tv) continue;
    const s0 = 0.45 + dist;
    const so = c.add('sofa', c.wr(side, center - sl / 2, center + sl / 2, s0, s0 + 0.95), OPP[side], { len: sl });
    if (!so) { c.items.splice(c.items.indexOf(tv), 1); continue; }
    c.items.unshift({ t: 'rug', ...c.wr(side, center - sl / 2 - 0.2, center + sl / 2 + 0.2, 0.9, s0 + 0.5), back: side, flat: true });
    c.add('coffee', c.wr(side, center - 0.6, center + 0.6, s0 - 1.05, s0 - 0.45), side);
    if (chairs) {
      c.add('armchair', c.wr(side, center - sl / 2 - 0.95, center - sl / 2 - 0.15, s0 - 1.2, s0 - 0.4), side === 'N' || side === 'S' ? 'W' : 'S', { turn: true });
      c.add('armchair', c.wr(side, center + sl / 2 + 0.15, center + sl / 2 + 0.95, s0 - 1.2, s0 - 0.4), side === 'N' || side === 'S' ? 'E' : 'N', { turn: true });
    }
    c.add('lamp', c.wr(side, center + sl / 2 + 0.1, center + sl / 2 + 0.45, s0 + 0.5, s0 + 0.85), side);
    placeInCorner(c, 'plant', 0.5, 0.5);
    alongWall(c, 'shelf', OPP[side] === 'S' ? (side === 'N' ? 'W' : 'N') : OPP[side], 1.6, 0.38, { tall: true });
    return;
  }
  // fallback: just a sofa in the middle
  const sl = Math.min(sofa, cw - 0.8);
  c.force('sofa', { x: cw / 2 - sl / 2, y: ch / 2, w: sl, h: 0.95 }, 'S', { len: sl });
  c.force('coffee', { x: cw / 2 - 0.55, y: ch / 2 + 1.2, w: 1.1, h: 0.6 }, 'S');
}

function media(c) {
  const side = ['W', 'E', 'N'].map((s) => ({ s, fi: c.longestFree(s, { tall: true }) })).filter((o) => o.fi).sort((p, q) => (q.fi[1] - q.fi[0]) - (p.fi[1] - p.fi[0]))[0]?.s || 'N';
  const len = c.lenOf(side), depth = c.depthOf(side);
  const center = len / 2;
  c.add('screen', c.wr(side, center - Math.min(1.5, len / 2 - 0.3), center + Math.min(1.5, len / 2 - 0.3), 0, 0.12), side);
  const sl = Math.min(3.0, len - 0.6);
  const s0 = clamp(depth * 0.5, 2.4, depth - 1.1);
  c.add('sofa', c.wr(side, center - sl / 2, center + sl / 2, s0, s0 + 1.0), OPP[side], { len: sl, deep: true });
  c.items.unshift({ t: 'rug', ...c.wr(side, center - sl / 2, center + sl / 2, 1.0, s0 + 0.6), back: side, flat: true });
  c.add('coffee', c.wr(side, center - 0.5, center + 0.5, s0 - 0.9, s0 - 0.35), side);
  placeInCorner(c, 'plant', 0.45, 0.45);
}

function dining(c) {
  const { cw, ch } = c;
  const long = cw >= ch ? 'u' : 'v';
  const L = Math.max(cw, ch), S = Math.min(cw, ch);
  if (L < 3.1 && S < 3.1) {
    const dia = 1.1, x = cw / 2 - dia / 2, y = ch / 2 - dia / 2;
    c.force('rtable', { x, y, w: dia, h: dia }, 'N');
    const pos = [[cw / 2 - 0.25, y - 0.55, 'S'], [cw / 2 - 0.25, y + dia + 0.05, 'N'], [x - 0.55, ch / 2 - 0.25, 'W'], [x + dia + 0.05, ch / 2 - 0.25, 'E']];
    for (const [px, py, b] of pos) c.add('dchair', { x: px, y: py, w: 0.5, h: 0.5 }, b, { ignoreReserved: true });
    return;
  }
  const tl = clamp(L - 2.0, 1.2, 2.6), tw = 0.95;
  const n = Math.max(1, Math.floor(tl / 0.62));
  const t = long === 'u' ? { x: cw / 2 - tl / 2, y: ch / 2 - tw / 2, w: tl, h: tw } : { x: cw / 2 - tw / 2, y: ch / 2 - tl / 2, w: tw, h: tl };
  c.force('table', t, 'N', { pendant: true });
  for (let i = 0; i < n; i++) {
    const off = (tl / n) * (i + 0.5) - 0.24;
    if (long === 'u') {
      c.add('dchair', { x: t.x + off, y: t.y - 0.52, w: 0.48, h: 0.48 }, 'S', { ignoreReserved: true });
      c.add('dchair', { x: t.x + off, y: t.y + tw + 0.04, w: 0.48, h: 0.48 }, 'N', { ignoreReserved: true });
    } else {
      c.add('dchair', { x: t.x - 0.52, y: t.y + off, w: 0.48, h: 0.48 }, 'W', { ignoreReserved: true });
      c.add('dchair', { x: t.x + tw + 0.04, y: t.y + off, w: 0.48, h: 0.48 }, 'E', { ignoreReserved: true });
    }
  }
  if (L >= tl + 1.7) {
    if (long === 'u') {
      c.add('dchair', { x: t.x - 0.52, y: ch / 2 - 0.24, w: 0.48, h: 0.48 }, 'W', { ignoreReserved: true });
      c.add('dchair', { x: t.x + tl + 0.04, y: ch / 2 - 0.24, w: 0.48, h: 0.48 }, 'E', { ignoreReserved: true });
    } else {
      c.add('dchair', { x: cw / 2 - 0.24, y: t.y - 0.52, w: 0.48, h: 0.48 }, 'S', { ignoreReserved: true });
      c.add('dchair', { x: cw / 2 - 0.24, y: t.y + tl + 0.04, w: 0.48, h: 0.48 }, 'N', { ignoreReserved: true });
    }
  }
  for (const s of ['N', 'W', 'E']) if (alongWall(c, 'sideboard', s, 1.6, 0.45, { tall: false })) break;
  placeInCorner(c, 'plant', 0.45, 0.45);
}

function kitchen(c) {
  const { cw, ch } = c;
  const type = c.brief.kitchen;
  const D = 0.62;
  const runs = [];
  const runOn = (side, avoidCorners = []) => {
    let fi = c.longestFree(side, { tall: false, margin: 0.05 });
    if (!fi) return null;
    let [a, b] = fi;
    // trim corners occupied by other runs
    for (const o of runs) {
      const r = c.wr(side, a, b, 0, D);
      const ov = r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y;
      if (!ov) continue;
      const len = c.lenOf(side);
      if (side === 'N' || side === 'S') { if (o.x < cw / 2) a = Math.max(a, o.x + o.w); else b = Math.min(b, o.x); }
      else { if (o.y < ch / 2) a = Math.max(a, o.y + o.h); else b = Math.min(b, o.y); }
      void len;
    }
    if (b - a < 1.1) return null;
    const it = c.add('counter', c.wr(side, a, b, 0, D), side, { len: b - a, uppers: !c.hasWindow(side, a, b) });
    if (it) runs.push(it);
    return it;
  };
  const ranked = ['N', 'W', 'E', 'S'].map((s) => ({ s, fi: c.longestFree(s, { margin: 0.05 }) }))
    .filter((o) => o.fi).sort((p, q) => (q.fi[1] - q.fi[0] + (c.hasWindow(q.s) ? 0.6 : 0) + (q.s === 'S' ? -1.5 : 0)) - (p.fi[1] - p.fi[0] + (c.hasWindow(p.s) ? 0.6 : 0) + (p.s === 'S' ? -1.5 : 0)));
  if (!ranked.length) return;
  const first = ranked[0].s;
  const adjOf = (s) => (s === 'N' || s === 'S' ? ['W', 'E'] : ['N', 'S']);
  if (type === 'galley') {
    const pair = (c.longestFree('W') && c.longestFree('E') && cw >= 2.3) ? ['W', 'E'] : ['N', 'S'];
    runOn(pair[0]); runOn(pair[1]);
    if (!runs.length) runOn(first);
  } else {
    runOn(first);
    const adj = adjOf(first).map((s) => ({ s, fi: c.longestFree(s, { margin: 0.05 }) })).filter((o) => o.fi).sort((p, q) => (q.fi[1] - q.fi[0]) - (p.fi[1] - p.fi[0]));
    if (adj[0]) runOn(adj[0].s);
    if (type === 'closed' && adj[1]) runOn(adj[1].s);
  }
  // fridge at the end of the longest run
  const main = [...runs].sort((p, q) => q.len - p.len)[0];
  if (main && main.len > 2.2) {
    const s = main.back;
    const horizontal = s === 'N' || s === 'S';
    const fw = 0.75;
    // shrink run, put fridge at far end
    if (horizontal) { main.w -= fw; main.len -= fw; c.force('fridge', { x: main.x + main.w, y: main.y, w: fw, h: main.h + 0.05 }, s); }
    else { main.h -= fw; main.len -= fw; c.force('fridge', { x: main.x, y: main.y + main.h, w: main.w + 0.05, h: fw }, s); }
  }
  // sink under window, hob elsewhere
  const winRun = runs.find((r) => c.hasWindow(r.back)) || runs[0];
  if (winRun) winRun.sink = 0.5;
  const hobRun = runs.find((r) => r !== winRun) || winRun;
  if (hobRun) hobRun.hob = hobRun === winRun ? 0.18 : 0.5;
  if (hobRun === winRun && winRun) winRun.sink = 0.72;
  // island
  if (type === 'island' && main) {
    const s = main.back;
    const across = c.depthOf(s);
    const len = c.lenOf(s);
    const il = clamp(Math.min(len - 1.6, 2.6), 1.2, 2.6);
    const d0 = D + 1.05;
    if (across >= d0 + 0.95 + 0.6) {
      const center = len / 2;
      const isl = c.add('island', c.wr(s, center - il / 2, center + il / 2, d0, d0 + 0.95), s, { ignoreReserved: true });
      if (isl) {
        const n = Math.max(2, Math.floor(il / 0.6));
        for (let i = 0; i < n; i++) {
          const p = center - il / 2 + (il / n) * (i + 0.5);
          c.add('stool', c.wr(s, p - 0.2, p + 0.2, d0 + 0.95 + 0.05, d0 + 0.95 + 0.45), OPP[s], { ignoreReserved: true });
        }
      }
    }
  }
}

function bath(c, ensuite) {
  const { cw, ch } = c;
  const dc = c.doorCenter('S') ?? cw * 0.25;
  const fx = dc < cw / 2 ? 'E' : 'W';
  const ox = fx === 'E' ? 'W' : 'E';
  let wetDepth = 0;
  // N wall: tub or shower
  if (ensuite) {
    const sw = Math.min(1.4, cw - 0.2);
    const from = fx === 'E' ? cw - sw : 0;
    c.force('shower', { x: from, y: ch - 0.95, w: sw, h: 0.95 }, 'N');
    wetDepth = 0.95;
    if (cw >= 2.7 && ch >= 3.2) c.add('tub', fx === 'E' ? { x: 0.05, y: ch - 1.75, w: 0.8, h: 1.7 } : { x: cw - 0.85, y: ch - 1.75, w: 0.8, h: 1.7 }, fx === 'E' ? 'W' : 'E', { free: true });
  } else if (cw >= 1.7 && ch >= 2.2) {
    const tl = Math.min(1.7, cw);
    const from = fx === 'E' ? cw - tl : 0;
    c.force('tub', { x: from, y: ch - 0.76, w: tl, h: 0.76 }, 'N');
    wetDepth = 0.76;
  } else {
    const from = fx === 'E' ? cw - 0.9 : 0;
    c.force('shower', { x: from, y: ch - 0.9, w: 0.9, h: 0.9 }, 'N');
    wetDepth = 0.9;
  }
  const vl = ensuite && ch >= 3.4 ? 1.4 : 0.9;
  const vTop = ch - wetDepth - 0.08;
  const van = c.add('vanity', c.wr(fx, vTop - vl, vTop, 0, 0.5), fx, { double: vl > 1.2 }) ||
              c.add('vanity', c.wr(ox, vTop - vl, vTop, 0, 0.5), ox, { double: vl > 1.2 });
  const vStart = van ? (van.back === 'N' || van.back === 'S' ? van.x : van.y) : vTop;
  const wallT = van ? van.back : fx;
  if (!c.add('toilet', c.wr(wallT, vStart - 0.62, vStart - 0.12, 0, 0.7), wallT)) {
    c.add('toilet', c.wr(OPP[wallT], ch * 0.45, ch * 0.45 + 0.5, 0, 0.7), OPP[wallT]) ||
      c.add('toilet', c.wr(OPP[wallT], vTop - 0.55, vTop - 0.05, 0, 0.7), OPP[wallT]) ||
      c.force('toilet', c.wr(wallT, Math.max(0.05, vStart - 0.62), Math.max(0.55, vStart - 0.12), 0, 0.7), wallT);
  }
}

function powder(c) {
  const { cw, ch } = c;
  c.force('toilet', { x: cw / 2 - 0.25, y: ch - 0.7, w: 0.5, h: 0.7 }, 'N');
  c.add('basin', c.wr('W', ch * 0.35, ch * 0.35 + 0.5, 0, 0.36), 'W') || c.add('basin', c.wr('E', ch * 0.35, ch * 0.35 + 0.5, 0, 0.36), 'E');
}

function wic(c) {
  const { cw, ch } = c;
  for (const s of ['W', 'E', 'N']) {
    const fi = c.longestFree(s, { tall: true });
    if (fi && fi[1] - fi[0] > 0.8) c.add('wardrobe', c.wr(s, fi[0] + 0.02, fi[1] - 0.02, 0, 0.55), s, { open: true });
  }
  if (cw >= 2.8 && ch >= 2.4) c.add('dresser', { x: cw / 2 - 0.5, y: ch / 2 - 0.3, w: 1.0, h: 0.6 }, 'N');
}

function shelves(c, dep, sides) {
  for (const s of sides) {
    const fi = c.longestFree(s, { tall: true });
    if (fi && fi[1] - fi[0] > 0.6) c.add('shelf', c.wr(s, fi[0] + 0.02, fi[1] - 0.02, 0, dep), s);
  }
}

function laundry(c) {
  for (const s of ['N', 'W', 'E']) {
    const fi = c.longestFree(s, { tall: false });
    if (!fi || fi[1] - fi[0] < 1.3) continue;
    const a = fi[0] + 0.02;
    c.add('washer', c.wr(s, a, a + 0.62, 0, 0.62), s);
    c.add('washer', c.wr(s, a + 0.64, a + 1.26, 0, 0.62), s, { dryer: true });
    if (fi[1] - a > 2.0) c.add('counter', c.wr(s, a + 1.28, Math.min(fi[1] - 0.02, a + 2.6), 0, 0.62), s, { sink: 0.5, len: Math.min(fi[1] - 0.02, a + 2.6) - a - 1.28, uppers: true });
    break;
  }
  for (const s of ['W', 'E', 'N']) if (alongWall(c, 'tall', s, 0.6, 0.6, { tall: true })) break;
}

function study(c) {
  const desk = alongWall(c, 'desk', 'N', Math.min(1.5, c.cw - 0.4), 0.65, {}) || alongWall(c, 'desk', 'W', 1.4, 0.65, {}) || alongWall(c, 'desk', 'E', 1.4, 0.65, {});
  if (desk) addChairFor(c, desk);
  for (const s of ['W', 'E']) if (alongWall(c, 'shelf', s, Math.min(2.0, c.ch - 1.4), 0.36, { tall: true })) break;
  placeInCorner(c, 'armchair', 0.8, 0.8);
  placeInCorner(c, 'plant', 0.45, 0.45);
}

function gym(c) {
  const { cw, ch } = c;
  for (const s of ['W', 'E']) if (alongWall(c, 'treadmill', s, 1.9, 0.85, { back: OPP[s] === 'E' ? 'S' : 'S' })) break;
  c.add('mat', { x: cw / 2 - 0.45, y: ch / 2 - 0.9, w: 0.9, h: 1.8 }, 'N', { flat: true });
  for (const s of ['N', 'E', 'W']) if (alongWall(c, 'mirror', s, Math.min(2.4, c.lenOf(s) - 0.6), 0.06, { tall: true })) break;
  alongWall(c, 'rack', 'N', 1.2, 0.45, { at: 'end' });
  c.add('bench', { x: cw * 0.65 - 0.25, y: ch * 0.35, w: 0.5, h: 1.2 }, 'W');
}

function foyer(c) {
  const { cw, ch } = c;
  if (cw >= 2.5) alongWall(c, 'wardrobe', 'E', Math.min(1.8, ch - 1.2), 0.6, { tall: true }) || alongWall(c, 'wardrobe', 'W', Math.min(1.8, ch - 1.2), 0.6, { tall: true });
  for (const s of ['W', 'E', 'N']) if (alongWall(c, 'console', s, 1.1, 0.38, {})) break;
  alongWall(c, 'bench', 'W', 1.0, 0.42, {}) || alongWall(c, 'bench', 'E', 1.0, 0.42, {});
  placeInCorner(c, 'plant', 0.45, 0.45);
}

function garage(c) {
  const { cw, ch } = c;
  const cars = c.r.cars || 1;
  const carW = 1.9, carL = 4.6;
  const gap = (cw - cars * carW) / (cars + 1);
  for (let i = 0; i < cars; i++) {
    const x = gap + i * (carW + gap);
    c.force('car', { x, y: clamp(ch - carL - 0.35, 0.6, ch), w: carW, h: carL }, 'N', { color: ['#3D4B5C', '#B8BCC2', '#7A2E2A'][i % 3] });
  }
  c.add('shelf', c.wr('S', 0.1, Math.min(2.2, cw / 2 - 0.4), 0, 0.5), 'S', { ignoreReserved: true });
}

function terrace(c) {
  const { cw, ch } = c;
  if (cw * ch < 4) { placeInCorner(c, 'planter', 0.5, 0.5); return; }
  const long = cw >= ch;
  if (Math.min(cw, ch) >= 2.2) {
    if (long) {
      c.add('lounger', { x: 0.4, y: ch / 2 - 0.95, w: 0.7, h: 1.9 }, 'N', { flat: false });
      c.add('lounger', { x: 1.3, y: ch / 2 - 0.95, w: 0.7, h: 1.9 }, 'N');
      if (cw > 4.5) c.add('otable', { x: cw - 1.9, y: ch / 2 - 0.5, w: 1.4, h: 1.0 }, 'N', { chairs: 4 });
    } else {
      c.add('lounger', { x: cw / 2 - 0.95, y: 0.4, w: 1.9, h: 0.7 }, 'W');
      c.add('lounger', { x: cw / 2 - 0.95, y: 1.3, w: 1.9, h: 0.7 }, 'W');
      if (ch > 4.5) c.add('otable', { x: cw / 2 - 0.5, y: ch - 1.9, w: 1.0, h: 1.4 }, 'N', { chairs: 4 });
    }
  }
  placeInCorner(c, 'planter', 0.55, 0.55);
  placeInCorner(c, 'planter', 0.55, 0.55);
}

function balcony(c) {
  const { cw, ch } = c;
  c.add('chair', { x: cw / 2 - 0.9, y: ch / 2 - 0.25, w: 0.55, h: 0.55 }, 'S', { outdoor: true });
  c.add('otable', { x: cw / 2 - 0.25, y: ch / 2 - 0.25, w: 0.5, h: 0.5 }, 'N', { round: true });
  c.add('chair', { x: cw / 2 + 0.35, y: ch / 2 - 0.25, w: 0.55, h: 0.55 }, 'S', { outdoor: true });
  placeInCorner(c, 'planter', 0.45, 0.45);
}

function hall(c) {
  const { cw, ch } = c;
  if (cw > 6 && ch >= 1.1) {
    c.add('plant', { x: 0.1, y: ch / 2 - 0.2, w: 0.4, h: 0.4 }, 'N');
    c.add('plant', { x: cw - 0.5, y: ch / 2 - 0.2, w: 0.4, h: 0.4 }, 'N');
  }
}
