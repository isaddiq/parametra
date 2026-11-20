// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Planning rules as hard constraints
//
//  envelope()     turns the rules into caps the generator must respect
//                 before it lays anything out (buildable width and depth,
//                 maximum footprint and floor area).
//  checkDesign()  verifies a finished layout against every rule. A design
//                 that breaks any rule is rejected, not just scored lower.
//  diagnose()     explains why no layout passed: which rules no layout met,
//                 and the closest any layout came.
//  FIXES          candidate brief changes. The recommender tries them and
//                 only offers one after a regenerated layout passes.
// ─────────────────────────────────────────────────────────────
import { RULE_PROFILES, ZONING_KEYS, DEFAULT_RULES, ROOM_MINIMUMS, HABITABLE } from './data.js';
import { lotCapacity } from './lot.js';

const PLINTH = 0.15;          // ground to ground-floor level, as built in 3D
const DEG = Math.PI / 180;
const RISER_MAX = 0.19, TREAD = 0.26, TREAD_MIN = 0.25, CORRIDOR = 1.2, CORRIDOR_MIN = 0.9;
const DRIVEWAY_DEPTH = 5.0;   // a front setback this deep holds one parked car
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const sum = (a) => a.reduce((s, v) => s + v, 0);
// rooms that need daylight; kitchens may rely on artificial light, as most codes allow
const DAYLIT = new Set([...HABITABLE].filter((t) => t !== 'kitchen'));

export function rulesOf(b) { return { ...DEFAULT_RULES, ...(b.rules || {}) }; }

/** Profile key whose zoning values the rules match, or 'custom'. */
export function profileKey(r) {
  const p = RULE_PROFILES[r.profile];
  return p && ZONING_KEYS.every((k) => +p[k] === +r[k]) ? r.profile : 'custom';
}
export function profileName(r) { const k = profileKey(r); return k === 'custom' ? 'Custom rules' : `${RULE_PROFILES[k].name} rules`; }

/** Plot area: the drawn lot's true area, or width × depth. */
export const plotArea = (b) => (b.lot?.poly ? b.lot.area : b.plotW * b.plotD);
const MIN_HOUSE_W = 6; // a band narrower than this cannot hold the program

/**
 * Buildable envelope and zoning caps for a brief. For a rectangular plot, a box inside the
 * setbacks. For a drawn lot, `widthAt(depth)` gives the widest footprint that fits at that
 * depth and `place(w, d)` where it goes; W and D are the widest and deepest usable extents.
 */
export function envelope(b, r = rulesOf(b)) {
  const plotA = plotArea(b);
  if (b.lot?.poly) {
    const cap = lotCapacity(b.lot, { front: b.setFront, side: b.setSide, rear: b.setRear });
    return { plotA, lot: true, cap, W: cap.maxW, D: cap.maxDepth(MIN_HOUSE_W), widthAt: cap.widthAt, place: cap.place, footprint: Math.min(cap.area, (r.coverage / 100) * plotA), gross: r.far * plotA };
  }
  const W = Math.max(0, b.plotW - 2 * b.setSide);
  const D = Math.max(0, b.plotD - b.setFront - b.setRear);
  return { plotA, W, D, footprint: Math.min(W * D, (r.coverage / 100) * plotA), gross: r.far * plotA };
}

export function parking(b) {
  const drive = b.setFront >= DRIVEWAY_DEPTH ? 1 : 0;
  return { garage: b.garage, drive, total: b.garage + drive };
}

/**
 * Building height as most codes measure it: from the ground to the top of the parapet on a
 * flat roof, or to the mid-point between eave and ridge on a pitched roof. Ridge and eave
 * levels follow the roof the 3D model builds. Returns { value, ridge }.
 */
export function buildingHeight(d) {
  const st = d.style;
  const rooms = d.floors[d.nFloors - 1].rooms;
  const x0 = Math.min(...rooms.map((r) => r.x)), x1 = Math.max(...rooms.map((r) => r.x + r.w));
  const y0 = Math.min(...rooms.map((r) => r.y)), y1 = Math.max(...rooms.map((r) => r.y + r.h));
  const bw = x1 - x0, bh = y1 - y0;
  const eave = PLINTH + d.nFloors * d.H;
  const t = Math.tan(st.pitch * DEG);
  if (st.roof === 'flat') { const h = eave + (st.overhang > 0.05 ? 0.68 : 0.61); return { value: h, ridge: h }; }
  if (st.roof === 'float') return { value: eave + 0.38, ridge: eave + 0.38 };
  const rise = st.roof === 'shed' ? (bh + st.overhang) * t : (Math.min(bw, bh) / 2 + (st.roof === 'hip' ? 0.4 * st.overhang : 0)) * t;
  return { value: eave + rise / 2, ridge: eave + rise + 0.06 };
}

