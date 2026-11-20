// ─────────────────────────────────────────────────────────────
//  PARAMETRA · 2D architectural plan renderer (SVG, units = metres)
// ─────────────────────────────────────────────────────────────
import { T_EXT, T_INT, STAIR_W, compass } from './engine.js';
import { ROOM_TYPES } from './data.js';
import { signedArea } from './lot.js';

const AZ = { N: 0, E: 90, S: 180, W: 270 };
const ROT = { N: 0, S: 180, W: -90, E: 90 };
const f2 = (v) => (Math.round(v * 1000) / 1000).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const PLAN_STYLE = `
.pl-bg{fill:var(--plan-bg,#FBF9F4)}
.pl-grid{stroke:var(--plan-grid,#E9E4DA);stroke-width:.01}
.pl-room{stroke:none;transition:fill .15s}
.pl-room.public{fill:var(--z-public,#F1EADB)}
.pl-room.private{fill:var(--z-private,#E2EBE4)}
.pl-room.service{fill:var(--z-service,#E8EAE6)}
.pl-room.circ{fill:var(--z-circ,#F5F6F2)}
.pl-room.outdoor{fill:url(#deck)}
.pl-room.hover{fill:var(--z-hover,#F2E2BF)}
.pl-room.sel{fill:var(--z-sel,#E9CD8E)}
.pl-wall{fill:var(--plan-ink,#24211D)}
.pl-wall.int{fill:var(--plan-ink2,#3A3631)}
.pl-thin{fill:none;stroke:var(--plan-ink,#24211D);stroke-width:.018}
.pl-hair{fill:none;stroke:var(--plan-ink,#24211D);stroke-width:.01}
.pl-open{fill:none;stroke:var(--plan-muted,#A79F92);stroke-width:.018;stroke-dasharray:.12 .08}
.pl-glass{fill:var(--plan-glass,#E4EEF1);stroke:var(--plan-ink,#24211D);stroke-width:.012}
.pl-swing{fill:none;stroke:var(--plan-muted,#8E8679);stroke-width:.012;stroke-dasharray:.05 .04}
.pl-leaf{fill:none;stroke:var(--plan-ink,#24211D);stroke-width:.03}
.pl-furn{fill:var(--plan-furn,#FFFFFF);stroke:var(--plan-furn-ink,#7A7266);stroke-width:.014}
.pl-furn-l{fill:none;stroke:var(--plan-furn-ink,#7A7266);stroke-width:.01}
.pl-furn-f{fill:var(--plan-furn-ink,#7A7266);stroke:none}
.pl-rug{fill:var(--plan-rug,#EFE8DB);stroke:var(--plan-furn-ink,#B7AE9F);stroke-width:.01}
.pl-label{font-family:var(--font,Archivo,system-ui,sans-serif);fill:var(--plan-ink,#24211D);text-anchor:middle;font-weight:700;letter-spacing:.01em}
.pl-sub{font-family:var(--font,Archivo,system-ui,sans-serif);font-variant-numeric:tabular-nums;fill:var(--plan-muted,#7E7669);text-anchor:middle}
.pl-dim{stroke:var(--plan-dim,#1E5A44);stroke-width:.012;fill:none}
.pl-dimt{font-family:var(--font,Archivo,system-ui,sans-serif);font-variant-numeric:tabular-nums;fill:var(--plan-dim,#1E5A44);text-anchor:middle}
.pl-site{fill:none;stroke:var(--plan-muted,#B9B0A2);stroke-width:.03;stroke-dasharray:.3 .15}
.pl-below{fill:none;stroke:var(--plan-muted,#B9B0A2);stroke-width:.02;stroke-dasharray:.2 .12}
.pl-patio{fill:var(--plan-patio,#EDE6D8);stroke:var(--plan-muted,#B9B0A2);stroke-width:.015}
.pl-pool{fill:var(--plan-pool,#CFE6EE);stroke:var(--plan-ink,#24211D);stroke-width:.02}
.pl-stair{fill:var(--plan-furn,#FFFFFF);stroke:var(--plan-ink,#24211D);stroke-width:.012}
.pl-arrow{fill:none;stroke:var(--plan-dim,#1E5A44);stroke-width:.02}
.pl-arrowh{fill:var(--plan-dim,#1E5A44)}
.pl-title{font-family:var(--font,Archivo,system-ui,sans-serif);font-stretch:118%;fill:var(--plan-ink,#24211D);font-weight:750}
`;

function zoneOf(r) { return r.type === 'terrace' ? 'outdoor' : ROOM_TYPES[r.type]?.zone || 'circ'; }

