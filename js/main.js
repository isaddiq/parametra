// ─────────────────────────────────────────────────────────────
//  PARAMETRA · App controller
//  Three views behind hash routes (static-host friendly):
//    #/        landing page
//    #/brief   six-step guided brief with live preview
//    #/studio  compare designs, plan + 3D, details
// ─────────────────────────────────────────────────────────────
import { DEFAULT_BRIEF, STYLES, METRIC_INFO, ROOM_TYPES, RULE_PROFILES, DEFAULT_RULES, ZONING_KEYS, ROOM_MINIMUMS } from './data.js';
import { recommend, findFixes, compass, scoreWeights } from './engine.js';
import { envelope, profileKey, profileName, rulesOf, parking } from './rules.js';
import { renderPlan, renderThumb, PLAN_STYLE } from './plan2d.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ic = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
const pct = (v, min, max) => `${((v - min) / (max - min)) * 100}%`;
const DIR_NAME = { N: 'north', E: 'east', S: 'south', W: 'west' };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

// ── content ─────────────────────────────────────────────────
const zoning = (k) => ({ profile: k, ...Object.fromEntries(ZONING_KEYS.map((z) => [z, RULE_PROFILES[k][z]])) });
const PRESETS = [
  { id: 'starter', name: 'Starter home', desc: 'Two bedrooms on one level with a single garage. A compact first home.', b: { area: 125, floors: 1, bedrooms: 2, bathrooms: 1, masterSuite: false, walkIn: false, study: false, powder: false, guest: false, family: false, media: false, gym: false, storage: true, laundry: true, garage: 1, pool: false, balcony: false, terrace: true, kitchen: 'open', pantry: false, dining: 'open', plotW: 18, plotD: 30, setSide: 1.5, style: 'scandi', ceiling: 2.7 } },
  { id: 'family', name: 'Family home', desc: 'Four bedrooms over two storeys, island kitchen, study and a double garage.', b: { ...DEFAULT_BRIEF, style: 'scandi' } },
  { id: 'villa', name: 'Luxury villa', desc: 'Five-bedroom Mediterranean villa with guest suite, media room and pool.', b: { area: 380, floors: 2, bedrooms: 5, bathrooms: 5, masterSuite: true, walkIn: true, guest: true, study: true, powder: true, family: true, media: true, gym: false, storage: true, laundry: true, garage: 2, pool: true, balcony: true, terrace: true, kitchen: 'island', pantry: true, dining: 'open', plotW: 32, plotD: 46, setSide: 2, style: 'mediterranean', ceiling: 3.1 } },
  { id: 'urban', name: 'Urban townhouse', desc: 'Three storeys on a 13 m wide plot, with a roof terrace and galley kitchen.', b: { area: 185, floors: 3, bedrooms: 3, bathrooms: 3, masterSuite: true, walkIn: false, guest: false, study: true, powder: true, family: false, media: false, gym: false, storage: false, laundry: true, garage: 0, pool: false, balcony: true, terrace: true, kitchen: 'galley', pantry: false, dining: 'open', plotW: 13, plotD: 32, setSide: 1.0, setFront: 3, style: 'industrial', ceiling: 2.9, rules: zoning('urban') } },
  { id: 'tropical', name: 'Tropical retreat', desc: 'Single-storey pavilion with deep eaves, a family room and a pool.', b: { area: 250, floors: 1, bedrooms: 3, bathrooms: 3, masterSuite: true, walkIn: true, guest: false, study: false, powder: true, family: true, media: false, gym: false, storage: true, laundry: true, garage: 1, pool: true, balcony: false, terrace: true, kitchen: 'island', pantry: true, dining: 'open', plotW: 36, plotD: 40, setSide: 3, style: 'tropical', ceiling: 3.0, rules: zoning('rural') } },
  { id: 'japandi', name: 'Japandi cabin', desc: 'A calm two-storey home in cedar and charcoal, with a master balcony.', b: { area: 160, floors: 2, bedrooms: 3, bathrooms: 2, masterSuite: true, walkIn: false, guest: false, study: true, powder: false, family: false, media: false, gym: false, storage: true, laundry: true, garage: 0, pool: false, balcony: true, terrace: true, kitchen: 'open', pantry: false, dining: 'open', plotW: 20, plotD: 30, setSide: 2, style: 'japandi', ceiling: 2.8 } },
];
const presetBrief = (p) => ({ ...DEFAULT_BRIEF, hemisphere: 'N', street: 'S', ...p.b, pri: { ...DEFAULT_BRIEF.pri }, rules: { ...DEFAULT_RULES, ...(p.b.rules || {}) } });
const HERO = PRESETS[1];

const STOREYS = [[1, 'Single storey', 'Everything on one level, step-free'], [2, 'Two storeys', 'Living downstairs, bedrooms upstairs'], [3, 'Three storeys', 'A compact footprint for narrow plots']];
const SUITE = [['masterSuite', 'Ensuite bathroom', 'A private bathroom off the main bedroom', 'ensuite'], ['walkIn', 'Walk-in closet', 'A dressing room between bedroom and ensuite', 'wardrobe']];
const EXTRAS = [
  ['study', 'Study', 'A quiet room for work or homework', 'study'],
  ['guest', 'Guest suite', 'A bedroom for visitors, with its own bath when possible', 'guest'],
  ['family', 'Family room', 'A second living space for play or TV', 'family'],
  ['media', 'Media room', 'A dedicated cinema or games room', 'media'],
  ['gym', 'Home gym', 'Room for equipment and floor workouts', 'gym'],
  ['powder', 'Powder room', 'A guest toilet near the entrance', 'powder'],
  ['laundry', 'Laundry', 'Washer, dryer and a folding counter', 'laundry'],
  ['storage', 'Storage', 'A utility store for bulky items', 'storage'],
];
const KITCHENS = [['island', 'Island', 'Open to dining, with a central island for prep and seating'], ['open', 'Open L-shape', 'Open to dining, with counters along two walls'], ['galley', 'Galley', 'Two parallel runs, efficient on small footprints'], ['closed', 'Enclosed', 'A separate room that keeps cooking out of sight']];
const DINING = [['open', 'Open plan', 'Dining flows into the kitchen and living room'], ['separate', 'Dining room', 'A separate room with its own doors']];
const GARAGES = [[0, 'No garage', 'Parking on the driveway or street'], [1, 'Single garage', 'One car plus storage'], [2, 'Double garage', 'Two cars side by side']];
const OUTDOOR = [['terrace', 'Garden patio', 'A paved terrace off the living room', 'patio'], ['balcony', 'Master balcony', 'A private balcony on the upper floor', 'balcony'], ['pool', 'Swimming pool', 'In the back garden, beyond the patio', 'pool']];
const PRIOS = [
  ['light', 'Natural light', 'Bigger windows and sunny living spaces'],
  ['privacy', 'Privacy', 'Bedrooms away from the street and living areas'],
  ['open', 'Open living', 'Kitchen, dining and living flowing together'],
  ['budget', 'Budget', 'Compact, efficient and cheaper to build'],
  ['garden', 'Garden space', 'A smaller footprint that leaves more garden'],
];
const prioWord = (v) => (v < 25 ? 'Not a concern' : v < 50 ? 'Nice to have' : v < 75 ? 'Important' : 'Essential');
// [key, label, unit, min, max, step, hint]
const ZONING_FIELDS = [
  ['coverage', 'Site coverage', '%', 5, 100, 1, 'Most of the plot the house may cover'],
  ['far', 'Floor area ratio', '×', 0.1, 5, 0.05, 'Floor area ÷ plot area, at most'],
  ['height', 'Height limit', 'm', 4, 30, 0.5, 'To the parapet, or mid-roof if pitched'],
  ['storeys', 'Storeys', 'max', 1, 3, 1, 'Above ground'],
  ['garden', 'Planted ground', '%', 0, 90, 1, 'Least share kept as garden'],
  ['parking', 'Parking', 'spaces', 0, 4, 1, 'Off-street, at least'],
];
const STANDARD_FIELDS = [
  ['ceilingMin', 'Ceiling height', 'm', 2.1, 3.0, 0.05, 'Least clear height of rooms'],
  ['daylight', 'Daylight', '%', 0, 30, 1, 'Window area ÷ floor area, at least'],
];
const METRIC_DESC = {
  efficiency: 'Share of floor area that is rooms rather than halls and stairs.',
  proportion: 'Rooms are well shaped, with no narrow or awkward spaces.',
  light: 'Window area relative to floor area in the main rooms.',
  sun: 'Living spaces face the sunny side and bedrooms catch morning light.',
  adjacency: 'Kitchen beside dining, ensuite off the master, garage near the kitchen.',
  privacy: 'Bedrooms kept away from the street and from busy living areas.',
  areaFit: 'Total floor area is close to the target you set.',
  site: 'The house fits your setbacks and leaves a generous garden.',
  economy: 'A compact shape and stacked bathrooms keep build cost down.',
};
const FACADE = { boards: 'Timber cladding', siding: 'Painted lap siding', brick: 'Brick', stucco: 'Lime stucco', render: 'Smooth render', stone: 'Stone', boardform: 'Board-formed concrete', panel: 'Large-format panel' };
const ROOFNAME = { flat: 'Flat roof with parapet', float: 'Floating flat roof with timber soffit', gable: 'Pitched gable roof', hip: 'Hipped roof', shed: 'Mono-pitch roof' };
const FLOORNAME = { oak: 'Oak boards', wideoak: 'Wide-plank oak', teak: 'Teak boards', concrete: 'Polished concrete', terracotta: 'Terracotta tiles' };
const WETNAME = { stone: 'Natural stone', porcelain: 'Large-format porcelain', tile: 'Porcelain tile' };

// ── state ───────────────────────────────────────────────────
const saved = store.get('parametra.brief', null);
const state = {
  brief: { ...DEFAULT_BRIEF, hemisphere: 'N', ...(saved || presetBrief(HERO)) },
  picks: [], explored: 0, ms: 0, idx: 0, design: null,
  step: 0,
  view: window.innerWidth < 760 ? '3d' : 'split',
  level: 0, level3d: 'all', mode3d: 'exterior', tab: 'overview',
  layers: { furniture: true, dims: true, roof: true, labels: true },
  sel: null, hover: null, route: 'home',
  heroDesign: null,
  report: null, fixes: null, // fixes: null while the search runs, [] when none is needed or found
};
state.brief.pri = { ...DEFAULT_BRIEF.pri, ...(state.brief.pri || {}) };
state.brief.rules = { ...DEFAULT_RULES, ...(state.brief.rules || {}) };
if (!STYLES[state.brief.style]) state.brief.style = 'modern';
let viewer = null;