/** Glazing ratio per daylit space. Rooms open to each other count as one space. */
function daylightSpaces(f) {
  const rooms = f.rooms.filter((r) => DAYLIT.has(r.type));
  const ids = new Set(rooms.map((r) => r.id));
  const parent = Object.fromEntries(rooms.map((r) => [r.id, r.id]));
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const k of f.open) { const [a, c] = k.split('|'); if (ids.has(a) && ids.has(c)) parent[find(a)] = find(c); }
  const glass = (r) => sum(f.openings
    .filter((o) => (o.kind === 'window' || o.kind === 'slide') && (o.a === r.id || o.b === r.id) && (o.kind === 'window' ? o.room === r.id : !(o.a && o.b)))
    .map((o) => (o.e - o.s) * (o.head - o.sill)));
  const groups = {};
  for (const r of rooms) {
    const g = (groups[find(r.id)] ||= { rooms: [], area: 0, glass: 0 });
    g.rooms.push(r); g.area += r.w * r.h; g.glass += glass(r);
  }
  return Object.values(groups).map((g) => ({ ...g, ratio: g.glass / g.area, label: g.rooms.map((r) => r.label).join(' + ') }));
}

const RULES = {
  setbacks: { group: 'planning', label: 'Setbacks', desc: 'The house, garage included, fits inside the drawn lot, less the front, side and rear setbacks.' },
  'setback-side': { group: 'planning', label: 'Side setbacks', desc: 'The house fits between the side boundaries, less the side setbacks.' },
  'setback-depth': { group: 'planning', label: 'Front and rear setbacks', desc: 'The house fits between the front and rear setbacks, garage included.' },
  coverage: { group: 'planning', label: 'Site coverage', desc: 'Share of the plot covered by the ground floor, garage included.' },
  far: { group: 'planning', label: 'Floor area ratio', desc: 'Gross floor area, excluding the garage, divided by the plot area.' },
  height: { group: 'planning', label: 'Building height', desc: 'From the ground to the parapet on a flat roof, or to the mid-point of the roof slope on a pitched roof.' },
  storeys: { group: 'planning', label: 'Storeys', desc: 'Number of storeys above ground.' },
  garden: { group: 'planning', label: 'Planted ground', desc: 'Share of the plot left as garden after the house, driveway, patio and pool.' },
  parking: { group: 'planning', label: 'Off-street parking', desc: `Garage spaces, plus one on the driveway when the front setback is at least ${DRIVEWAY_DEPTH} m deep.` },
  ceiling: { group: 'building', label: 'Ceiling height', desc: 'Clear height of habitable rooms.' },
  'room-size': { group: 'building', label: 'Room sizes', desc: 'Every room meets its minimum floor area and minimum width.' },
  daylight: { group: 'building', label: 'Daylight', desc: 'Window area in each living room and bedroom, as a share of its floor area. Rooms open to each other count as one space. Kitchens may use artificial light.' },
  stair: { group: 'building', label: 'Stair geometry', desc: `Risers at most ${RISER_MAX * 1000} mm and treads at least ${TREAD_MIN * 1000} mm.` },
  corridor: { group: 'building', label: 'Corridor width', desc: `Halls at least ${CORRIDOR_MIN} m wide.` },
  access: { group: 'building', label: 'Room access', desc: 'Every room can be reached through a door.' },
};
export const RULE_INFO = RULES;