export function renderPlan(d, level, opt = {}) {
  const { furniture = true, dims = true, labels = true, thumb = false, hover = null, selected = null, title = true } = opt;
  const f = d.floors[level];
  const Y = (y) => -y;
  const prot = d.site?.prot || 0;
  const below = level > 0 ? d.floors[level - 1] : null;
  const s = d.site;
  const patio = level === 0 && s?.patio ? s.patio : null;
  const pool = level === 0 && s?.pool ? s.pool : null;
  const topExtra = Math.max(patio ? patio.h : 0, f.balconies.length ? 1.5 : 0, pool ? pool.y + pool.h - d.D : 0);
  const m = thumb ? 0.6 : 2.2;
  const vx = -m - (thumb ? 0 : 0.6), vy = -(d.D + topExtra + m + (thumb ? 0 : 0.8)), vw = d.W + 2 * m + (thumb ? 0 : 1.6), vh = d.D + topExtra + prot + 2 * m + (thumb ? 0 : 1.6);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}" class="plan-svg" data-level="${level}">`);
  out.push(`<defs><style>${PLAN_STYLE}</style>
    <pattern id="deck" width=".18" height=".18" patternUnits="userSpaceOnUse"><rect width=".18" height=".18" fill="var(--plan-patio,#EDE6D8)"/><line x1="0" y1=".09" x2=".18" y2=".09" stroke="var(--plan-muted,#C9BFAF)" stroke-width=".008"/></pattern>
    <pattern id="hatch" width=".15" height=".15" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2=".15" stroke="var(--plan-muted,#C9BFAF)" stroke-width=".01"/></pattern>
  </defs>`);
  out.push(`<rect class="pl-bg" x="${f2(vx)}" y="${f2(vy)}" width="${f2(vw)}" height="${f2(vh)}"/>`);
  if (!thumb) {
    const g = [];
    for (let x = Math.ceil(vx); x < vx + vw; x += 1) g.push(`M${x} ${f2(vy)}V${f2(vy + vh)}`);
    for (let y = Math.ceil(vy); y < vy + vh; y += 1) g.push(`M${f2(vx)} ${y}H${f2(vx + vw)}`);
    out.push(`<path class="pl-grid" d="${g.join('')}"/>`);
  }

  // outdoor context
  if (patio) out.push(`<rect class="pl-patio" x="${f2(patio.x)}" y="${f2(Y(patio.y + patio.h))}" width="${f2(patio.w)}" height="${f2(patio.h)}" fill="url(#deck)"/>`);
  if (pool) out.push(`<rect class="pl-pool" x="${f2(pool.x)}" y="${f2(Y(pool.y + pool.h))}" width="${f2(pool.w)}" height="${f2(pool.h)}" rx=".15"/>`);
  for (const bc of f.balconies) out.push(`<rect class="pl-patio" x="${f2(bc.x)}" y="${f2(Y(bc.y + bc.h))}" width="${f2(bc.w)}" height="${f2(bc.h)}" fill="url(#deck)"/><path class="pl-thin" d="M${f2(bc.x)} ${f2(Y(bc.y))}V${f2(Y(bc.y + bc.h))}H${f2(bc.x + bc.w)}V${f2(Y(bc.y))}"/>`);
  if (below) {
    const p = [];
    for (const w of below.walls) if (w.type === 'ext') p.push(w.axis === 'h' ? `M${f2(w.s)} ${f2(Y(w.c))}H${f2(w.e)}` : `M${f2(w.c)} ${f2(Y(w.s))}V${f2(Y(w.e))}`);
    out.push(`<path class="pl-below" d="${p.join('')}"/>`);
  }

  // rooms
  for (const r of [...f.terraces, ...f.rooms]) {
    const cls = ['pl-room', zoneOf(r)];
    if (hover === r.id) cls.push('hover');
    if (selected === r.id) cls.push('sel');
    out.push(`<rect class="${cls.join(' ')}" data-room="${r.id}" x="${f2(r.x)}" y="${f2(Y(r.y + r.h))}" width="${f2(r.w)}" height="${f2(r.h)}"/>`);
  }

  // furniture
  if (furniture && f.furniture && !thumb) {
    const rugs = [], rest = [];
    for (const items of Object.values(f.furniture)) for (const it of items) (it.t === 'rug' || it.t === 'mat' ? rugs : rest).push(it);
    out.push('<g pointer-events="none">');
    for (const it of [...rugs, ...rest]) out.push(symbol(it, Y));
    out.push('</g>');
  }

  // stair
  const st = f.rooms.find((r) => r.type === 'stair');
  if (st) out.push(stairSVG(d, st, level, Y, thumb));

  // open edges
  out.push(`<path class="pl-open" d="${f.walls.filter((w) => w.type === 'open').map((w) => (w.axis === 'h' ? `M${f2(w.s)} ${f2(Y(w.c))}H${f2(w.e)}` : `M${f2(w.c)} ${f2(Y(w.s))}V${f2(Y(w.e))}`)).join('')}"/>`);

  // walls (poché) with gaps at openings
  const wallsExt = [], wallsInt = [];
  for (const w of f.walls) {
    if (w.type === 'open') continue;
    const t = w.type === 'ext' ? T_EXT : T_INT;
    const ops = f.openings.filter((o) => o.axis === w.axis && Math.abs(o.c - w.c) < 1e-3 && o.s < w.e - 1e-3 && o.e > w.s + 1e-3).sort((p, q) => p.s - q.s);
    let cur = w.s - t / 2;
    const segs = [];
    for (const o of ops) { if (o.s - cur > 0.003) segs.push([cur, o.s]); cur = Math.max(cur, o.e); }
    if (w.e + t / 2 - cur > 0.003) segs.push([cur, w.e + t / 2]);
    for (const [a, b] of segs) {
      const rect = w.axis === 'h' ? `M${f2(a)} ${f2(Y(w.c) - t / 2)}h${f2(b - a)}v${f2(t)}h${f2(a - b)}z` : `M${f2(w.c - t / 2)} ${f2(Y(b))}h${f2(t)}v${f2(b - a)}h${f2(-t)}z`;
      (w.type === 'ext' ? wallsExt : wallsInt).push(rect);
    }
  }
  out.push(`<path class="pl-wall int" d="${wallsInt.join('')}"/>`);
  out.push(`<path class="pl-wall" d="${wallsExt.join('')}"/>`);

  // openings
  if (!thumb) for (const o of f.openings) out.push(openingSVG(o, Y));

  // terrace railings
  if (!thumb && f.terraces.length) {
    // light outline of terraces
    for (const t of f.terraces) out.push(`<rect class="pl-hair" x="${f2(t.x)}" y="${f2(Y(t.y + t.h))}" width="${f2(t.w)}" height="${f2(t.h)}" stroke-dasharray=".08 .06"/>`);
  }

  // labels
  if (labels && !thumb) {
    for (const r of [...f.rooms, ...f.terraces]) {
      if (r.type === 'hall' && r.w < 6) continue;
      const area = r.w * r.h;
      if (area < 1.6) continue;
      const fs = Math.max(0.17, Math.min(0.3, Math.min(r.w, r.h) * 0.11));
      const cx = r.x + r.w / 2, cy = Y(r.y + r.h / 2);
      const vertical = r.w < 1.5 && r.h > 2.2;
      const tr = vertical ? ` transform="rotate(-90 ${f2(cx)} ${f2(cy)})"` : '';
      const name = r.type === 'hall' ? r.label : r.label;
      out.push(`<g pointer-events="none"${tr}><rect x="${f2(cx - Math.min(name.length * fs * 0.33 + 0.18, (vertical ? r.h : r.w) / 2 - 0.05))}" y="${f2(cy - fs * 1.05)}" width="${f2(Math.min(name.length * fs * 0.66 + 0.36, (vertical ? r.h : r.w) - 0.1))}" height="${f2(fs * 2.25)}" rx="${f2(fs * 0.3)}" fill="var(--plan-bg,#FBF9F4)" opacity=".82"/>`);
      out.push(`<text class="pl-label" x="${f2(cx)}" y="${f2(cy)}" font-size="${f2(fs)}">${esc(name)}</text>`);
      out.push(`<text class="pl-sub" x="${f2(cx)}" y="${f2(cy + fs * 0.95)}" font-size="${f2(fs * 0.68)}">${area.toFixed(1)} m² · ${r.w.toFixed(1)}×${r.h.toFixed(1)}</text></g>`);
    }
  }

  // dimensions
  if (dims && !thumb) out.push(dimsSVG(d, f, Y, prot, patio, f.balconies.length ? 1.5 : 0));

  // north arrow + scale + title
  if (!thumb) {
    const backAz = AZ[compass('N', d.brief.street)];
    const nx = d.W + m - 0.2, ny = vy + 1.1;
    out.push(`<g transform="translate(${f2(nx)} ${f2(ny)}) rotate(${-backAz})"><circle r=".55" fill="var(--plan-bg,#FBF9F4)" stroke="var(--plan-ink,#24211D)" stroke-width=".02"/><path d="M0 -.45 L.16 .2 L0 .08 L-.16 .2Z" fill="var(--plan-ink,#24211D)"/><text y="-.62" class="pl-label" font-size=".26" transform="rotate(${backAz} 0 -.7)">N</text></g>`);
    const sx = vx + 0.6, sy = vy + vh - 0.5;
    out.push(`<g><rect x="${f2(sx)}" y="${f2(sy - 0.08)}" width="1" height=".08" fill="var(--plan-ink,#24211D)"/><rect x="${f2(sx + 1)}" y="${f2(sy - 0.08)}" width="1" height=".08" fill="none" stroke="var(--plan-ink,#24211D)" stroke-width=".01"/><rect x="${f2(sx + 2)}" y="${f2(sy - 0.08)}" width="2" height=".08" fill="var(--plan-ink,#24211D)"/><text class="pl-sub" x="${f2(sx)}" y="${f2(sy - 0.16)}" font-size=".18">0</text><text class="pl-sub" x="${f2(sx + 2)}" y="${f2(sy - 0.16)}" font-size=".18">2</text><text class="pl-sub" x="${f2(sx + 4)}" y="${f2(sy - 0.16)}" font-size=".18">4 m</text></g>`);
    if (title) out.push(`<text class="pl-title" x="${f2(vx + 0.6)}" y="${f2(vy + 0.9)}" font-size=".5">${level === 0 ? 'Ground Floor' : `Level ${level}`}</text><text class="pl-sub" x="${f2(vx + 0.6)}" y="${f2(vy + 1.3)}" font-size=".2" text-anchor="start" style="text-anchor:start">${f.rooms.filter((r) => r.type !== 'hall').length} spaces · ${Math.round(f.rooms.reduce((s2, r) => s2 + r.w * r.h, 0))} m² · FFL +${(level * d.H).toFixed(2)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** Small multi-level thumbnail used on the option cards. */
export function renderThumb(d) {
  const gap = 1.6;
  const prot = d.site?.prot || 0;
  const W = d.W * d.nFloors + gap * (d.nFloors - 1);
  const vb = `-0.6 ${f2(-d.D - 0.6)} ${f2(W + 1.2)} ${f2(d.D + prot + 1.2)}`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="thumb-svg" preserveAspectRatio="xMidYMid meet"><defs><style>${PLAN_STYLE}</style><pattern id="deck" width=".3" height=".3" patternUnits="userSpaceOnUse"><rect width=".3" height=".3" fill="var(--plan-patio,#EDE6D8)"/></pattern></defs>`];
  d.floors.forEach((f, k) => {
    const ox = k * (d.W + gap);
    out.push(`<g transform="translate(${f2(ox)} 0)">`);
    for (const r of [...f.terraces, ...f.rooms]) out.push(`<rect class="pl-room ${zoneOf(r)}" x="${f2(r.x)}" y="${f2(-(r.y + r.h))}" width="${f2(r.w)}" height="${f2(r.h)}"/>`);
    const p = [];
    for (const w of f.walls) {
      if (w.type === 'open') continue;
      const t = w.type === 'ext' ? 0.3 : 0.14;
      p.push(w.axis === 'h' ? `M${f2(w.s - t / 2)} ${f2(-w.c - t / 2)}h${f2(w.e - w.s + t)}v${f2(t)}h${f2(-(w.e - w.s + t))}z` : `M${f2(w.c - t / 2)} ${f2(-w.e - t / 2)}h${f2(t)}v${f2(w.e - w.s + t)}h${f2(-t)}z`);
    }
    out.push(`<path class="pl-wall" d="${p.join('')}"/></g>`);
  });
  out.push('</svg>');
  return out.join('');
}