// ── shared bits ─────────────────────────────────────────────
function titleblock(cells, cls = '') {
  return `<div class="titleblock ${cls}">${cells.map(([k, v, big]) => `<div class="tb"><small>${k}</small><b class="${big ? 'lg' : ''}">${v}</b></div>`).join('')}</div>`;
}

/** Front elevation sketch of a style, drawn from its tokens. */
/** Front elevation for the contemporary style: floating roof plate, cantilevered panel volume, framed ribbons, fins. */
function elevationContemporary(s) {
  const W = 200, G = 128, x0 = 38, x1 = 162, bw = x1 - x0, sh = 33, top = G - sh * 2;
  const o = [`<svg viewBox="12 4 176 142" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`];
  const R = (x, y, w, h, f, extra = '') => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`);
  const line = (d, c, wdt = 0.8, op = 0.35) => o.push(`<path d="${d}" stroke="${c}" stroke-width="${wdt}" opacity="${op}" fill="none"/>`);
  const glass = s.glass || '#CFE0E6', bronze = s.windowBox, timber = s.door;
  // board-formed concrete base
  R(x0, top + sh, bw, sh, s.ext.color);
  let d = ''; for (let y = top + sh + 4; y < G; y += 4) d += `M${x0} ${y}H${x1}`; line(d, '#000', 0.5, 0.14);
  // dark panel volume, cantilevered past the base
  R(x0 - 8, top, bw + 8, sh, s.accent.color);
  d = ''; for (let x = x0 + 7; x < x1; x += 15) d += `M${x} ${top}V${top + sh}`; line(d, '#fff', 0.5, 0.18);
  // shadow gap + floating roof plate with timber soffit
  R(x0, top - 3, bw, 3, '#1d1e20');
  R(x0 - 18, top - 9, bw + 32, 5, s.frame);
  R(x0 - 18, top - 4.6, bw + 32, 1.4, s.soffit.color);
  // ribbon windows in bronze picture frames
  for (const x of [x0 + 4, x1 - 50]) { R(x - 2.5, top + 8.5, 47, 14, bronze); R(x, top + 11, 42, 9, glass, `stroke="${s.frame}" stroke-width=".6"`); }
  // full-height living glass, slim frames
  R(x0 + 6, top + sh + 3, 50, sh - 3, glass, `stroke="${s.frame}" stroke-width=".8"`); line(`M${x0 + 31} ${top + sh + 3}V${G}`, s.frame, 0.6, 0.9);
  // timber pivot door with bar pull, fins over a slot window
  R(100, G - 28, 14, 28, timber); d = ''; for (let x = 102; x < 114; x += 2) d += `M${x} ${G - 28}V${G}`; line(d, '#000', 0.4, 0.3);
  line(`M111 ${G - 21}V${G - 7}`, s.frame, 1.2, 1);
  R(x1 - 26, top + sh + 3, 9, sh - 3, glass);
  d = ''; for (let x = x1 - 28; x <= x1 - 15; x += 2.2) d += `M${x} ${top + sh + 1}V${G}`; line(d, timber, 1.1, 1);
  R(0, G, W, 22, 'var(--sunken)');
  o.push(`<line x1="0" y1="${G}" x2="${W}" y2="${G}" stroke="var(--line-strong)"/>`);
  for (const [x, r] of [[22, 9], [31, 6], [176, 8]]) o.push(`<circle cx="${x}" cy="${G - r + 2}" r="${r}" fill="#7E9A6C"/>`);
  o.push('</svg>');
  return o.join('');
}

function elevation(key) {
  const s = STYLES[key];
  if (s.windows === 'contemporary') return elevationContemporary(s);
  const W = 200, G = 128, x0 = 38, x1 = 162, bw = x1 - x0, sh = 33, top = G - sh * 2;
  const o = [`<svg viewBox="12 4 176 142" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`];
  const R = (x, y, w, h, f, extra = '') => o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`);
  const P = (pts, f, extra = '') => o.push(`<polygon points="${pts}" fill="${f}" ${extra}/>`);
  const line = (d, c, wdt = 0.8, op = 0.35) => o.push(`<path d="${d}" stroke="${c}" stroke-width="${wdt}" opacity="${op}" fill="none"/>`);
  // facade + texture
  R(x0, top, bw, G - top, s.ext.color);
  const tex = s.ext.tex, dark = '#000';
  if (tex === 'boards') { let d = ''; for (let x = x0 + 5; x < x1; x += 5) d += `M${x} ${top}V${G}`; line(d, dark, 0.6, 0.25); }
  if (tex === 'siding') { let d = ''; for (let y = top + 5; y < G; y += 5) d += `M${x0} ${y}H${x1}`; line(d, dark, 0.6, 0.18); }
  if (tex === 'brick') { let d = ''; for (let y = top + 3; y < G; y += 3) d += `M${x0} ${y}H${x1}`; line(d, '#fff', 0.5, 0.25); }
  // accent entry volume
  R(92, top + sh, 30, sh, s.accent.color);
  if (s.accent.tex === 'boards') { let d = ''; for (let x = 95; x < 122; x += 4) d += `M${x} ${top + sh}V${G}`; line(d, dark, 0.5, 0.25); }
  // roof
  const rc = s.roofMat.color;
  if (s.roof === 'flat') { R(x0 - 2, top - 6, bw + 4, 6, s.ext.color, `stroke="${s.frame}" stroke-width=".8"`); R(x0 - 3, top - 7, bw + 6, 2, s.frame); }
  if (s.roof === 'gable') { const rise = (bw / 2) * Math.tan((s.pitch * Math.PI) / 180) * 0.8; P(`${x0 - 8},${top + 5} ${(x0 + x1) / 2},${top - rise} ${x1 + 8},${top + 5}`, rc); if (s.chimney) R(x1 - 30, top - rise * 0.75, 8, rise * 0.5, s.accent.color); }
  if (s.roof === 'hip') { const ov = s.overhang > 1 ? 16 : 8, rise = 8 + s.pitch * 0.55; P(`${x0 - ov},${top + 4} ${x0 + 26},${top - rise} ${x1 - 26},${top - rise} ${x1 + ov},${top + 4}`, rc); }
  if (s.roof === 'shed') P(`${x0 - 10},${top + 2} ${x1 + 10},${top - 20} ${x1 + 10},${top - 14} ${x0 - 10},${top + 8}`, rc);
  // windows
  const glass = '#CFE0E6';
  const win = (x, y, w, h) => {
    R(x, y, w, h, glass, `stroke="${s.frame}" stroke-width="1.6"`);
    if (s.mullions === 'grid') line(`M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}`, s.frame, 1, 0.9);
    if (s.mullions === 'cross') line(`M${x + w / 2} ${y}V${y + h}M${x} ${y + h * 0.4}H${x + w}`, s.frame, 1, 0.9);
    if (s.mullions === 'grid-v') line(`M${x + w / 3} ${y}V${y + h}M${x + (2 * w) / 3} ${y}V${y + h}`, s.frame, 0.9, 0.9);
    if (s.shutters) { R(x - 7, y, 6, h, s.frame); R(x + w + 1, y, 6, h, s.frame); }
  };
  const ww = 12 + s.glazing * 20;
  for (const cx of [x0 + 20, (x0 + x1) / 2, x1 - 20]) { win(cx - ww / 2, top + 7, ww, sh - 15); if (s.louvres) { let d = ''; for (let x = cx - ww / 2; x <= cx + ww / 2; x += 3) d += `M${x} ${top + 5}V${top + sh - 6}`; line(d, s.accent.color, 1.2, 0.9); } }
  if (s.fullHeight) win(x0 + 6, top + sh + 4, 44, sh - 4); else win(x0 + 14, top + sh + 7, ww, sh - 15);
  win(x1 - 14 - ww, top + sh + 7, ww, sh - 15);
  R(101, G - 24, 12, 24, s.door);
  // ground
  R(0, G, W, 22, 'var(--sunken)');
  o.push(`<line x1="0" y1="${G}" x2="${W}" y2="${G}" stroke="var(--line-strong)"/>`);
  for (const [x, r] of [[22, 9], [31, 6], [176, 8]]) o.push(`<circle cx="${x}" cy="${G - r + 2}" r="${r}" fill="#7E9A6C"/>`);
  o.push('</svg>');
  return o.join('');
}

function storeyArt(n) {
  const h = 18, o = [`<svg viewBox="0 0 80 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">`];
  const base = 60, w = n === 3 ? 34 : n === 2 ? 46 : 64, x = (80 - w) / 2;
  for (let i = 0; i < n; i++) o.push(`<rect x="${x}" y="${base - h * (i + 1)}" width="${w}" height="${h}"/>`);
  o.push(`<path d="M${x - 4} ${base - h * n} L${40} ${base - h * n - 10} L${x + w + 4} ${base - h * n}"/>`);
  o.push('</svg>');
  return o.join('');
}
const KITCHEN_ART = {
  island: '<svg viewBox="0 0 80 56" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6h68v10H6z"/><path d="M6 16v34"/><rect x="24" y="30" width="32" height="12" rx="1"/></svg>',
  open: '<svg viewBox="0 0 80 56" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6h68v10H16v34H6z"/></svg>',
  galley: '<svg viewBox="0 0 80 56" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="68" height="10"/><rect x="6" y="40" width="68" height="10"/></svg>',
  closed: '<svg viewBox="0 0 80 56" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 50V6h68v44M6 50h26M48 50h26"/><path d="M6 16h58v24"/><path d="M16 16v24"/></svg>',
};
const carArt = (n) => (n === 0 ? `<svg viewBox="0 0 80 56"><use href="#i-none" x="20" y="8" width="40" height="40"/></svg>` : `<svg viewBox="0 0 80 56">${Array.from({ length: n }, (_, i) => `<use href="#i-car" x="${n === 1 ? 20 : 4 + i * 36}" y="8" width="40" height="40"/>`).join('')}</svg>`);