/** Check one design against every rule. */
export function checkDesign(d) {
  const b = d.brief, r = rulesOf(b), M = d.metrics, s = d.site, env = envelope(b, r);
  const items = [];
  const add = (id, value, limit, sense, detail) => {
    const ok = sense === 'max' ? value <= limit + 1e-6 : value >= limit - 1e-6;
    const over = ok ? 0 : Math.abs(value - limit) / Math.max(Math.abs(limit), 0.1);
    items.push({ id, ...RULES[id], value, limit, sense, ok, over, detail });
  };

  // zoning
  if (env.lot) {
    const Dt = d.D + s.prot, wmax = env.widthAt(Dt);
    add('setbacks', d.W, wmax, 'max', wmax > 0
      ? `${f1(d.W)} × ${f1(Dt)} m footprint; at that depth the lot fits ${f1(wmax)} m`
      : `${f1(d.W)} × ${f1(Dt)} m footprint; the lot is not ${f1(Dt)} m deep inside the setbacks`);
  } else {
    add('setback-side', d.W, env.W, 'max', `${f1(d.W)} m wide, ${f1(env.W)} m available`);
    add('setback-depth', d.D + s.prot, env.D, 'max', `${f1(d.D + s.prot)} m deep, ${f1(env.D)} m available`);
  }
  const cov = (M.footprint / env.plotA) * 100;
  add('coverage', cov, r.coverage, 'max', `${Math.round(cov)}% of the plot, ${r.coverage}% allowed`);
  const far = M.gross / env.plotA;
  add('far', far, r.far, 'max', `${f2(far)} (${M.gross} m² on ${Math.round(env.plotA)} m²), ${r.far} allowed`);
  const h = buildingHeight(d);
  add('height', h.value, r.height, 'max', `${f1(h.value)} m${h.ridge > h.value + 0.05 ? ` (ridge at ${f1(h.ridge)} m)` : ''}, ${r.height} m allowed`);
  add('storeys', d.nFloors, r.storeys, 'max', `${d.nFloors} of ${r.storeys} allowed`);
  const garden = M.gardenRatio * 100;
  add('garden', garden, r.garden, 'min', `${Math.round(garden)}% planted, ${r.garden}% required`);
  const pk = parking(b);
  add('parking', pk.total, r.parking, 'min', `${pk.total} space${pk.total === 1 ? '' : 's'}${pk.drive ? ` (${pk.garage} in the garage, ${pk.drive} on the driveway)` : ''}, ${r.parking} required`);

  // building standards
  add('ceiling', b.ceiling, r.ceilingMin, 'min', `${f2(b.ceiling)} m, ${f2(r.ceilingMin)} m required`);
  let worst = null;
  for (const f of d.floors) for (const rm of f.rooms) {
    const mn = ROOM_MINIMUMS[rm.type];
    if (!mn) continue;
    const a = rm.w * rm.h, dim = Math.min(rm.w, rm.h);
    const k = Math.min(a / mn[0], dim / mn[1]);
    if (!worst || k < worst.k) worst = { k, rm, a, dim, mn };
  }
  if (worst) {
    const { rm, a, dim, mn } = worst;
    add('room-size', worst.k, 1, 'min', worst.k >= 1
      ? `Tightest is ${rm.label}: ${f1(a)} m², ${f1(dim)} m wide (minimum ${mn[0]} m², ${mn[1]} m)`
      : `${rm.label} is ${f1(a)} m² and ${f1(dim)} m wide, needs ${mn[0]} m² and ${mn[1]} m`);
  }
  const spaces = d.floors.flatMap(daylightSpaces);
  if (spaces.length) {
    const dark = spaces.reduce((p, q) => (q.ratio < p.ratio ? q : p));
    add('daylight', dark.ratio * 100, r.daylight, 'min', `Darkest is ${dark.label}: ${Math.round(dark.ratio * 100)}% glazing, ${r.daylight}% required`);
  }
  if (d.nFloors > 1) {
    const riser = d.H / Math.ceil(d.H / 0.18);
    add('stair', riser, RISER_MAX, 'max', `${Math.round(riser * 1000)} mm risers, ${TREAD * 1000} mm treads`);
  }
  add('corridor', CORRIDOR, CORRIDOR_MIN, 'min', `${f1(CORRIDOR)} m halls, ${CORRIDOR_MIN} m required`);
  const blind = d.floors.flatMap((f) => f.rooms).filter((x) => x.unreachable);
  add('access', blind.length, 0, 'max', blind.length ? `No door into ${blind.map((x) => x.label).join(', ')}` : 'Every room has a door');

  const failed = items.filter((i) => !i.ok);
  return { ok: !failed.length, items, failed, violation: sum(failed.map((i) => i.over + 0.25)), profile: profileName(r) };
}