function openingSVG(o, Y) {
  const ext = !o.a || !o.b;
  const t = ext ? T_EXT : T_INT;
  const L = o.e - o.s;
  const P = (along, off) => (o.axis === 'h' ? [along, Y(o.c + off)] : [o.c + off, Y(along)]);
  const rectPath = (a0, a1, o0, o1) => { const p1 = P(a0, o0), p2 = P(a1, o0), p3 = P(a1, o1), p4 = P(a0, o1); return `M${f2(p1[0])} ${f2(p1[1])}L${f2(p2[0])} ${f2(p2[1])}L${f2(p3[0])} ${f2(p3[1])}L${f2(p4[0])} ${f2(p4[1])}Z`; };
  const line = (a0, o0, a1, o1) => { const p1 = P(a0, o0), p2 = P(a1, o1); return `M${f2(p1[0])} ${f2(p1[1])}L${f2(p2[0])} ${f2(p2[1])}`; };
  if (o.kind === 'window') {
    return `<path class="pl-glass" d="${rectPath(o.s, o.e, -t / 2, t / 2)}"/><path class="pl-hair" d="${line(o.s, -0.025, o.e, -0.025)}${line(o.s, 0.025, o.e, 0.025)}"/>`;
  }
  if (o.kind === 'garage') return `<path class="pl-open" d="${line(o.s, 0, o.e, 0)}"/><path class="pl-hair" d="${line(o.s, -t / 2, o.s, t / 2)}${line(o.e, -t / 2, o.e, t / 2)}"/>`;
  if (o.kind === 'slide') {
    const h = L / 2 + 0.05;
    return `<path class="pl-glass" d="${rectPath(o.s, o.s + h, -0.05, 0.0)}"/><path class="pl-glass" d="${rectPath(o.e - h, o.e, 0.0, 0.05)}"/><path class="pl-hair" d="${line(o.s, -t / 2, o.s, t / 2)}${line(o.e, -t / 2, o.e, t / 2)}"/>`;
  }
  // swing doors
  const intoA = o.into ? o.into === o.a : !o.a ? false : true;
  let n = intoA ? -1 : 1; // plan offset direction into the room
  if (o.kind === 'front') n = !o.a ? 1 : -1; // swing inward
  const leaves = o.kind === 'double' ? [[o.s, L / 2, 1], [o.e, L / 2, -1]] : [[o.hinge === 'e' ? o.e : o.s, L, o.hinge === 'e' ? -1 : 1]];
  let svg = '';
  for (const [h, w, dir] of leaves) {
    const hinge = P(h, 0), tip = P(h, n * w), other = P(h + dir * w, 0);
    const cross = (tip[0] - hinge[0]) * (other[1] - hinge[1]) - (tip[1] - hinge[1]) * (other[0] - hinge[0]);
    svg += `<path class="pl-leaf" d="M${f2(hinge[0])} ${f2(hinge[1])}L${f2(tip[0])} ${f2(tip[1])}"/>`;
    svg += `<path class="pl-swing" d="M${f2(tip[0])} ${f2(tip[1])}A${f2(w)} ${f2(w)} 0 0 ${cross > 0 ? 1 : 0} ${f2(other[0])} ${f2(other[1])}"/>`;
  }
  return svg;
}