// ── router ──────────────────────────────────────────────────
function currentRoute() {
  const h = location.hash;
  if (h.startsWith('#/brief')) return 'brief';
  if (h.startsWith('#/studio')) return 'studio';
  return 'home';
}
function route() {
  const r = currentRoute();
  const changedRoute = r !== state.route;
  state.route = r;
  document.body.dataset.route = r;
  $('#view-home').hidden = r !== 'home';
  $('#view-brief').hidden = r !== 'brief';
  $('#view-studio').hidden = r !== 'studio';
  $$('.nav-flow li').forEach((li) => li.classList.toggle('on', li.dataset.flow === r));
  closeDropdowns();
  hideTip();
  if (r === 'brief') renderWizard();
  if (r === 'studio') { if (!state.picks.length) generate(); renderStudio(); }
  if (r === 'home') renderHomeViewer();
  if (r === 'studio') mountStudioViewer();
  const anchor = r === 'home' && location.hash.length > 1 && !location.hash.startsWith('#/');
  if (changedRoute && !anchor) window.scrollTo(0, 0);
  document.title = r === 'brief' ? 'Your brief · Parametra' : r === 'studio' ? 'Your designs · Parametra' : 'Parametra · House designs shaped around how you live';
}

// ── landing page ────────────────────────────────────────────
function renderHome() {
  const d = state.heroDesign;
  $('#heroFallback').innerHTML = renderThumb(d);
  $('#heroBlock').innerHTML = [
    ['Design', `${d.name}, ${d.style.name} style`], ['Floor area', `${d.metrics.gross} m²`], ['Bedrooms', d.brief.bedrooms], ['Match', `${d.metrics.score}/100`],
  ].map(([k, v]) => `<div class="tb"><small>${k}</small><b>${v}</b></div>`).join('');
  $('#styleStrip').innerHTML = Object.entries(STYLES).map(([k, s]) => `
    <button type="button" class="style-tile" data-start-style="${k}" aria-label="Start a design in the ${s.name} style">
      <span class="elev">${elevation(k)}</span>
      <span class="st-txt"><b>${s.name}</b><span>${s.tagline}</span><em>Start with this style</em></span>
    </button>`).join('');
  $('#samplePlan').innerHTML = renderPlan(d, 0, { furniture: true, dims: true, title: false });
  const g = d.floors[0];
  $('#planBlock').innerHTML = [['Drawing', 'Ground floor plan'], ['Design', d.name], ['Rooms', g.rooms.filter((r) => r.type !== 'hall').length], ['Level area', `${Math.round(g.rooms.reduce((s, r) => s + r.w * r.h, 0))} m²`]]
    .map(([k, v]) => `<div class="tb"><small>${k}</small><b>${v}</b></div>`).join('');
  $('#examplesGrid').innerHTML = PRESETS.map((p) => `
    <article class="example">
      <div class="ex-plan" data-ex-plan="${p.id}"></div>
      <div class="ex-body">
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        ${titleblock([['Bedrooms', p.b.bedrooms ?? DEFAULT_BRIEF.bedrooms], ['Baths', p.b.bathrooms ?? DEFAULT_BRIEF.bathrooms], ['Area', `${p.b.area ?? DEFAULT_BRIEF.area} m²`], ['Storeys', p.b.floors ?? DEFAULT_BRIEF.floors]])}
        <button type="button" class="btn" data-open-preset="${p.id}">Open in studio</button>
      </div>
    </article>`).join('');
  // example plans are computed in idle time so the page paints first
  let i = 0;
  const later = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 40));
  const next = () => {
    if (i >= PRESETS.length) return;
    const p = PRESETS[i++];
    try { const best = recommend(presetBrief(p), 1).picks[0]; $(`[data-ex-plan="${p.id}"]`).innerHTML = renderThumb(best); } catch (e) { console.warn(e); }
    later(next);
  };
  later(next);
}

function renderHomeViewer() {
  if (!viewer || state.route !== 'home') return;
  viewer.paused = false;
  viewer.mount($('#heroSlot'));
  viewer.setShowcase(true);
  if (viewer.mode !== 'exterior') viewer.setMode('exterior');
  viewer.setLevel('all');
  for (const k of ['roof', 'furniture']) viewer.setToggle(k, true);
  if (viewer.design !== state.heroDesign) viewer.setDesign(state.heroDesign);
  viewer.preset('front', false);
  $('#heroFallback').classList.add('gone');
}

// ── brief wizard ────────────────────────────────────────────
const STEPS = [
  { id: 'site', name: 'Plot', title: 'Start with your plot', lead: 'Plot size, setbacks and planning rules keep every design buildable. Orientation lets us plan rooms around the sun.', render: stepSite },
  { id: 'size', name: 'Size', title: 'How much house?', lead: 'Set a target floor area and the number of storeys. Every room is sized from these.', render: stepSize },
  { id: 'rooms', name: 'Rooms', title: 'Who will live here?', lead: 'Choose bedrooms, bathrooms and the extra spaces your household needs.', render: stepRooms },
  { id: 'living', name: 'Living', title: 'Kitchen, parking and outdoors', lead: 'How you cook, where the car goes, and how the house opens to the garden.', render: stepLiving },
  { id: 'style', name: 'Style', title: 'Pick an architectural style', lead: 'Style sets the roof form, facade, window sizes, interior finishes and landscaping.', render: stepStyle },
  { id: 'prio', name: 'Priorities', title: 'What matters most to you?', lead: 'Every layout is scored on nine criteria. These weights decide which designs rise to the top.', render: stepPrio },
];

function rangeField(k, label, min, max, step, unit, { help = '', fmt = (v) => v } = {}) {
  const v = state.brief[k];
  return `<div class="field"><div class="field-row"><label for="f-${k}">${label}</label><output data-out="${k}">${fmt(v)} ${unit}</output></div>
    <input id="f-${k}" type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${pct(v, min, max)}">
    ${help ? `<p class="help">${help}</p>` : ''}</div>`;
}
function choiceGrid(k, opts, { num = false, art = null, min = 168, cls = '' } = {}) {
  return `<div class="choices" style="--min:${min}px" role="radiogroup">${opts.map(([v, t, d]) => {
    const on = String(state.brief[k]) === String(v);
    return `<button type="button" class="choice ${cls} ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-k="${k}" data-v="${v}" ${num ? 'data-num' : ''}>
      ${art ? `<span class="art">${art(v)}</span>` : ''}<b>${t}</b><span>${d}</span><i class="tick">${ic('check', '')}</i></button>`;
  }).join('')}</div>`;
}
function toggleGrid(items, min = 168) {
  return `<div class="choices" style="--min:${min}px">${items.map(([k, t, d, icon]) => {
    const on = !!state.brief[k];
    return `<button type="button" class="choice ${on ? 'on' : ''}" aria-pressed="${on}" data-toggle="${k}">${icon ? `<svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg>` : ''}<b>${t}</b><span>${d}</span><i class="tick">${ic('check', '')}</i></button>`;
  }).join('')}</div>`;
}
function stepperCard(k, label, sub, min, max) {
  const v = state.brief[k];
  return `<div class="stepper"><div class="lab"><b>${label}</b><span>${sub}</span></div><div class="ctl">
    <button type="button" data-step="${k}" data-d="-1" data-min="${min}" data-max="${max}" aria-label="Fewer ${label.toLowerCase()}" ${v <= min ? 'disabled' : ''}>${ic('minus', '')}</button>
    <output data-out="${k}" aria-live="polite">${v}</output>
    <button type="button" data-step="${k}" data-d="1" data-min="${min}" data-max="${max}" aria-label="More ${label.toLowerCase()}" ${v >= max ? 'disabled' : ''}>${ic('plus', '')}</button></div></div>`;
}

function plotDiagram() {
  const b = state.brief;
  const k = Math.min(180 / b.plotW, 190 / b.plotD);
  const w = b.plotW * k, h = b.plotD * k, x = (220 - w) / 2, y = 4;
  const bw = Math.max(0, b.plotW - 2 * b.setSide), bd = Math.max(0, b.plotD - b.setFront - b.setRear);
  return `<svg class="plot-diagram" viewBox="0 0 220 ${h + 70}" role="img" aria-label="Plot ${b.plotW} by ${b.plotD} metres, buildable area ${bw.toFixed(1)} by ${bd.toFixed(1)} metres">
    <rect class="pd-plot" x="${x}" y="${y}" width="${w}" height="${h}"/>
    <rect class="pd-build" x="${x + b.setSide * k}" y="${y + b.setRear * k}" width="${bw * k}" height="${bd * k}"/>
    <rect class="pd-street" x="${x - 10}" y="${y + h + 5}" width="${w + 20}" height="16" rx="3"/>
    <text x="110" y="${y + h + 17}" text-anchor="middle">Street</text>
    <text x="110" y="${y + h + 42}" text-anchor="middle">Plot ${b.plotW} × ${b.plotD} m</text>
    <text x="110" y="${y + h + 60}" text-anchor="middle" fill="var(--green)">Buildable ${bw.toFixed(1)} × ${bd.toFixed(1)} m</text></svg>`;
}
function orientText() {
  const b = state.brief;
  const rear = OPP[b.street];
  const sunny = b.hemisphere === 'S' ? 'N' : 'S';
  const good = rear === sunny ? 'That is the sunny side, so living rooms and the patio get the best light.' : rear === 'E' || rear === 'W' ? 'The garden gets sun for half the day, and living rooms will be placed to catch it.' : 'The garden faces away from the sun, so windows on the sides and front will do more of the work.';
  return `<p>The street is to the <b>${DIR_NAME[b.street]}</b>, so the garden faces <b>${DIR_NAME[rear]}</b>. ${good}</p>`;
}
function houseIcon() {
  return `<svg viewBox="0 0 92 92" aria-hidden="true"><rect x="14" y="14" width="64" height="64" rx="3" fill="var(--sunken)" stroke="var(--ink-2)" stroke-width="1.5"/><path d="M14 46h64" stroke="var(--line-strong)"/><rect x="30" y="74" width="32" height="7" rx="2" fill="var(--green)"/><text x="46" y="36" text-anchor="middle" font-size="10" font-weight="600" fill="var(--muted)" font-family="Archivo, sans-serif">garden</text><text x="46" y="64" text-anchor="middle" font-size="10" font-weight="600" fill="var(--muted)" font-family="Archivo, sans-serif">street</text></svg>`;
}