/**
 * Why no layout passed: the rules no layout met, the closest any layout came, and how many
 * layouts each rule rejected. For rules the plot decides, `site` says what plot would pass.
 */
export function diagnose(cands, b) {
  const by = {};
  for (const c of cands) for (const it of c.compliance.items) {
    const e = (by[it.id] ||= { id: it.id, label: it.label, group: it.group, fails: 0, best: null });
    if (!it.ok) e.fails++;
    if (!e.best || (it.sense === 'max' ? it.value < e.best.value : it.value > e.best.value)) e.best = it;
  }
  const all = Object.values(by);
  const blocking = all.filter((e) => e.fails === cands.length).map((e) => ({ id: e.id, label: e.label, text: `${e.label}: no layout passes. The closest is ${lower(e.best.detail)}.`, site: siteHint(e, b) }));
  const reasons = all.filter((e) => e.fails).sort((p, q) => q.fails - p.fails).map((e) => ({ id: e.id, label: e.label, fails: e.fails }));
  return { blocking, reasons };
}
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function siteHint(e, b) {
  if (!b) return null;
  const v = e.best.value, plotA = plotArea(b);
  if (e.id === 'setbacks') return 'The drawn lot is too small or narrow for this brief inside its setbacks.';
  if (e.id === 'setback-side') { const side = (b.plotW - v) / 2; return `It needs a plot at least ${f1(v + 2 * b.setSide)} m wide${side >= 0.5 ? `, or side setbacks of ${f1(side)} m` : ''}.`; }
  if (e.id === 'setback-depth') return `It needs a plot at least ${f1(v + b.setFront + b.setRear)} m deep.`;
  if (e.id === 'coverage' || e.id === 'far') return `It needs a plot of at least ${Math.ceil((plotA * v) / e.best.limit)} m² under these rules.`;
  return null;
}

// ── Fixes ─────────────────────────────────────────────────────
// Each is a change to the brief. `when` limits it to briefs where it can apply
// and to the rules it could plausibly cure; `cost` orders fixes by disruption.
const SPACE = ['setbacks', 'setback-side', 'setback-depth', 'coverage', 'far', 'garden', 'room-size', 'daylight', 'access'];
const ROOMS = [['gym', 'the home gym', 2], ['media', 'the media room', 2], ['family', 'the family room', 3], ['guest', 'the guest suite', 3], ['study', 'the study', 3], ['pantry', 'the pantry', 1], ['powder', 'the powder room', 1], ['storage', 'the storage room', 1], ['walkIn', 'the walk-in closet', 1], ['laundry', 'the laundry', 2]];
export const FIXES = [
  { id: 'floors-up', cost: 2, cures: SPACE, when: (b, r) => b.floors < Math.min(3, r.storeys), patch: (b) => ({ floors: b.floors + 1 }), label: (b) => `Build ${b.floors + 1} storeys instead of ${b.floors}` },
  { id: 'floors-max', cost: 1, cures: ['storeys'], when: (b, r) => b.floors > r.storeys, patch: (b, r) => ({ floors: Math.max(1, r.storeys) }), label: (b, r) => `Build ${Math.max(1, r.storeys)} storey${r.storeys > 1 ? 's' : ''}, the most allowed` },
  { id: 'floors-down', cost: 3, cures: ['height'], when: (b) => b.floors > 1, patch: (b) => ({ floors: b.floors - 1 }), label: (b) => `Build ${b.floors - 1} storey${b.floors > 2 ? 's' : ''} instead of ${b.floors}` },
  { id: 'ceiling-down', cost: 1, cures: ['height'], when: (b, r) => b.ceiling > Math.max(2.7, r.ceilingMin) + 0.01, patch: (b, r) => ({ ceiling: Math.max(2.7, r.ceilingMin) }), label: (b, r) => `Lower the ceilings to ${f2(Math.max(2.7, r.ceilingMin))} m` },
  { id: 'ceiling-up', cost: 1, cures: ['ceiling'], when: (b, r) => b.ceiling < r.ceilingMin, patch: (b, r) => ({ ceiling: r.ceilingMin }), label: (b, r) => `Raise the ceilings to ${f2(r.ceilingMin)} m` },
  { id: 'area', cost: 2, cures: SPACE, when: (b) => b.area > 100, patch: (b) => ({ area: Math.max(80, Math.round((b.area * 0.85) / 5) * 5) }), label: (b) => `Reduce the target floor area to ${Math.max(80, Math.round((b.area * 0.85) / 5) * 5)} m²` },
  { id: 'garage-down', cost: 2, cures: SPACE, when: (b) => b.garage > 0, patch: (b) => ({ garage: b.garage - 1 }), label: (b) => (b.garage > 1 ? 'Single garage instead of a double' : 'Leave out the garage') },
  { id: 'garage-up', cost: 2, cures: ['parking'], when: (b) => b.garage < 2, patch: (b) => ({ garage: b.garage + 1 }), label: (b) => (b.garage ? 'Double garage instead of a single' : 'Add a single garage') },
  { id: 'pool', cost: 2, cures: ['garden'], when: (b) => b.pool, patch: () => ({ pool: false }), label: () => 'Leave out the pool' },
  { id: 'terrace', cost: 1, cures: ['garden'], when: (b) => b.terrace, patch: () => ({ terrace: false }), label: () => 'Leave out the garden patio' },
  { id: 'kitchen', cost: 2, cures: SPACE, when: (b) => b.kitchen === 'island', patch: () => ({ kitchen: 'open' }), label: () => 'Open L-shaped kitchen instead of an island' },
  ...ROOMS.map(([k, name, cost]) => ({ id: k, cost, cures: SPACE, when: (b) => !!b[k], patch: () => ({ [k]: false }), label: () => `Leave out ${name}` })),
  { id: 'bathrooms', cost: 4, cures: SPACE, when: (b) => b.bathrooms > 1, patch: (b) => ({ bathrooms: b.bathrooms - 1 }), label: (b) => `${b.bathrooms - 1} bathroom${b.bathrooms > 2 ? 's' : ''} instead of ${b.bathrooms}` },
  { id: 'bedrooms', cost: 5, cures: SPACE, when: (b) => b.bedrooms > 1, patch: (b) => ({ bedrooms: b.bedrooms - 1, bathrooms: Math.min(b.bathrooms, b.bedrooms) }), label: (b) => `${b.bedrooms - 1} bedroom${b.bedrooms > 2 ? 's' : ''} instead of ${b.bedrooms}` },
];