function stairSVG(d, st, level, Y, thumb) {
  const H = d.H, n = Math.ceil(H / 0.18), n1 = Math.ceil(n / 2), n2 = n - n1;
  const yStart = st.y + st.h - 0.05;
  const t = Math.min(0.27, (st.h - 0.05 - 0.12 - 1.0) / (n1 - 1));
  const yL = yStart - (n1 - 1) * t;
  const x1a = st.x + 0.08, x1b = st.x + 1.25, x2a = st.x + 1.35, x2b = st.x + st.w - 0.08;
  const out = [];
  out.push(`<rect class="pl-stair" x="${f2(x1a)}" y="${f2(Y(yStart))}" width="${f2(x1b - x1a)}" height="${f2(yStart - yL)}"/>`);
  out.push(`<rect class="pl-stair" x="${f2(x2a)}" y="${f2(Y(yStart))}" width="${f2(x2b - x2a)}" height="${f2(yStart - yL)}"/>`);
  out.push(`<rect class="pl-stair" x="${f2(x1a)}" y="${f2(Y(yL))}" width="${f2(x2b - x1a)}" height="${f2(yL - st.y - 0.12)}"/>`);
  out.push(`<rect class="pl-wall int" x="${f2(st.x + 1.25)}" y="${f2(Y(yStart))}" width=".1" height="${f2(yStart - yL)}"/>`);
  if (thumb) return out.join('');
  const p = [];
  for (let i = 1; i < n1; i++) p.push(`M${f2(x1a)} ${f2(Y(yStart - i * t))}H${f2(x1b)}`);
  for (let j = 1; j < n2; j++) p.push(`M${f2(x2a)} ${f2(Y(yL + j * t))}H${f2(x2b)}`);
  out.push(`<path class="pl-hair" d="${p.join('')}"/>`);
  const top = level === d.nFloors - 1;
  const mx1 = (x1a + x1b) / 2, mx2 = (x2a + x2b) / 2, ym = (st.y + 0.12 + yL) / 2;
  if (!top) {
    out.push(`<path class="pl-arrow" d="M${f2(mx1)} ${f2(Y(yStart - 0.1))}V${f2(Y(ym))}H${f2(mx2)}V${f2(Y(yStart - t * 1.5))}"/><path class="pl-arrowh" d="M${f2(mx2 - 0.1)} ${f2(Y(yStart - t * 1.5))}L${f2(mx2)} ${f2(Y(yStart - t * 0.8))}L${f2(mx2 + 0.1)} ${f2(Y(yStart - t * 1.5))}Z"/>`);
    out.push(`<text class="pl-sub" x="${f2(mx1)}" y="${f2(Y(yStart - 0.32))}" font-size=".16">UP</text>`);
    // cut line across flight 2
    out.push(`<path class="pl-thin" d="M${f2(x2a)} ${f2(Y(yL + t * (n2 * 0.55)))}L${f2(x2b)} ${f2(Y(yL + t * (n2 * 0.55) + 0.45))}"/>`);
  }
  if (level > 0) out.push(`<text class="pl-sub" x="${f2(mx2)}" y="${f2(Y(yStart - 0.32))}" font-size=".16">DN</text>`);
  return out.join('');
}