function ruleField([k, label, unit, min, max, step, hint]) {
  return `<div class="num"><label for="r-${k}">${label}</label><div class="box"><input id="r-${k}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" data-rule="${k}" value="${state.brief.rules[k]}"><span>${unit}</span></div><small>${hint}</small></div>`;
}
function profileDesc() {
  const k = profileKey(state.brief.rules);
  return k === 'custom' ? 'Custom values. Pick a profile to reset them.' : `${RULE_PROFILES[k].desc}. Typical values, so check them against your local planning rules.`;
}
function envLine() {
  const b = state.brief, r = rulesOf(b), e = envelope(b, r), pk = parking(b);
  const over = b.area > e.gross ? ` Your ${b.area} m² target is above that, so designs will come out smaller.` : '';
  return `This plot allows a footprint of up to <b>${Math.round(e.footprint)} m²</b> and up to <b>${Math.round(e.gross)} m²</b> of floor area, over at most ${r.storeys} storey${r.storeys > 1 ? 's' : ''}.${over} Parking: ${pk.total} space${pk.total === 1 ? '' : 's'} provided, ${r.parking} required.`;
}
const MIN_NOTE = `Every room must meet a minimum size: main bedroom ${ROOM_MINIMUMS.master[0]} m², other bedrooms ${ROOM_MINIMUMS.bedroom[0]} m², living room ${ROOM_MINIMUMS.living[0]} m², bathrooms ${ROOM_MINIMUMS.bath[0]} m². Every room must have a door, halls must be at least 0.9 m wide, and stair risers at most 190 mm.`;
function stepRules() {
  const k = profileKey(state.brief.rules);
  return `
    <div class="group"><h2>Planning rules</h2><p class="help">These are hard limits. A design that breaks any of them is rejected. If no design can meet them, Parametra explains why and suggests what to change.</p>
      <div class="seg seg-wrap" role="radiogroup" aria-label="Planning rules profile" id="ruleSeg">${Object.entries(RULE_PROFILES).map(([pk, p]) => `<button type="button" role="radio" aria-checked="${k === pk}" class="${k === pk ? 'on' : ''}" data-profile="${pk}">${p.name}</button>`).join('')}</div>
      <p class="help" id="profileDesc">${profileDesc()}</p>
      <div class="numbers rule-nums">${ZONING_FIELDS.map(ruleField).join('')}</div>
      <details class="more"><summary>Building standards</summary>
        <div class="more-body"><div class="numbers rule-nums">${STANDARD_FIELDS.map(ruleField).join('')}</div><p class="help">${MIN_NOTE}</p></div>
      </details>
      <p class="env-line" id="envLine">${envLine()}</p>
    </div>`;
}

function stepSite() {
  const b = state.brief;
  return `
    <div class="group"><h2>Plot size</h2>
      <div class="plot-wrap">
        <div class="group">${rangeField('plotW', 'Width along the street', 8, 60, 0.5, 'm')}${rangeField('plotD', 'Depth from street to back', 15, 80, 0.5, 'm')}</div>
        <div id="plotDiagram">${plotDiagram()}</div>
      </div>
    </div>
    <div class="group"><h2>Setbacks</h2><p class="help">The minimum distance the house must keep from each boundary. Check your local planning rules.</p>
      <div class="numbers">${[['setFront', 'Front'], ['setSide', 'Each side'], ['setRear', 'Rear']].map(([k, l]) => `<div class="num"><label for="n-${k}">${l}</label><div class="box"><input id="n-${k}" type="number" inputmode="decimal" min="0" max="20" step="0.5" data-k="${k}" value="${b[k]}"><span>m</span></div></div>`).join('')}</div>
    </div>
    ${stepRules()}
    <div class="group"><h2>Orientation</h2><p class="help">Which side of the plot is the street on?</p>
      <div class="orient">
        <div class="compass-pick" role="radiogroup" aria-label="Direction of the street">
          ${['N', 'E', 'S', 'W'].map((d) => `<button type="button" class="${d.toLowerCase()} ${b.street === d ? 'on' : ''}" role="radio" aria-checked="${b.street === d}" data-k="street" data-v="${d}" aria-label="Street to the ${DIR_NAME[d]}">${d}</button>`).join('')}
          <div class="house" style="transform:rotate(${{ S: 0, W: 90, N: 180, E: 270 }[b.street]}deg)">${houseIcon()}</div>
        </div>
        <div class="orient-text"><div id="orientText">${orientText()}</div>
          <div class="field"><div class="field-row"><span class="lab">Hemisphere</span></div>
            <div class="seg" role="radiogroup">${[['N', 'Northern'], ['S', 'Southern']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${b.hemisphere === v}" class="${b.hemisphere === v ? 'on' : ''}" data-k="hemisphere" data-v="${v}">${l}</button>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>`;
}
function areaHint() {
  const b = state.brief, per = b.area / Math.max(1, b.bedrooms);
  if (per < 35) return `Tight for ${b.bedrooms} bedrooms. Expect compact rooms, or designs that exceed this target.`;
  if (per < 55) return `A comfortable size for ${b.bedrooms} bedrooms.`;
  return `Generous for ${b.bedrooms} bedrooms, with room for larger living spaces.`;
}
function stepSize() {
  return `
    <div class="group">
      <div class="field"><div class="field-row"><label for="f-area">Target floor area</label><span class="help">Excluding the garage</span></div>
        <div class="big-out"><span data-out="area">${state.brief.area}</span><small>m²</small></div>
        <input id="f-area" type="range" data-k="area" min="80" max="600" step="5" value="${state.brief.area}" style="--p:${pct(state.brief.area, 80, 600)}">
        <div class="scale"><span>80 m²</span><span>600 m²</span></div>
        <p class="help" id="areaHint">${areaHint()}</p>
      </div>
    </div>
    <div class="group"><h2>Storeys</h2>${choiceGrid('floors', STOREYS, { num: true, art: storeyArt })}</div>
    <div class="group">${rangeField('ceiling', 'Ceiling height', 2.5, 3.6, 0.05, 'm', { fmt: (v) => (+v).toFixed(2), help: '2.7 m is standard. Higher ceilings feel airier and add a little to the cost.' })}</div>`;
}
function stepRooms() {
  return `
    <div class="group"><h2>Bedrooms and bathrooms</h2>
      <div class="steppers">${stepperCard('bedrooms', 'Bedrooms', 'Including the main bedroom', 1, 7)}${stepperCard('bathrooms', 'Bathrooms', 'Including the ensuite', 1, 6)}</div>
    </div>
    <div class="group"><h2>Main bedroom</h2>${toggleGrid(SUITE, 220)}</div>
    <div class="group"><h2>Extra spaces</h2><p class="help">Select any that apply.</p>${toggleGrid(EXTRAS)}</div>`;
}
function stepLiving() {
  return `
    <div class="group"><h2>Kitchen layout</h2>${choiceGrid('kitchen', KITCHENS, { art: (v) => KITCHEN_ART[v], min: 180 })}</div>
    <div class="two">
      <div class="group"><h2>Dining</h2>${choiceGrid('dining', DINING, { min: 150 })}</div>
      <div class="group"><h2>Kitchen extras</h2>${toggleGrid([['pantry', 'Walk-in pantry', 'Shelving room beside the kitchen', 'pantry']], 150)}</div>
    </div>
    <div class="group"><h2>Parking</h2>${choiceGrid('garage', GARAGES, { num: true, art: carArt })}</div>
    <div class="group"><h2>Outdoor living</h2>${toggleGrid(OUTDOOR)}</div>`;
}
function stepStyle() {
  const opts = Object.entries(STYLES).map(([k, s]) => [k, s.name, `${s.tagline}.`]);
  return `<div class="group">${choiceGrid('style', opts, { art: (k) => elevation(k), min: 200, cls: 'style' })}</div>`;
}
function stepPrio() {
  return `<div class="prio-list">${PRIOS.map(([k, l, d]) => `
    <div class="prio"><div class="field-row"><label for="p-${k}">${l} <span>${d}</span></label><output data-out="pri.${k}">${prioWord(state.brief.pri[k])}</output></div>
      <input id="p-${k}" type="range" min="0" max="100" step="5" data-pri="${k}" value="${state.brief.pri[k]}" style="--p:${state.brief.pri[k]}%"></div>`).join('')}</div>`;
}

function renderWizard() {
  const st = STEPS[state.step];
  $('#progress').innerHTML = STEPS.map((s, i) => `<li class="${i < state.step ? 'done' : ''} ${i === state.step ? 'on' : ''}"><button type="button" data-goto="${i}" ${i === state.step ? 'aria-current="step"' : ''}><span class="n">${i + 1}</span><span class="t">${s.name}</span></button></li>`).join('');
  const el = $('#wizStep');
  el.innerHTML = `<header class="step-head"><h1 tabindex="-1">${st.title}</h1><p>${st.lead}</p></header>${st.render()}`;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('#wizBack').disabled = state.step === 0;
  $('#wizNext').textContent = state.step === STEPS.length - 1 ? 'See my designs' : 'Continue';
  $('#wizCount').textContent = `Step ${state.step + 1} of ${STEPS.length}`;
  renderPreview();
}

function renderPreview() {
  const d = state.picks[0];
  const b = state.brief;
  const el = $('#preview');
  if (!d) { el.innerHTML = '<div class="pv-head"><b>Live preview</b></div>'; return; }
  el.innerHTML = `
    <div class="pv-head"><b>Live preview</b><span>Updates as you choose</span></div>
    <div class="pv-plan">${renderThumb(d)}</div>
    ${titleblock([['Plot', `${b.plotW} × ${b.plotD} m`], ['Floor area', `${b.area} m²`], ['Storeys', b.floors], ['Bedrooms', b.bedrooms], ['Bathrooms', b.bathrooms], ['Style', STYLES[b.style].name]], 'grid c3')}
    <div class="pv-foot">
      ${rulesStatus(1)}
      <p>${state.report?.feasible === false
        ? `The closest of <b>${state.explored} layouts</b> is <b>${d.name}</b>, a ${d.metrics.gross} m² design, but it breaks ${ruleCount(d)}.`
        : `The best of <b>${state.explored} layouts</b> so far is <b>${d.name}</b>, a ${d.metrics.gross} m² design that matches your priorities at <b>${d.metrics.score}/100</b>.`}</p>
      <button type="button" class="btn btn-primary btn-block" data-go-studio>See my designs</button>
    </div>`;
}