/** Plain-language list of what a combined patch changes in brief `b`. */
export function describePatch(b, patch) {
  const rooms = Object.fromEntries(ROOMS.map(([k, n]) => [k, n]));
  const out = [];
  for (const [k, v] of Object.entries(patch)) {
    if (b[k] === v) continue;
    if (k === 'floors') out.push(`Build ${v} storey${v > 1 ? 's' : ''} instead of ${b.floors}`);
    else if (k === 'ceiling') out.push(`${v > b.ceiling ? 'Raise' : 'Lower'} the ceilings to ${f2(v)} m`);
    else if (k === 'area') out.push(`Reduce the target floor area to ${v} m²`);
    else if (k === 'garage') out.push(v === 0 ? 'Leave out the garage' : v > b.garage ? (b.garage ? 'Double garage instead of a single' : `Add a ${v > 1 ? 'double' : 'single'} garage`) : 'Single garage instead of a double');
    else if (k === 'pool') out.push('Leave out the pool');
    else if (k === 'terrace') out.push('Leave out the garden patio');
    else if (k === 'kitchen') out.push('Open L-shaped kitchen instead of an island');
    else if (rooms[k]) out.push(`Leave out ${rooms[k]}`);
    else if (k === 'bathrooms') out.push(`${v} bathroom${v > 1 ? 's' : ''} instead of ${b.bathrooms}`);
    else if (k === 'bedrooms') out.push(`${v} bedroom${v > 1 ? 's' : ''} instead of ${b.bedrooms}`);
  }
  return out;
}

/** Fixes worth trying for a brief whose best layouts break `failedIds`. */
export function candidateFixes(b, failedIds) {
  const r = rulesOf(b);
  return FIXES.filter((fx) => fx.when(b, r) && fx.cures.some((id) => failedIds.includes(id)))
    .map((fx) => ({ id: fx.id, cost: fx.cost, label: fx.label(b, r), patch: fx.patch(b, r) }));
}