function dimsSVG(d, f, Y, prot, patio, balc) {
  const out = [];
  const tick = (x, y) => `M${f2(x - 0.08)} ${f2(y + 0.08)}L${f2(x + 0.08)} ${f2(y - 0.08)}`;
  const hChain = (xs, y, fs = 0.17, extY = null) => {
    const p = [`M${f2(xs[0])} ${f2(y)}H${f2(xs[xs.length - 1])}`];
    xs.forEach((x) => { p.push(tick(x, y)); if (extY != null) p.push(`M${f2(x)} ${f2(extY)}V${f2(y + (extY > y ? 0.12 : -0.12))}`); });
    out.push(`<path class="pl-dim" d="${p.join('')}"/>`);
    for (let i = 0; i < xs.length - 1; i++) {
      const L = xs[i + 1] - xs[i];
      if (L < 0.7) continue;
      out.push(`<text class="pl-dimt" x="${f2((xs[i] + xs[i + 1]) / 2)}" y="${f2(y - 0.07)}" font-size="${fs}">${L.toFixed(2)}</text>`);
    }
  };
  const vChain = (ys, x, fs = 0.17) => {
    const p = [`M${f2(x)} ${f2(Y(ys[0]))}V${f2(Y(ys[ys.length - 1]))}`];
    ys.forEach((y) => p.push(`M${f2(x - 0.08)} ${f2(Y(y) + 0.08)}L${f2(x + 0.08)} ${f2(Y(y) - 0.08)}`));
    out.push(`<path class="pl-dim" d="${p.join('')}"/>`);
    for (let i = 0; i < ys.length - 1; i++) {
      const L = ys[i + 1] - ys[i]; if (L < 0.7) continue;
      const cy = Y((ys[i] + ys[i + 1]) / 2);
      out.push(`<text class="pl-dimt" x="${f2(x - 0.1)}" y="${f2(cy)}" font-size="${fs}" transform="rotate(-90 ${f2(x - 0.1)} ${f2(cy)})">${L.toFixed(2)}</text>`);
    }
  };
  const uniq = (a) => [...new Set(a.map((v) => Math.round(v * 100) / 100))].sort((p, q) => p - q);
  const enc = f.rooms.filter((r) => r.type !== 'hall');
  const front = uniq(enc.filter((r) => r.band === 'front').flatMap((r) => [r.x, r.x + r.w]));
  const back = uniq(enc.filter((r) => r.band === 'back').flatMap((r) => [r.x, r.x + r.w]));
  const yb = Y(-prot) + 0.7, yb2 = yb + 0.55;
  if (front.length > 1) hChain(front, yb);
  hChain([0, d.W], yb2, 0.2);
  const topY = Y(d.D + Math.max(patio ? patio.h : 0, balc)) - 0.7;
  if (back.length > 1) hChain(back, topY);
  vChain(uniq([-prot, 0, d.dF, d.dF + 1.2, d.D]).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.01), d.W + 0.7);
  vChain([-prot, d.D], d.W + 1.25, 0.2);
  return out.join('');
}