const ruleCount = (d) => { const n = d.compliance.failed.length; return `${n} planning rule${n > 1 ? 's' : ''}`; };
/** Why the brief cannot be built, as list items: each rule no layout met, plus what plot would pass. */
function blockingItems(rep) {
  const items = rep.blocking.length ? rep.blocking.map((x) => `${x.text}${x.site ? ` ${x.site}` : ''}`)
    : [`Every layout breaks at least one rule. The closest breaks ${rep.closest.map((c) => `${c.label.toLowerCase()} (${c.detail})`).join(' and ')}.`];
  return items.map((t) => `<li>${t}</li>`).join('');
}
function fixList(limit) {
  if (state.fixes === null) return `<p class="fix-wait"><span class="spin sm"></span>Looking for changes that would make it fit…</p>`;
  if (!state.fixes.length) return `<p class="fix-none">No combination of up to four changes to the brief fits this plot. Try a larger plot, smaller setbacks, or check the rule values.</p>`;
  return `<div class="fixes">${state.fixes.slice(0, limit).map((f, i) => `<button type="button" class="fix" data-fix="${i}"><b>${f.label}</b><span>Tested: ${f.score != null ? `best design matches at ${f.score}/100, ${f.gross} m²` : 'passes every rule'}</span></button>`).join('')}</div>`;
}
/** Compliance summary for the live preview. */
function rulesStatus(limit) {
  const rep = state.report;
  if (!rep) return '';
  if (rep.feasible) return `<div class="rule-ok">${ic('check')}<span><b>Meets all ${rep.rules} planning rules.</b> ${rep.compliant} of ${rep.explored} layouts passed.</span></div>`;
  return `<div class="rule-bad">${ic('warn')}<div><b>No layout meets the planning rules</b><ul>${blockingItems(rep)}</ul></div></div>${fixList(limit)}`;
}

function syncWizard() {
  const b = state.brief;
  $$('#wizStep [data-k][data-v]').forEach((el) => { const on = String(b[el.dataset.k]) === el.dataset.v; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); });
  $$('#wizStep [data-toggle]').forEach((el) => { const on = !!b[el.dataset.toggle]; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
  $$('#wizStep [data-step]').forEach((el) => { const v = b[el.dataset.step]; el.disabled = +el.dataset.d < 0 ? v <= +el.dataset.min : v >= +el.dataset.max; });
  $$('#wizStep [data-out]').forEach((el) => {
    const k = el.dataset.out;
    if (k.startsWith('pri.')) el.textContent = prioWord(b.pri[k.slice(4)]);
    else if (k === 'ceiling') el.textContent = `${(+b.ceiling).toFixed(2)} m`;
    else if (k === 'plotW' || k === 'plotD') el.textContent = `${b[k]} m`;
    else el.textContent = b[k];
  });
  const pk = profileKey(b.rules);
  $$('#ruleSeg [data-profile]').forEach((el) => { const on = el.dataset.profile === pk; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); });
  $$('#wizStep [data-rule]').forEach((el) => { if (document.activeElement !== el) el.value = b.rules[el.dataset.rule]; });
  const pdsc = $('#profileDesc'); if (pdsc) pdsc.textContent = profileDesc();
  const envEl = $('#envLine'); if (envEl) envEl.innerHTML = envLine();
  const pd = $('#plotDiagram'); if (pd) pd.innerHTML = plotDiagram();
  const ot = $('#orientText'); if (ot) ot.innerHTML = orientText();
  const ah = $('#areaHint'); if (ah) ah.textContent = areaHint();
  const hs = $('.compass-pick .house'); if (hs) hs.style.transform = `rotate(${{ S: 0, W: 90, N: 180, E: 270 }[b.street]}deg)`;
}

function bindWizard() {
  const step = $('#wizStep');
  step.addEventListener('click', (e) => {
    const kv = e.target.closest('[data-k][data-v]');
    if (kv) { state.brief[kv.dataset.k] = kv.hasAttribute('data-num') ? +kv.dataset.v : kv.dataset.v; return changed(); }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const k = tg.dataset.toggle; state.brief[k] = !state.brief[k]; return changed(); }
    const pf = e.target.closest('[data-profile]');
    if (pf) { const k = pf.dataset.profile; state.brief.rules = { ...state.brief.rules, ...zoning(k) }; return changed(); }
    const sp = e.target.closest('[data-step]');
    if (sp) { const k = sp.dataset.step; state.brief[k] = Math.max(+sp.dataset.min, Math.min(+sp.dataset.max, state.brief[k] + +sp.dataset.d)); changed(); }
  });
  step.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type === 'range') el.style.setProperty('--p', pct(+el.value, +el.min, +el.max));
    if (el.dataset.pri) { state.brief.pri[el.dataset.pri] = +el.value; return changed(); }
    if (el.dataset.k && el.type === 'range') { state.brief[el.dataset.k] = +el.value; return changed(); }
    if (el.dataset.k && el.type === 'number' && el.value !== '') { const v = Math.max(0, Math.min(20, +el.value)); if (!Number.isNaN(v)) { state.brief[el.dataset.k] = v; changed(); } }
    if (el.dataset.rule && el.value !== '') {
      const v = Math.max(+el.min, Math.min(+el.max, +el.value));
      if (!Number.isNaN(v)) { state.brief.rules = { ...state.brief.rules, [el.dataset.rule]: v }; changed(); }
    }
  });
  $('#progress').addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) goStep(+b.dataset.goto); });
  $('#wizBack').addEventListener('click', () => goStep(state.step - 1));
  $('#wizNext').addEventListener('click', () => (state.step === STEPS.length - 1 ? goStudio() : goStep(state.step + 1)));
}
function goStep(i) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, i));
  renderWizard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#wizStep h1')?.focus({ preventScroll: true });
}
function goStudio() { clearTimeout(genTimer); if (pendingGen) generate(); location.hash = '#/studio'; }

// ── generation ──────────────────────────────────────────────
let genTimer = null, pendingGen = false;
function changed() {
  syncWizard();
  store.set('parametra.brief', state.brief);
  pendingGen = true;
  $('#preview')?.classList.add('busy');
  clearTimeout(genTimer);
  genTimer = setTimeout(generate, 240);
}
function generate() {
  pendingGen = false;
  const t0 = performance.now();
  try {
    const res = recommend(state.brief, 4);
    state.picks = res.picks; state.explored = res.explored; state.ms = Math.round(performance.now() - t0);
    state.report = res.report;
    state.idx = 0; state.design = state.picks[0]; state.sel = null;
    requestFixes();
  } catch (err) {
    console.error(err);
    toast('This brief could not be laid out. Try a larger plot or fewer rooms.');
  }
  $('#preview')?.classList.remove('busy');
  if (state.route === 'brief') renderPreview();
  if (state.route === 'studio') { renderStudio(); mountStudioViewer(true); }
}

// When no layout meets the rules, search for brief changes that would fix it. The search
// regenerates hundreds of layouts, so it runs in a worker; a newer brief cancels an older search.
let fixWorker = null, fixBusy = false, fixSeq = 0;
function requestFixes() {
  const id = ++fixSeq;
  if (state.report.feasible) { state.fixes = []; return; }
  state.fixes = null;
  const brief = JSON.parse(JSON.stringify(state.brief));
  const done = (fixes) => { if (id !== fixSeq) return; fixBusy = false; state.fixes = fixes; renderFixState(); };
  const inline = () => setTimeout(() => { if (id === fixSeq) done(findFixes(brief)); }, 60);
  try {
    if (fixBusy && fixWorker) { fixWorker.terminate(); fixWorker = null; }
    if (!fixWorker) {
      fixWorker = new Worker(new URL('./fixworker.js', import.meta.url), { type: 'module' });
      fixWorker.onmessage = (e) => { if (e.data.id === fixSeq) done(e.data.fixes); };
      fixWorker.onerror = (e) => { console.warn('fix worker failed, searching on the main thread', e); e.preventDefault?.(); fixWorker?.terminate(); fixWorker = null; fixBusy = false; inline(); };
    }
    fixBusy = true;
    fixWorker.postMessage({ id, brief });
  } catch (err) { console.warn(err); inline(); }
}
function renderFixState() {
  if (state.route === 'brief') renderPreview();
  if (state.route === 'studio') renderBanner();
}
function applyFix(i) {
  const fx = state.fixes?.[i]; if (!fx) return;
  Object.assign(state.brief, fx.patch);
  store.set('parametra.brief', state.brief);
  clearTimeout(genTimer);
  if (state.route === 'brief') renderWizard();
  generate();
  toast(`Changed: ${fx.label}`);
}

// ── studio ──────────────────────────────────────────────────
function briefSentence(b) {
  return [`${b.bedrooms} bedrooms`, `${b.bathrooms} bathrooms`, `${b.area} m² target`, `${b.floors} storey${b.floors > 1 ? 's' : ''}`, STYLES[b.style].name, `${b.plotW} × ${b.plotD} m plot`, profileName(rulesOf(b))].join(', ');
}
function renderStudio() {
  const d = state.design; if (!d) return;
  $('#briefLine').textContent = briefSentence(state.brief);
  renderBanner();
  $('#options').innerHTML = state.picks.map((p, i) => {
    const bad = !p.compliance.ok;
    const nf = p.compliance.failed.length;
    const tag = bad ? `<small class="bad">Breaks ${nf} rule${nf > 1 ? 's' : ''}</small>` : `<small class="${i === 0 ? 'best' : ''}">${i === 0 ? 'Best match' : `Option ${p.letter}`}</small>`;
    return `
    <button type="button" class="opt${bad ? ' fails' : ''}" role="tab" aria-selected="${i === state.idx}" data-opt="${i}">
      <span class="o-plan">${renderThumb(p)}</span>
      <span class="o-txt">${tag}<b>${p.name}</b><span>${p.metrics.gross} m², about ${money(p.metrics.cost)}</span></span>
      <span class="o-score"><b>${p.metrics.score}</b><small>match</small></span>
    </button>`;
  }).join('');
  selectDesign(state.idx, false);
}
/** Shown above the options when no layout meets the rules: why, and tested changes that fix it. */
function renderBanner() {
  const el = $('#rulesBanner'), rep = state.report;
  if (!el) return;
  if (!rep || rep.feasible) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="rb-why">${ic('warn')}<div>
      <h2>None of the ${rep.explored} layouts meets your planning rules</h2>
      <ul>${blockingItems(rep)}</ul>
      <p>The designs below are the closest. Each one is marked with the rules it breaks.</p>
    </div></div>
    <div class="rb-fix"><h3>Changes that make it fit</h3>${fixList(3)}</div>`;
}
function selectDesign(i, toViewer = true) {
  state.idx = i;
  const d = (state.design = state.picks[i]);
  $$('.opt').forEach((el, k) => el.setAttribute('aria-selected', k === i));
  if (state.level >= d.nFloors) state.level = 0;
  if (state.level3d !== 'all' && state.level3d >= d.nFloors) state.level3d = 'all';
  state.sel = null;
  renderViewerBar();
  renderPlanView(true);
  renderDetails();
  if (toViewer && viewer && state.route === 'studio') { viewer.setDesign(d); applyStudioViewerState(); }
}

function renderViewerBar() {
  const d = state.design;
  $('.viewer').dataset.view = state.view;
  $('#panes').dataset.view = state.view;
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  const showAll = state.view !== 'plan' && d.nFloors > 1;
  const cur = state.view === 'plan' || state.level3d === 'all' && !showAll ? state.level : state.level3d;
  const levelName = (k) => (k === 0 ? 'Ground' : `Level ${k}`);
  $('#levelSeg').innerHTML = (showAll ? `<button type="button" data-lv="all" class="${cur === 'all' ? 'on' : ''}">All</button>` : '') +
    d.floors.map((_, k) => `<button type="button" data-lv="${k}" class="${cur === k ? 'on' : ''}">${levelName(k)}</button>`).join('');
  $('#levelSeg').hidden = d.nFloors === 1;
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode3d));
}

let vb = null;
function renderPlanView(resetZoom = false) {
  const d = state.design; if (!d) return;
  const host = $('#planHost');
  host.innerHTML = renderPlan(d, state.level, { furniture: state.layers.furniture, dims: state.layers.dims, selected: state.sel?.id });
  const svg = host.querySelector('svg');
  svg.dataset.base = svg.getAttribute('viewBox');
  if (resetZoom || !vb) vb = svg.dataset.base.split(' ').map(Number);
  svg.setAttribute('viewBox', vb.join(' '));
}
function zoomPlan(k, cx, cy) {
  const svg = $('#planHost svg'); if (!svg || !vb) return;
  const base = svg.dataset.base.split(' ').map(Number);
  const nw = Math.max(3, Math.min(base[2] * 2.5, vb[2] * k)); k = nw / vb[2];
  if (cx == null) { cx = vb[0] + vb[2] / 2; cy = vb[1] + vb[3] / 2; }
  vb = [cx - (cx - vb[0]) * k, cy - (cy - vb[1]) * k, vb[2] * k, vb[3] * k];
  svg.setAttribute('viewBox', vb.join(' '));
}
function bindPlan() {
  const host = $('#planHost');
  const toSvg = (svg, x, y) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM().inverse());
  host.addEventListener('wheel', (e) => { const svg = host.querySelector('svg'); if (!svg) return; e.preventDefault(); const p = toSvg(svg, e.clientX, e.clientY); zoomPlan(Math.exp(e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  let drag = null;
  host.addEventListener('pointerdown', (e) => { const svg = host.querySelector('svg'); if (!svg) return; drag = { p: toSvg(svg, e.clientX, e.clientY), x: e.clientX, y: e.clientY, moved: false }; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', (e) => {
    const svg = host.querySelector('svg'); if (!svg) return;
    if (drag) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      if (drag.moved) { host.classList.add('drag'); const p = toSvg(svg, e.clientX, e.clientY); vb[0] += drag.p.x - p.x; vb[1] += drag.p.y - p.y; svg.setAttribute('viewBox', vb.join(' ')); hideTip(); return; }
    }
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-room]');
    setHover(el ? findRoom(el.dataset.room) : null, e.clientX, e.clientY);
  });
  host.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-room]'); selectRoom(el ? findRoom(el.dataset.room) : null); }
    drag = null; host.classList.remove('drag');
  });
  host.addEventListener('pointercancel', () => { drag = null; host.classList.remove('drag'); });
  host.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
  const fit = () => { const svg = host.querySelector('svg'); if (!svg) return; vb = svg.dataset.base.split(' ').map(Number); svg.setAttribute('viewBox', vb.join(' ')); };
  host.addEventListener('dblclick', fit);
  $('#planFit').addEventListener('click', fit);
  $('#zoomIn').addEventListener('click', () => zoomPlan(0.8));
  $('#zoomOut').addEventListener('click', () => zoomPlan(1.25));
}
function findRoom(id) {
  for (const f of state.design?.floors || []) { const r = [...f.rooms, ...f.terraces].find((x) => x.id === id); if (r) return r; }
  return null;
}
function setHover(room, x, y) {
  if ((room?.id || null) !== (state.hover?.id || null)) {
    $$('.pl-room.hover').forEach((el) => el.classList.remove('hover'));
    if (room) $(`#planHost [data-room="${room.id}"]`)?.classList.add('hover');
    state.hover = room;
    if (viewer && state.route === 'studio') viewer.highlight(room && viewer.pickEnabled ? room : null, 'hl');
  }
  if (room) showTip(room, x, y); else hideTip();
}
function showTip(r, x, y) {
  const t = $('#tip');
  t.innerHTML = `<b>${r.label}</b>${(r.w * r.h).toFixed(1)} m², ${r.w.toFixed(1)} × ${r.h.toFixed(1)} m`;
  t.style.left = `${Math.min(window.innerWidth - 270, x + 14)}px`; t.style.top = `${y + 16}px`;
  t.classList.add('show');
}
function hideTip() { $('#tip').classList.remove('show'); }
function selectRoom(room) {
  state.sel = room;
  $$('.pl-room.sel').forEach((el) => el.classList.remove('sel'));
  if (room) {
    if (room.floor !== state.level) { state.level = room.floor; renderViewerBar(); renderPlanView(true); }
    $(`#planHost [data-room="${room.id}"]`)?.classList.add('sel');
    state.tab = 'rooms';
  }
  viewer?.highlight(room, 'sel');
  renderTabs();
}