// ── furniture symbols (local frame: width a, depth b, back at top) ──
function symbol(it, Y) {
  const a = it.back === 'N' || it.back === 'S' ? it.w : it.h;
  const b = it.back === 'N' || it.back === 'S' ? it.h : it.w;
  const cx = it.x + it.w / 2, cy = Y(it.y + it.h / 2);
  const body = SYM[it.t] ? SYM[it.t](a, b, it) : `<rect class="pl-furn" x="${f2(-a / 2)}" y="${f2(-b / 2)}" width="${f2(a)}" height="${f2(b)}"/>`;
  return `<g transform="translate(${f2(cx)} ${f2(cy)}) rotate(${ROT[it.back] || 0})">${body}</g>`;
}
const R = (x, y, w, h, cls = 'pl-furn', rx = 0) => `<rect class="${cls}" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"${rx ? ` rx="${f2(rx)}"` : ''}/>`;
const Cc = (x, y, r, cls = 'pl-furn') => `<circle class="${cls}" cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}"/>`;
const E = (x, y, rx, ry, cls = 'pl-furn') => `<ellipse class="${cls}" cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}"/>`;
const Ln = (pts, cls = 'pl-furn-l') => `<path class="${cls}" d="${pts}"/>`;
const SYM = {
  bed: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.04) + R(-a / 2 + 0.08, -b / 2 + 0.1, a / 2 - 0.12, 0.3, 'pl-furn', 0.06) + R(0.04, -b / 2 + 0.1, a / 2 - 0.12, 0.3, 'pl-furn', 0.06) + Ln(`M${f2(-a / 2)} ${f2(-b / 2 + 0.55)}H${f2(a / 2)}M${f2(-a / 2)} ${f2(-b / 2 + 0.55)}L${f2(a / 2 - 0.3)} ${f2(-b / 2 + 0.85)}`),
  nightstand: (a, b) => R(-a / 2, -b / 2, a, b) + Cc(0, 0, Math.min(a, b) * 0.25, 'pl-furn-l'),
  wardrobe: (a, b, it) => R(-a / 2, -b / 2, a, b) + (it.open ? Ln(`M${f2(-a / 2 + 0.05)} 0H${f2(a / 2 - 0.05)}`) + Array.from({ length: Math.floor(a / 0.15) }, (_, i) => Ln(`M${f2(-a / 2 + 0.1 + i * 0.15)} ${f2(-b * 0.3)}V${f2(b * 0.3)}`)).join('') : Ln(`M${f2(-a / 2)} ${f2(-b / 2)}L${f2(a / 2)} ${f2(b / 2)}`)),
  sofa: (a, b) => {
    const n = Math.max(1, Math.round((a - 0.4) / 0.85));
    let s = R(-a / 2, -b / 2, a, b, 'pl-furn', 0.08) + R(-a / 2 + 0.18, -b / 2 + 0.22, a - 0.36, b - 0.26, 'pl-furn', 0.04);
    for (let i = 1; i < n; i++) s += Ln(`M${f2(-a / 2 + 0.18 + ((a - 0.36) / n) * i)} ${f2(-b / 2 + 0.22)}V${f2(b / 2 - 0.04)}`);
    return s;
  },
  armchair: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.08) + R(-a / 2 + 0.12, -b / 2 + 0.18, a - 0.24, b - 0.22, 'pl-furn', 0.04),
  coffee: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.06),
  tvunit: (a, b) => R(-a / 2, -b / 2, a, b) + R(-Math.min(a - 0.2, 1.65) / 2, -b / 2 + 0.06, Math.min(a - 0.2, 1.65), 0.05, 'pl-furn-f'),
  lamp: (a) => Cc(0, 0, a * 0.45) + Cc(0, 0, a * 0.12, 'pl-furn-f'),
  plant: (a) => Cc(0, 0, a * 0.45) + Ln(`M${f2(-a * 0.35)} 0H${f2(a * 0.35)}M0 ${f2(-a * 0.35)}V${f2(a * 0.35)}M${f2(-a * 0.25)} ${f2(-a * 0.25)}L${f2(a * 0.25)} ${f2(a * 0.25)}M${f2(a * 0.25)} ${f2(-a * 0.25)}L${f2(-a * 0.25)} ${f2(a * 0.25)}`),
  rug: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-rug') + R(-a / 2 + 0.08, -b / 2 + 0.08, a - 0.16, b - 0.16, 'pl-furn-l'),
  table: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.03),
  rtable: (a) => Cc(0, 0, a / 2),
  dchair: (a, b) => R(-a / 2 + 0.03, -b / 2 + 0.03, a - 0.06, b - 0.06, 'pl-furn', 0.05) + Ln(`M${f2(-a / 2 + 0.05)} ${f2(-b / 2 + 0.08)}H${f2(a / 2 - 0.05)}`),
  chair: (a, b) => Cc(0, 0.02, Math.min(a, b) * 0.4) + Ln(`M${f2(-a * 0.35)} ${f2(-b * 0.38)}H${f2(a * 0.35)}`),
  desk: (a, b) => R(-a / 2, -b / 2, a, b) + R(-0.28, -b / 2 + 0.08, 0.56, 0.04, 'pl-furn-f'),
  sideboard: (a, b) => R(-a / 2, -b / 2, a, b),
  console: (a, b) => R(-a / 2, -b / 2, a, b),
  bench: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.04),
  dresser: (a, b) => R(-a / 2, -b / 2, a, b),
  counter: (a, b, it) => {
    let s = R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} ${f2(b / 2 - 0.04)}H${f2(a / 2)}`);
    if (it.sink != null) { const x = (it.sink - 0.5) * a; s += R(x - 0.32, -b / 2 + 0.1, 0.3, 0.38, 'pl-furn', 0.05) + R(x + 0.02, -b / 2 + 0.1, 0.3, 0.38, 'pl-furn', 0.05); }
    if (it.hob != null) { const x = (it.hob - 0.5) * a; for (const [dx, dy, r] of [[-0.15, -0.1, 0.09], [0.15, -0.1, 0.07], [-0.15, 0.13, 0.07], [0.15, 0.13, 0.09]]) s += Cc(x + dx, dy, r, 'pl-furn-l'); }
    return s;
  },
  island: (a, b) => R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} ${f2(b / 2 - 0.25)}H${f2(a / 2)}`),
  stool: (a) => Cc(0, 0, a * 0.42),
  fridge: (a, b) => R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} ${f2(-b / 2)}L${f2(a / 2)} ${f2(b / 2)}M${f2(a / 2)} ${f2(-b / 2)}L${f2(-a / 2)} ${f2(b / 2)}`),
  tall: (a, b) => R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} ${f2(-b / 2)}L${f2(a / 2)} ${f2(b / 2)}`),
  toilet: (a, b) => R(-0.2, -b / 2, 0.4, 0.18, 'pl-furn', 0.03) + E(0, -b / 2 + 0.42, 0.19, 0.25),
  vanity: (a, b, it) => R(-a / 2, -b / 2, a, b) + (it.double ? E(-a / 4, 0, 0.17, 0.13) + E(a / 4, 0, 0.17, 0.13) : E(0, 0, 0.18, 0.14)),
  basin: (a, b) => E(0, 0, a * 0.4, b * 0.4),
  tub: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.06) + R(-a / 2 + 0.07, -b / 2 + 0.07, a - 0.14, b - 0.14, 'pl-furn', Math.min(a, b) * 0.2) + Cc(0, -b / 2 + 0.2, 0.03, 'pl-furn-l'),
  shower: (a, b) => R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} ${f2(-b / 2)}L${f2(a / 2)} ${f2(b / 2)}M${f2(a / 2)} ${f2(-b / 2)}L${f2(-a / 2)} ${f2(b / 2)}`) + Cc(0, 0, 0.04),
  shelf: (a, b) => R(-a / 2, -b / 2, a, b) + Ln(`M${f2(-a / 2)} 0H${f2(a / 2)}`),
  washer: (a, b) => R(-a / 2 + 0.01, -b / 2 + 0.01, a - 0.02, b - 0.02) + Cc(0, 0.04, Math.min(a, b) * 0.3, 'pl-furn-l'),
  car: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.35) + R(-a / 2 + 0.15, -b * 0.18, a - 0.3, b * 0.42, 'pl-furn-l', 0.15) + Ln(`M${f2(-a / 2 + 0.2)} ${f2(-b * 0.18 + 0.05)}Q0 ${f2(-b * 0.28)} ${f2(a / 2 - 0.2)} ${f2(-b * 0.18 + 0.05)}`),
  treadmill: (a, b) => R(-a * 0.4, -b / 2, a * 0.8, b, 'pl-furn', 0.05) + R(-a * 0.3, -b / 2 + 0.25, a * 0.6, b - 0.35, 'pl-furn-l'),
  mat: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-rug', 0.05),
  mirror: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn-f'),
  rack: (a, b) => R(-a / 2, -b / 2, a, b) + [0, 1, 2, 3].map((i) => Cc(-a / 2 + 0.2 + i * (a - 0.4) / 3, 0, 0.05, 'pl-furn-l')).join(''),
  screen: (a, b) => R(-Math.min(a, 3) / 2, -b / 2, Math.min(a, 3), b, 'pl-furn-f'),
  lounger: (a, b) => R(-a / 2, -b / 2, a, b, 'pl-furn', 0.06) + Ln(`M${f2(-a / 2)} ${f2(-b / 2 + b * 0.32)}H${f2(a / 2)}`),
  otable: (a, b, it) => (it.round ? Cc(0, 0, a / 2) : R(-a / 2, -b / 2, a, b)) + (it.chairs ? Array.from({ length: it.chairs }, (_, i) => { const side = i % 2 ? 1 : -1, along = (Math.floor(i / 2) + 0.5) / Math.ceil(it.chairs / 2) - 0.5; return a >= b ? R(along * a - 0.22, side * (b / 2 + 0.3) - 0.22, 0.44, 0.44, 'pl-furn', 0.05) : R(side * (a / 2 + 0.3) - 0.22, along * b - 0.22, 0.44, 0.44, 'pl-furn', 0.05); }).join('') : ''),
  planter: (a, b) => R(-a / 2, -b / 2, a, b) + Cc(0, 0, Math.min(a, b) * 0.32, 'pl-furn-l'),
};

/**
 * Site plan: the lot (drawn on the map or typed in), the house footprint, driveway, path,
 * patio and pool, the street, the edge lengths of a drawn lot, and a north arrow.
 */
export function renderSitePlan(d) {
  const s = d.site, b = d.brief, Y = (y) => -y;
  const lot = s.lot;
  const xs = lot.map((p) => p[0]), ys = lot.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const fs = Math.max(0.6, span / 34);
  const streetY = lot[s.front][1];
  const pad = fs * 2.2;
  const vx = Math.min(...xs) - pad, vx1 = Math.max(...xs) + pad * 2.4, vTop = Math.max(...ys) + pad, vBot = streetY - fs * 5;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(Y(vTop))} ${f2(vx1 - vx)} ${f2(vTop - vBot)}" class="site-svg" role="img" aria-label="Site plan: the house on its ${Math.round(b.lot?.area ?? b.plotW * b.plotD)} m² lot">`];
  // street
  o.push(`<rect class="sp-road" x="${f2(vx)}" y="${f2(Y(streetY - fs * 0.4))}" width="${f2(vx1 - vx)}" height="${f2(fs * 4.6)}"/>`);
  o.push(`<text class="sp-label" x="${f2((vx + vx1) / 2)}" y="${f2(Y(streetY - fs * 2.9))}" font-size="${f2(fs)}" text-anchor="middle">Street</text>`);
  // lot, outdoor areas, house
  o.push(`<polygon class="sp-lot" points="${lot.map(([x, y]) => `${f2(x)},${f2(Y(y))}`).join(' ')}" stroke-width="${f2(fs * 0.12)}"/>`);
  for (const [r, cls] of [[s.driveway, 'sp-pave'], [s.path, 'sp-pave'], [s.patio, 'sp-pave'], [s.pool, 'sp-pool']]) {
    if (r) o.push(`<rect class="${cls}" x="${f2(r.x)}" y="${f2(Y(r.y + r.h))}" width="${f2(r.w)}" height="${f2(r.h)}"/>`);
  }
  for (const r of d.floors[0].rooms) o.push(`<rect class="sp-house" x="${f2(r.x)}" y="${f2(Y(r.y + r.h))}" width="${f2(r.w)}" height="${f2(r.h)}"/>`);
  // edge lengths of a drawn lot
  if (s.drawn) {
    const ccw = signedArea(lot) > 0;
    lot.forEach((p, i) => {
      const q = lot[(i + 1) % lot.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      if (len < fs * 3 || i === s.front) return;
      // just outside the edge, along its outward normal
      const nx = (ccw ? dy : -dy) / len, ny = (ccw ? -dx : dx) / len, k = fs * 0.9;
      o.push(`<text class="sp-dim" x="${f2((p[0] + q[0]) / 2 + nx * k)}" y="${f2(Y((p[1] + q[1]) / 2 + ny * k) + fs * 0.3)}" font-size="${f2(fs * 0.85)}" stroke-width="${f2(fs * 0.22)}" text-anchor="middle">${len.toFixed(1)} m</text>`);
    });
    const fp = lot[s.front], fq = lot[(s.front + 1) % lot.length];
    o.push(`<text class="sp-dim" x="${f2((fp[0] + fq[0]) / 2)}" y="${f2(Y(streetY) + fs * 1.3)}" font-size="${f2(fs * 0.85)}" stroke-width="${f2(fs * 0.22)}" text-anchor="middle">${Math.hypot(fq[0] - fp[0], fq[1] - fp[1]).toFixed(1)} m frontage</text>`);
  }
  // north arrow: screen-up points into the lot, away from the street
  const up = ((b.lot?.bearing ?? AZ[b.street]) + 180) % 360;
  const ax = vx1 - fs * 2.4, ay = Y(vTop) + fs * 2.6;
  o.push(`<g transform="translate(${f2(ax)} ${f2(ay)}) rotate(${-up})"><circle r="${f2(fs * 1.1)}" class="sp-n-ring" stroke-width="${f2(fs * 0.08)}"/><path d="M0 ${f2(-fs * 0.9)}L${f2(fs * 0.45)} ${f2(fs * 0.5)}L0 ${f2(fs * 0.2)}L${f2(-fs * 0.45)} ${f2(fs * 0.5)}Z" class="sp-n"/>`
    + `<g transform="translate(0 ${f2(-fs * 1.8)}) rotate(${up})"><text class="sp-label" font-size="${f2(fs * 0.85)}" text-anchor="middle" dy="0.35em">N</text></g></g>`);
  o.push('</svg>');
  return o.join('');
}