// details panel
function verdict(s) { return s >= 85 ? ['Strong fit for your brief', ''] : s >= 72 ? ['Good fit for your brief', ''] : ['Fair fit, with trade-offs', 'mid']; }
function renderDetails() {
  const d = state.design, M = d.metrics, C = d.compliance;
  const [vt, vc] = C.ok ? verdict(M.score) : [`Breaks ${ruleCount(d)}`, 'bad'];
  $('#detailsHead').innerHTML = `
    <div class="dh-top"><div><h2>${d.name}</h2><p>Option ${d.letter} of ${state.picks.length}, ${d.style.name}</p></div>
      <div class="score"><b>${M.score}</b><small>out of 100</small></div></div>
    <div class="dh-flags"><span class="verdict ${vc}">${vt}</span>${C.ok ? `<button type="button" class="rule-pill" data-tab-go="rules">${ic('check')}Meets all ${C.items.length} rules</button>` : ''}</div>`;
  renderTabs();
}
function renderTabs() {
  $$('#tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  const d = state.design, M = d.metrics, st = d.style;
  let html = '';
  if (state.tab === 'overview') {
    const cells = [['Floor area', `${M.gross} m²`], ['Living area', `${M.net} m²`], ['Footprint', `${M.footprint} m²`], ['Envelope', `${d.W.toFixed(1)} × ${d.D.toFixed(1)} m`], ['Height', `${(d.nFloors * d.H + (st.roof === 'flat' ? 0.5 : st.roof === 'float' ? 0.4 : 2)).toFixed(1)} m`], ['Garden', `${Math.round(M.gardenRatio * 100)}% of plot`]];
    if (M.garage) cells.push(['Garage', `${M.garage} m²`]);
    if (M.terrace) cells.push(['Terraces', `${M.terrace} m²`]);
    html = `
      <div class="cost"><span>Estimated build cost</span><b>${money(M.costLow)} to ${money(M.costHigh)}</b></div>
      <div>${titleblock(cells, 'grid c2')}</div>
      <div><h3>Why this design works</h3><ul class="notes">${d.story.lines.map((l) => `<li>${ic('check')}<span>${l}</span></li>`).join('')}</ul></div>
      ${d.story.warns.length ? `<div><h3>Worth reviewing</h3><ul class="notes warn">${d.story.warns.map((l) => `<li>${ic('warn')}<span>${l}</span></li>`).join('')}</ul></div>` : ''}`;
  } else if (state.tab === 'rooms') {
    const r = state.sel;
    let card = '<p class="empty-hint">Select a room on the plan or in the 3D view to see its size, windows and orientation.</p>';
    if (r) {
      const f = d.floors[r.floor];
      const ops = f.openings.filter((o) => o.a === r.id || o.b === r.id);
      const wins = ops.filter((o) => o.kind === 'window' || (o.kind === 'slide' && (!o.a || !o.b)));
      const dirs = [...new Set(wins.map((o) => DIR_NAME[compass(o.side || (o.axis === 'h' ? (o.a ? 'N' : 'S') : o.a ? 'E' : 'W'), d.brief.street)]))];
      const glaz = wins.reduce((s, o) => s + (o.e - o.s) * (o.head - o.sill), 0);
      card = `<div class="room-card"><div class="rc-top"><h4>${r.label}</h4><button type="button" class="icon-btn" id="rcClose" aria-label="Clear selection">${ic('close', '')}</button></div>
        ${titleblock([['Area', `${(r.w * r.h).toFixed(1)} m²`], ['Size', `${r.w.toFixed(1)} × ${r.h.toFixed(1)} m`], ['Level', r.floor === 0 ? 'Ground' : `Level ${r.floor}`]])}
        <p>${wins.length ? `${wins.length} window${wins.length > 1 ? 's' : ''} with ${glaz.toFixed(1)} m² of glass, facing ${dirs.join(' and ')}.` : 'No exterior windows.'}</p>
        <button type="button" class="btn" id="rcFocus">${ic('focus')}Show in 3D</button></div>`;
    }
    const zone = (x) => `var(--z-${x.type === 'terrace' ? 'circ' : ROOM_TYPES[x.type]?.zone || 'circ'})`;
    const rows = d.floors.map((f, k) => `<tr><th colspan="3">${k === 0 ? 'Ground floor' : `Level ${k}`}, ${Math.round(f.rooms.reduce((s, x) => s + x.w * x.h, 0))} m²</th></tr>` +
      [...f.rooms, ...f.terraces].filter((x) => x.type !== 'hall').sort((p, q) => q.w * q.h - p.w * p.h)
        .map((x) => `<tr class="r ${state.sel?.id === x.id ? 'on' : ''}" data-room="${x.id}" tabindex="0"><td><span class="zd" style="background:${zone(x)}"></span>${x.label}</td><td class="n">${x.w.toFixed(1)} × ${x.h.toFixed(1)}</td><td class="n">${(x.w * x.h).toFixed(1)} m²</td></tr>`).join('')).join('');
    html = `${card}<div><h3>Room schedule</h3><table class="sched"><tbody>${rows}</tbody></table></div>`;
  } else if (state.tab === 'scores') {
    html = scoresTab(d);
  } else if (state.tab === 'rules') {
    html = rulesTab(d);
  } else {
    html = `
      <div class="swatches">${[['Facade', st.ext.color], ['Accent', st.accent.color], ['Roof', st.roofMat.color], ['Frames', st.frame]].map(([n, c]) => `<div><i style="background:${c}"></i>${n}</div>`).join('')}</div>
      <div class="spec">
        <div><span>Roof</span><b>${ROOFNAME[st.roof]}${st.pitch ? `, ${st.pitch}°` : ''}</b></div>
        <div><span>Facade</span><b>${FACADE[st.ext.tex] || st.ext.tex}, with ${(FACADE[st.accent.tex] || st.accent.tex).toLowerCase()} accents</b></div>
        <div><span>Windows</span><b>${Math.round(st.glazing * 100)}% glazing${st.fullHeight ? ', floor to ceiling in living rooms' : ''}${st.windows === 'contemporary' ? ', ribbon windows in bedrooms, slots at the stair and entry' : ''}</b></div>
        ${st.details ? `<div><span>Details</span><b>${st.details}</b></div>` : ''}
        <div><span>Floors</span><b>${FLOORNAME[st.floor.tex] || 'Terracotta tiles'}</b></div>
        <div><span>Bathrooms</span><b>${WETNAME[st.wetFloor.tex] || 'Porcelain tile'}</b></div>
        <div><span>Ceiling height</span><b>${d.ceiling.toFixed(2)} m</b></div>
      </div>`;
  }
  $('#tabBody').innerHTML = html;
  bindScoreHover();
  $('#rcClose')?.addEventListener('click', () => selectRoom(null));
  $('#rcFocus')?.addEventListener('click', () => {
    const r = state.sel; if (!viewer || !r) return;
    if (state.view === 'plan') setView('split');
    set3DMode('section'); state.level3d = r.floor; viewer.setLevel(r.floor); renderViewerBar(); viewer.focusRoom(r);
  });
}
/** Rules tab: pass/fail for every planning rule and building standard, and why layouts were rejected. */
function rulesTab(d) {
  const C = d.compliance, rep = state.report, n = C.items.length;
  const row = (it) => `<li class="${it.ok ? 'ok' : 'bad'}">${ic(it.ok ? 'check' : 'warn')}<div><b>${it.label}${it.ok ? '' : '<span class="sr"> (fails)</span>'}</b><span class="rl-d">${it.detail}</span><p>${it.desc}</p></div></li>`;
  const list = (g) => C.items.filter((it) => it.group === g).map(row).join('');
  const rej = rep && rep.reasons.length ? `<dl class="rs-reasons">${rep.reasons.slice(0, 4).map((r) => `<div><dt>${r.label}</dt><dd>${r.fails} rejected</dd></div>`).join('')}</dl>` : '';
  return `
    <div class="rules-sum ${C.ok ? 'ok' : 'bad'}">
      <div class="rs-top">${ic(C.ok ? 'check' : 'warn')}<b>${C.ok ? `Meets all ${n} rules` : `Breaks ${C.failed.length} of ${n} rules`}</b><span>${C.profile}</span></div>
      ${rep ? `<p>${rep.explored} layouts explored. ${rep.compliant ? `${rep.compliant} met every rule${rep.rejected ? ` and ${rep.rejected} were rejected` : ''}.` : 'None met every rule.'}</p>` : ''}
      ${rej}
    </div>
    <div><h3>Planning</h3><ul class="rule-list">${list('planning')}</ul></div>
    <div><h3>Building standards</h3><ul class="rule-list">${list('building')}</ul></div>
    <p class="sub">The rule values are typical starting points, not your council's code. <button type="button" class="link" data-edit-rules>Edit the rules</button></p>`;
}

const LOW_SCORE = 55;
/** Scores tab: radar profile + strongest/weakest summary, then one meter per criterion with its share of the match. */
function scoresTab(d) {
  const M = d.metrics, keys = Object.keys(METRIC_INFO);
  const W = scoreWeights(d.brief.pri), wSum = keys.reduce((s, k) => s + W[k], 0);
  const ranked = [...keys].sort((a, b) => M[b] - M[a]);
  const top = ranked.filter((k) => M[k] >= 85).slice(0, 3);
  const low = ranked.filter((k) => M[k] < 70).reverse().slice(0, 2);
  const names = (list) => list.map((k) => METRIC_INFO[k].short).join(', ');
  const meters = keys.map((k) => {
    const lo = M[k] < LOW_SCORE;
    return `<li class="meter${lo ? ' lo' : ''}" data-k="${k}">
      <div class="m-top"><span class="m-name">${METRIC_INFO[k].label}</span><span class="m-w">${Math.round((W[k] / wSum) * 100)}% of match</span>
        <b class="m-v">${lo ? `${ic('warn')}<span class="sr">Low score: </span>` : ''}${M[k]}</b></div>
      <span class="tr" aria-hidden="true"><i style="width:${M[k]}%"></i></span>
      <p>${METRIC_DESC[k]}</p></li>`;
  }).join('');
  return `
    <div class="score-sum">
      <div class="radar-wrap">${radar(M)}</div>
      <dl class="score-key">
        <div><dt>Strongest</dt><dd>${top.length ? names(top) : names(ranked.slice(0, 2))}</dd></div>
        <div><dt>Weakest</dt><dd>${low.length ? names(low) : 'Nothing below 70'}</dd></div>
      </dl>
    </div>
    <div>
      <h3>How the match is scored</h3>
      <p class="sub">Each criterion is scored out of 100. Your priorities set how much each one counts towards the overall ${M.score}.</p>
      <ul class="meters">${meters}</ul>
    </div>`;
}
function radar(M) {
  const keys = Object.keys(METRIC_INFO);
  const cx = 170, cy = 128, R = 86;
  const pt = (i, v) => { const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const f = (n) => n.toFixed(1);
  let s = `<svg class="radar" viewBox="0 0 340 256" role="img" aria-label="Score profile: ${keys.map((k) => `${METRIC_INFO[k].label} ${M[k]}`).join(', ')}">`;
  for (const g of [0.25, 0.5, 0.75, 1]) s += `<polygon class="rg${g === 1 ? ' out' : ''}" points="${keys.map((_, i) => pt(i, g).map(f).join(',')).join(' ')}"/>`;
  keys.forEach((k, i) => {
    const [x, y] = pt(i, 1); s += `<line class="ax" x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}"/>`;
    const [lx, ly] = pt(i, 1.17);
    s += `<text data-k="${k}" x="${f(lx)}" y="${f(ly + 4)}" text-anchor="${lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle'}">${METRIC_INFO[k].short}</text>`;
  });
  s += `<polygon class="area" points="${keys.map((k, i) => pt(i, M[k] / 100).map(f).join(',')).join(' ')}"/>`;
  keys.forEach((k, i) => {
    const [x, y] = pt(i, M[k] / 100);
    s += `<g class="pt-g" data-k="${k}"><circle class="hit" cx="${f(x)}" cy="${f(y)}" r="11"/><circle class="pt" cx="${f(x)}" cy="${f(y)}" r="4"/><title>${METRIC_INFO[k].label}: ${M[k]}</title></g>`;
  });
  return s + '</svg>';
}
/** Linked hover between radar points and their meter rows. */
function bindScoreHover() {
  const body = $('#tabBody');
  if (!body.querySelector('.meters')) return;
  const set = (k) => body.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('hot', el.dataset.k === k));
  body.onpointerover = (e) => { const el = e.target.closest('[data-k]'); set(el ? el.dataset.k : null); };
  body.onpointerleave = () => set(null);
}

function setView(v) {
  state.view = v;
  renderViewerBar();
  requestAnimationFrame(() => viewer?.resize());
}
function set3DMode(m) {
  if (!viewer) return;
  viewer.setMode(m);
  state.mode3d = viewer.mode;
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === viewer.mode));
  $('#pane3d').classList.toggle('walking', viewer.mode === 'walk');
}
function bindStudio() {
  $('#options').addEventListener('click', (e) => { const o = e.target.closest('[data-opt]'); if (o) selectDesign(+o.dataset.opt); });
  $('#options').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const n = (state.idx + (e.key === 'ArrowRight' ? 1 : -1) + state.picks.length) % state.picks.length;
    selectDesign(n); $$('.opt')[n].focus();
  });
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('#levelSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lv]'); if (!b) return;
    if (b.dataset.lv === 'all') state.level3d = 'all';
    else { state.level = +b.dataset.lv; state.level3d = +b.dataset.lv; renderPlanView(true); }
    viewer?.setLevel(state.level3d);
    if (state.mode3d === 'section') viewer?.preset('section');
    renderViewerBar();
  });
  $('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) set3DMode(b.dataset.mode); });
  $('#camDd').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cam]'); if (!c || !viewer) return;
    if (viewer.mode === 'walk') set3DMode('exterior');
    viewer.preset(c.dataset.cam); closeDropdowns();
  });
  $('#spinChk').addEventListener('change', (e) => { if (viewer) viewer.autoRotate = e.target.checked; });
  const sun = $('#sun');
  const upd = () => { const v = +sun.value; $('#sunVal').textContent = `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`; sun.style.setProperty('--p', pct(v, +sun.min, +sun.max)); viewer?.setSunTime(v); };
  sun.addEventListener('input', upd); upd();
  $('#layerDd').addEventListener('change', (e) => {
    const k = e.target.dataset.layer; if (!k) return;
    state.layers[k] = e.target.checked;
    if (k === 'furniture' || k === 'dims') renderPlanView();
    if (viewer && k !== 'dims') viewer.setToggle(k, e.target.checked);
  });
  $('#tabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { state.tab = t.dataset.tab; renderTabs(); } });
  $('#tabs').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const ids = ['overview', 'rooms', 'scores', 'rules', 'materials'];
    state.tab = ids[(ids.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]; renderTabs(); $(`#tabs [data-tab="${state.tab}"]`).focus();
  });
  $('#tabBody').addEventListener('click', (e) => { const tr = e.target.closest('tr.r'); if (tr) selectRoom(findRoom(tr.dataset.room)); });
  $('#tabBody').addEventListener('keydown', (e) => { const tr = e.target.closest('tr.r'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectRoom(findRoom(tr.dataset.room)); } });
  $('#exportDd').addEventListener('click', async (e) => { const b = e.target.closest('[data-export]'); if (!b) return; closeDropdowns(); await doExport(b.dataset.export); });
}

// ── 3D ──────────────────────────────────────────────────────
async function init3D() {
  try {
    const { Viewer3D } = await import('./viewer3d.js');
    const host = state.route === 'studio' ? $('#studioSlot') : $('#heroSlot');
    viewer = new Viewer3D(host, {
      onHover: (h) => {
        if (state.route !== 'studio') return;
        if (!h) { if (state.hover) setHover(null); return; }
        const rc = viewer.el.getBoundingClientRect();
        state.hover = h.room; showTip(h.room, rc.left + h.x, rc.top + h.y);
        $$('.pl-room.hover').forEach((el) => el.classList.remove('hover'));
        $(`#planHost [data-room="${h.room.id}"]`)?.classList.add('hover');
      },
      onSelect: (room) => { if (state.route === 'studio') selectRoom(room); },
      onModeChange: (m) => {
        if (state.route !== 'studio') return;
        state.mode3d = m;
        $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
        $('#pane3d').classList.toggle('walking', m === 'walk');
      },
      onCompass: (h) => { $('#compass3d').style.transform = `rotate(${-h}deg)`; },
    });
    viewer.setSunTime(+$('#sun').value);
    $('#loading3d')?.remove();
    $('#heroSlot').addEventListener('pointerdown', () => $('#dragHint')?.remove(), { once: true });
    // stop rendering the landing turntable while it is scrolled out of view
    new IntersectionObserver(([e]) => { if (viewer && state.route === 'home') viewer.paused = !e.isIntersecting; }).observe($('#heroSlot'));
    if (state.route === 'home') renderHomeViewer();
    else if (state.route === 'studio') mountStudioViewer(true);
    if (state.route === 'studio' && ['front', 'rear', 'side', 'aerial'].includes(qs.get('cam'))) viewer.preset(qs.get('cam'), false);
  } catch (err) {
    console.error(err);
    const l = $('#loading3d'); if (l) l.textContent = 'The 3D view needs WebGL and must be served over http. Floor plans still work.';
    $('#dragHint')?.remove();
  }
}
function applyStudioViewerState() {
  if (!viewer) return;
  for (const k of ['roof', 'furniture', 'labels']) viewer.setToggle(k, state.layers[k]);
  if (viewer.mode !== state.mode3d && state.mode3d !== 'walk') viewer.setMode(state.mode3d);
  viewer.setLevel(state.level3d);
}
function mountStudioViewer(force = false) {
  if (!viewer || state.route !== 'studio' || !state.design) return;
  viewer.paused = false;
  const fresh = viewer.el !== $('#studioSlot');
  viewer.mount($('#studioSlot'));
  viewer.setShowcase(false);
  viewer.autoRotate = $('#spinChk').checked;
  if (force || fresh || viewer.design !== state.design) {
    viewer.setDesign(state.design);
    applyStudioViewerState();
    viewer.preset(state.mode3d === 'section' ? 'section' : 'front', false);
  }
}

// ── chrome: dropdowns, theme, toast, exports ────────────────
function closeDropdowns(except) { $$('.dd.open').forEach((d) => { if (d !== except) { d.classList.remove('open'); d.querySelector(':scope > button')?.setAttribute('aria-expanded', 'false'); } }); }
function bindChrome() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.dd > button');
    if (t) { const dd = t.parentElement; const open = !dd.classList.contains('open'); closeDropdowns(dd); dd.classList.toggle('open', open); t.setAttribute('aria-expanded', open); return; }
    if (!e.target.closest('.dd-pop')) closeDropdowns();
    const ex = e.target.closest('[data-open-preset]');
    if (ex) { openPreset(PRESETS.find((p) => p.id === ex.dataset.openPreset)); return; }
    if (e.target.closest('[data-open-example]')) { openPreset(HERO); return; }
    const sty = e.target.closest('[data-start-style]');
    if (sty) { state.brief.style = sty.dataset.startStyle; store.set('parametra.brief', state.brief); generate(); state.step = 0; location.hash = '#/brief'; toast(`${STYLES[state.brief.style].name} selected. You can change it in step 5.`); return; }
    if (e.target.closest('[data-go-studio]')) goStudio();
    const fx = e.target.closest('[data-fix]');
    if (fx) { applyFix(+fx.dataset.fix); return; }
    const tg = e.target.closest('[data-tab-go]');
    if (tg) { state.tab = tg.dataset.tabGo; renderTabs(); return; }
    if (e.target.closest('[data-edit-rules]')) { state.step = 0; location.hash = '#/brief'; setTimeout(() => $('#ruleSeg')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdowns(); });
  const applyIcon = () => {
    const t = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    $('#themeBtn').innerHTML = `<svg><use href="#i-${t === 'dark' ? 'sun' : 'moon'}"/></svg>`;
    $('#themeBtn').setAttribute('aria-label', t === 'dark' ? 'Use light theme' : 'Use dark theme');
  };
  const savedTheme = store.get('parametra.theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  applyIcon();
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nx; store.set('parametra.theme', nx); applyIcon();
  });
  window.addEventListener('hashchange', route);
}
function openPreset(p) {
  state.brief = presetBrief(p);
  store.set('parametra.brief', state.brief);
  generate();
  location.hash = '#/studio';
  toast(`Opened the ${p.name.toLowerCase()} example`);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  if (typeof blob !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function doExport(kind) {
  const d = state.design; if (!d) return;
  const base = `parametra-${d.name.toLowerCase()}-${d.letter.toLowerCase()}`;
  try {
    if (kind === 'ifc') {
      if (!viewer) return toast('The 3D view is not available, so the BIM model cannot be exported');
      if (viewer.design !== d) viewer.setDesign(d);
      toast('Preparing the BIM model');
      await new Promise((r) => setTimeout(r, 30)); // let the toast paint before the export blocks
      download(new Blob([viewer.exportIFC()], { type: 'application/x-step' }), `${base}.ifc`);
      toast('BIM model exported');
    }
    if (kind === 'glb') { if (!viewer) return toast('The 3D view is not available, so the 3D model cannot be exported'); toast('Preparing the 3D model'); download(await viewer.exportGLB(), `${base}.glb`); toast('3D model exported'); }
    if (kind === 'png') { if (!viewer) return toast('The 3D view is not available'); download(viewer.screenshot(), `${base}.png`); toast('Image exported'); }
    if (kind === 'svg') {
      const parts = d.floors.map((_, k) => renderPlan(d, k, { furniture: true, dims: true }));
      let x = 0; const H = [], inner = [];
      for (const p of parts) {
        const v = p.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
        inner.push(p.replace('<svg ', `<svg x="${x}" y="0" width="${v[2]}" height="${v[3]}" `));
        x += v[2] + 1; H.push(v[3]);
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${Math.max(...H)}" width="${x * 40}" height="${Math.max(...H) * 40}"><style>${PLAN_STYLE}</style>${inner.join('')}</svg>`;
      download(new Blob([svg], { type: 'image/svg+xml' }), `${base}-plans.svg`); toast('Floor plans exported');
    }
    if (kind === 'json') {
      const data = {
        generator: 'Parametra', option: `${d.letter} ${d.name}`, style: d.style.name, brief: d.brief,
        envelope: { width: d.W, depth: d.D, storeys: d.nFloors, floorToFloor: d.H }, metrics: d.metrics, narrative: d.story,
        compliance: { rules: d.compliance.profile, passes: d.compliance.ok, checks: d.compliance.items.map(({ id, label, ok, value, limit, sense, detail }) => ({ id, label, passes: ok, value: +value.toFixed(3), limit, sense, detail })) },
        levels: d.floors.map((f) => ({ level: f.level, rooms: [...f.rooms, ...f.terraces].map(({ id, type, label, x, y, w, h }) => ({ id, type, label, x, y, w, h, area: +(w * h).toFixed(2) })), openings: f.openings })),
      };
      download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${base}.json`); toast('Design data exported');
    }
  } catch (err) { console.error(err); toast('Export failed. Check the browser console for details.'); }
}
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// ── boot ────────────────────────────────────────────────────
const qs = new URLSearchParams(location.search);
if (qs.get('preset')) { const p = PRESETS.find((x) => x.id === qs.get('preset')); if (p) state.brief = presetBrief(p); }
if (qs.get('style') && STYLES[qs.get('style')]) state.brief.style = qs.get('style');
if (['plan', 'split', '3d'].includes(qs.get('view'))) state.view = qs.get('view');
if (['exterior', 'section'].includes(qs.get('mode'))) state.mode3d = qs.get('mode');
if (qs.get('step')) state.step = Math.max(0, Math.min(5, +qs.get('step') - 1 || 0));
if (['overview', 'rooms', 'scores', 'rules', 'materials'].includes(qs.get('tab'))) state.tab = qs.get('tab');
if (['dark', 'light'].includes(qs.get('theme'))) store.set('parametra.theme', qs.get('theme'));

state.heroDesign = recommend(presetBrief(HERO), 1).picks[0];
bindChrome();
bindWizard();
bindPlan();
bindStudio();
generate();
renderHome();
route();
init3D();
