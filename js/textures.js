// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Procedural canvas textures (no external assets)
//  Every texture maps 1 UV unit = 1 metre; `size` is the metre span
//  of one tile so repeat = 1/size.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function noise(ctx, S, amt, rand, scale = 1) {
  const img = ctx.getImageData(0, 0, S, S); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amt * 255 * scale;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function blotches(ctx, S, color, rand, count, rMax, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rand() * S, y = rand() * S, r = rand() * rMax + 4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${alpha})`));
    g.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0)'));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const PAINTERS = {
  render(ctx, S, c, rand) { ctx.fillStyle = c; ctx.fillRect(0, 0, S, S); blotches(ctx, S, shade(c, -0.04), rand, 40, 90, 0.12); noise(ctx, S, 0.012, rand); return 3; },
  stucco(ctx, S, c, rand) { ctx.fillStyle = c; ctx.fillRect(0, 0, S, S); blotches(ctx, S, shade(c, -0.1), rand, 120, 50, 0.22); blotches(ctx, S, shade(c, 0.1), rand, 80, 40, 0.2); noise(ctx, S, 0.07, rand); return 2; },
  membrane(ctx, S, c, rand) { ctx.fillStyle = c; ctx.fillRect(0, 0, S, S); noise(ctx, S, 0.12, rand); return 2; },
  concrete(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, shade(c, -0.12), rand, 90, 70, 0.16); blotches(ctx, S, shade(c, 0.12), rand, 50, 50, 0.12);
    noise(ctx, S, 0.06, rand);
    ctx.strokeStyle = shade(c, -0.18); ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
    return 2.4;
  },
  boards(ctx, S, c, rand) { // vertical cladding
    const n = 8, bw = S / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(c, (rand() - 0.5) * 0.18); ctx.fillRect(i * bw, 0, bw, S);
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = shade(c, -0.12 - rand() * 0.1); ctx.globalAlpha = 0.35; ctx.lineWidth = 1; const x = i * bw + rand() * bw; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 3, S * 0.3, x - 3, S * 0.6, x + 2, S); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = shade(c, -0.45); ctx.fillRect(i * bw, 0, 3, S);
    }
    noise(ctx, S, 0.04, rand); return 1.2;
  },
  siding(ctx, S, c, rand) { // horizontal lap siding
    const n = 6, bh = S / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = shade(c, (rand() - 0.5) * 0.05); ctx.fillRect(0, i * bh, S, bh);
      const g = ctx.createLinearGradient(0, i * bh + bh - 10, 0, i * bh + bh);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g; ctx.fillRect(0, i * bh + bh - 10, S, 10);
    }
    noise(ctx, S, 0.03, rand); return 1.2;
  },
  brick(ctx, S, c, rand) {
    ctx.fillStyle = '#B9B2A6'; ctx.fillRect(0, 0, S, S);
    const rows = 14, cols = 4.5, bh = S / rows, bw = S / cols, m = 3;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let k = -1; k < cols + 1; k++) {
        ctx.fillStyle = shade(c, (rand() - 0.5) * 0.35);
        ctx.fillRect(k * bw + off + m / 2, r * bh + m / 2, bw - m, bh - m);
      }
    }
    noise(ctx, S, 0.08, rand); return 1;
  },
  stone(ctx, S, c, rand) {
    ctx.fillStyle = shade(c, -0.35); ctx.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 40 + rand() * 50; let x = -rand() * 60;
      while (x < S) { const w = 60 + rand() * 110; ctx.fillStyle = shade(c, (rand() - 0.5) * 0.3); ctx.fillRect(x + 3, y + 3, w - 6, h - 6); x += w; }
      y += h;
    }
    noise(ctx, S, 0.1, rand); return 1.5;
  },
  seam(ctx, S, c, rand) { // standing-seam metal
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    const n = 4, w = S / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * w, 0, i * w + w, 0);
      g.addColorStop(0, shade(c, 0.08)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, -0.08));
      ctx.fillStyle = g; ctx.fillRect(i * w, 0, w, S);
      ctx.fillStyle = shade(c, 0.25); ctx.fillRect(i * w, 0, 3, S);
      ctx.fillStyle = shade(c, -0.35); ctx.fillRect(i * w + 3, 0, 2, S);
    }
    noise(ctx, S, 0.025, rand); return 2;
  },
  clay(ctx, S, c, rand) { // barrel tiles
    const rows = 6, cols = 5, rh = S / rows, cw = S / cols;
    ctx.fillStyle = shade(c, -0.4); ctx.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = k * cw, y = r * rh;
      const g = ctx.createLinearGradient(x, 0, x + cw, 0);
      const base = shade(c, (rand() - 0.5) * 0.25);
      g.addColorStop(0, shade(c, -0.3)); g.addColorStop(0.5, base); g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g; ctx.fillRect(x + 1, y, cw - 2, rh - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + rh - 5, cw, 5);
    }
    noise(ctx, S, 0.05, rand); return 1;
  },
  shingle(ctx, S, c, rand) {
    const rows = 8, rh = S / rows;
    ctx.fillStyle = shade(c, -0.4); ctx.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      let x = -(r % 2) * 30;
      while (x < S) { const w = 40 + rand() * 40; ctx.fillStyle = shade(c, (rand() - 0.5) * 0.25); ctx.fillRect(x + 2, r * rh, w - 3, rh - 3); x += w; }
    }
    noise(ctx, S, 0.06, rand); return 1;
  },
  boardform(ctx, S, c, rand) { // board-formed concrete: horizontal board imprints, butt joints, tie holes
    const n = 8, bh = S / n;
    for (let i = 0; i < n; i++) {
      const y0 = i * bh;
      ctx.fillStyle = shade(c, (rand() - 0.5) * 0.09); ctx.fillRect(0, y0, S, bh);
      ctx.lineWidth = 1;
      for (let k = 0; k < 9; k++) {
        const y = y0 + 3 + rand() * (bh - 6);
        ctx.strokeStyle = shade(c, rand() > 0.5 ? -0.16 : 0.08); ctx.globalAlpha = 0.22 + rand() * 0.2;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(S * 0.3, y + (rand() - 0.5) * 6, S * 0.7, y + (rand() - 0.5) * 6, S, y + (rand() - 0.5) * 3); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(c, -0.26); ctx.fillRect(0, y0, S, 1.6);
      ctx.fillStyle = shade(c, 0.07); ctx.fillRect(0, y0 + 1.6, S, 1);
      for (let j = 0; j < 2; j++) { ctx.fillStyle = shade(c, -0.2); ctx.fillRect(rand() * S, y0, 1.3, bh); }
    }
    blotches(ctx, S, shade(c, -0.1), rand, 46, 70, 0.12);
    blotches(ctx, S, shade(c, 0.08), rand, 30, 50, 0.1);
    for (let x = S / 8; x < S; x += S / 4) for (let y = S / 4; y < S; y += S / 2) {
      ctx.fillStyle = shade(c, 0.1); ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.fillStyle = shade(c, -0.45); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    }
    noise(ctx, S, 0.05, rand);
    return 2.4;
  },
  panel(ctx, S, c, rand) { // large-format rainscreen panels (1.2 × 2.4 m), open joints, corner fixings
    const cols = 2, pw = S / cols;
    for (let i = 0; i < cols; i++) {
      const tone = (rand() - 0.5) * 0.06;
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, shade(c, tone + 0.04)); g.addColorStop(1, shade(c, tone - 0.04));
      ctx.fillStyle = g; ctx.fillRect(i * pw, 0, pw, S);
    }
    noise(ctx, S, 0.018, rand);
    ctx.fillStyle = shade(c, -0.6);
    for (let i = 0; i <= cols; i++) ctx.fillRect(i * pw - 2.5, 0, 5, S);
    ctx.fillRect(0, 0, S, 3); ctx.fillRect(0, S - 3, S, 3);
    ctx.fillStyle = shade(c, 0.18);
    for (let i = 0; i < cols; i++) for (const fx of [0.12, 0.88]) for (const fy of [0.05, 0.5, 0.95]) { ctx.beginPath(); ctx.arc(i * pw + pw * fx, S * fy, 2.2, 0, 7); ctx.fill(); }
    return 2.4;
  },
  battens(ctx, S, c, rand) { // vertical timber battens over a dark shadow gap
    ctx.fillStyle = shade(c, -0.74); ctx.fillRect(0, 0, S, S);
    const n = 10, bw = S / n;
    for (let i = 0; i < n; i++) {
      const x = i * bw + bw * 0.16, w = bw * 0.68;
      ctx.fillStyle = shade(c, (rand() - 0.5) * 0.2); ctx.fillRect(x, 0, w, S);
      ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = shade(c, -0.2 - rand() * 0.15); const gx = x + rand() * w; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + 2, S * 0.35, gx - 2, S * 0.65, gx + 1, S); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(c, 0.12); ctx.fillRect(x, 0, 1.5, S);
      ctx.fillStyle = shade(c, -0.3); ctx.fillRect(x + w - 2, 0, 2, S);
    }
    noise(ctx, S, 0.03, rand);
    return 1.0;
  },
  wideoak(ctx, S, c, rand) { planks(ctx, S, c, rand, 6, 0, false, { long: true, vari: 0.13 }); return 2.4; },
  porcelain(ctx, S, c, rand) { // large-format 60 × 120 cm tiles with faint veining
    ctx.fillStyle = shade(c, -0.18); ctx.fillRect(0, 0, S, S);
    const cols = 2, tw = S / cols;
    for (let i = 0; i < cols; i++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.05); ctx.fillRect(i * tw + 1.5, 1.5, tw - 3, S - 3); }
    ctx.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = shade(c, rand() > 0.5 ? -0.12 : 0.14); ctx.globalAlpha = 0.18 + rand() * 0.15;
      const x = rand() * S, y = rand() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + (rand() - 0.5) * S * 0.6, y + rand() * S * 0.3, x + (rand() - 0.5) * S * 0.6, y + rand() * S * 0.6, x + (rand() - 0.5) * S * 0.4, y + S * 0.7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noise(ctx, S, 0.015, rand);
    return 1.2;
  },
  oak(ctx, S, c, rand) { return planks(ctx, S, c, rand, 7, 0.16); },
  teak(ctx, S, c, rand) { return planks(ctx, S, c, rand, 6, 0.22); },
  deck(ctx, S, c, rand) { return planks(ctx, S, c, rand, 9, 0.2, true); },
  tile(ctx, S, c, rand) {
    const n = 2, w = S / n;
    ctx.fillStyle = shade(c, -0.25); ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.06); ctx.fillRect(i * w + 2, j * w + 2, w - 4, w - 4); }
    blotches(ctx, S, shade(c, -0.05), rand, 30, 50, 0.12); noise(ctx, S, 0.03, rand); return 1.2;
  },
  walltile(ctx, S, c, rand) {
    const cols = 4, rows = 8, w = S / cols, h = S / rows;
    ctx.fillStyle = shade(c, -0.18); ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.05); ctx.fillRect(i * w + 1.5, j * h + 1.5, w - 3, h - 3); }
    return 1;
  },
  terracotta(ctx, S, c, rand) {
    const n = 4, w = S / n;
    ctx.fillStyle = '#d8cbb6'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.25); ctx.fillRect(i * w + 3, j * w + 3, w - 6, w - 6); }
    noise(ctx, S, 0.08, rand); return 1.2;
  },
  grass(ctx, S, c, rand) {
    ctx.fillStyle = shade(c, -0.12); ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, shade(c, -0.25), rand, 260, S * 0.06, 0.22);
    blotches(ctx, S, shade(c, 0.12), rand, 220, S * 0.05, 0.2);
    // short blades seen from above: thousands of thin strokes
    for (let i = 0; i < 26000; i++) {
      const x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2, l = 2 + rand() * 5;
      const k = rand();
      ctx.strokeStyle = k < 0.08 ? shade('#B8B26A', (rand() - 0.5) * 0.2) : shade(c, (rand() - 0.45) * 0.55);
      ctx.globalAlpha = 0.55 + rand() * 0.45; ctx.lineWidth = 0.8 + rand() * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 260; i++) { ctx.fillStyle = shade('#3F6B2E', (rand() - 0.5) * 0.3); ctx.beginPath(); ctx.arc(rand() * S, rand() * S, 1 + rand() * 2, 0, 7); ctx.fill(); }
    return 2.6;
  },
  hedge(ctx, S, c, rand) {
    ctx.fillStyle = shade(c, -0.55); ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2, r = 3 + rand() * 4;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = shade(c, (rand() - 0.55) * 0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    return 1.1;
  },
  mulch(ctx, S, c, rand) {
    ctx.fillStyle = shade(c, -0.3); ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 7000; i++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.7); ctx.save(); ctx.translate(rand() * S, rand() * S); ctx.rotate(rand() * 6.3); ctx.fillRect(-3 - rand() * 4, -1, 6 + rand() * 8, 2 + rand() * 2); ctx.restore(); }
    return 1.2;
  },
  bark(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 180; i++) {
      let x = rand() * S; ctx.strokeStyle = shade(c, -0.45 - rand() * 0.25); ctx.lineWidth = 1.5 + rand() * 3.5; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 0; y <= S; y += 16) { x += (rand() - 0.5) * 8; ctx.lineTo(x, y); } ctx.stroke();
    }
    ctx.globalAlpha = 1; noise(ctx, S, 0.08, rand); return 0.8;
  },
  birch(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) { ctx.fillStyle = shade('#2b2622', rand() * 0.3); ctx.globalAlpha = 0.5 + rand() * 0.5; ctx.fillRect(rand() * S, rand() * S, 8 + rand() * 30, 2 + rand() * 4); }
    for (let i = 0; i < 18; i++) { ctx.fillStyle = '#3a332c'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(rand() * S, rand() * S, 6 + rand() * 14, 4 + rand() * 8, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; noise(ctx, S, 0.05, rand); return 0.8;
  },
  palmbark(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 22) { ctx.fillStyle = shade(c, -0.35); ctx.fillRect(0, y, S, 4 + rand() * 3); ctx.fillStyle = shade(c, 0.12); ctx.fillRect(0, y + 6, S, 3); }
    noise(ctx, S, 0.1, rand); return 0.6;
  },
  paving(ctx, S, c, rand) {
    ctx.fillStyle = shade(c, -0.2); ctx.fillRect(0, 0, S, S);
    const rows = 4, rh = S / rows;
    for (let r = 0; r < rows; r++) { const off = (r % 2) * S / 4; for (let k = -1; k < 3; k++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.12); ctx.fillRect(k * S / 2 + off + 2, r * rh + 2, S / 2 - 4, rh - 4); } }
    noise(ctx, S, 0.08, rand); return 1.6;
  },
  asphalt(ctx, S, c, rand) { ctx.fillStyle = c; ctx.fillRect(0, 0, S, S); noise(ctx, S, 0.18, rand); return 3; },
  gravel(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = shade(c, (rand() - 0.5) * 0.6); const r = rand() * 2.5 + 0.8; ctx.beginPath(); ctx.arc(rand() * S, rand() * S, r, 0, 7); ctx.fill(); }
    return 1.5;
  },
  garagedoor(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    const n = 5, h = S / n;
    for (let i = 0; i < n; i++) { ctx.fillStyle = shade(c, -0.25); ctx.fillRect(0, i * h, S, 3); ctx.fillStyle = shade(c, 0.12); ctx.fillRect(0, i * h + 3, S, 2); }
    noise(ctx, S, 0.02, rand); return 2.3;
  },
  fabric(ctx, S, c, rand) {
    ctx.fillStyle = c; ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < S; i += 3) { ctx.fillStyle = i % 6 ? '#000' : '#fff'; ctx.fillRect(i, 0, 1, S); ctx.fillRect(0, i, S, 1); }
    ctx.globalAlpha = 1; noise(ctx, S, 0.04, rand); return 0.5;
  },
};

function planks(ctx, S, c, rand, n, _w, deck = false, { long = false, vari = 0.22 } = {}) {
  const ph = S / n;
  for (let i = 0; i < n; i++) {
    let x = -rand() * S * 0.5;
    while (x < S) {
      const L = S * (long ? 0.9 + rand() * 0.8 : 0.45 + rand() * 0.6);
      ctx.fillStyle = shade(c, (rand() - 0.5) * vari);
      ctx.fillRect(x, i * ph, L, ph);
      ctx.globalAlpha = 0.18;
      for (let k = 0; k < 5; k++) { ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 1; const y = i * ph + rand() * ph; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + L * 0.3, y + 2, x + L * 0.6, y - 2, x + L, y + 1); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(c, -0.35); ctx.fillRect(x, i * ph, 1.5, ph);
      x += L;
    }
    ctx.fillStyle = shade(c, deck ? -0.55 : -0.3); ctx.fillRect(0, i * ph, S, deck ? 3 : 1.2);
  }
  noise(ctx, S, 0.03, rand);
  return 2;
}

export function tex(kind, color, { anisotropy = 8 } = {}) {
  const key = kind + color;
  if (cache.has(key)) return cache.get(key);
  const S = kind === 'grass' ? 1024 : 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const painter = PAINTERS[kind] || PAINTERS.render;
  const size = painter(ctx, S, color, rng(hashStr(key)));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.repeat.set(1 / size, 1 / size);
  t.userData.size = size;
  t.userData.kind = kind;
  cache.set(key, t);
  return t;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export { shade };

// ── foliage cards (alpha cut-outs) ───────────────────────────
const leafCache = new Map();
const LEAF = {
  broad:  { cols: ['#4C7A36', '#5F8C3E', '#3E6A2E', '#76A04A'], rx: [10, 15], ry: [5, 8], n: 150, twig: '#5A4A38' },
  small:  { cols: ['#7EA84C', '#94BA58', '#6A9640', '#A9C76A'], rx: [7, 10], ry: [4, 6], n: 230, twig: '#6B5B48' },
  olive:  { cols: ['#66754F', '#7A875F', '#566444', '#8A946D'], rx: [11, 15], ry: [3.5, 5], n: 420, twig: '#6E6458' },
  maple:  { cols: ['#B5462C', '#C9632F', '#9C3A26', '#D9873A'], rx: [9, 13], ry: [7, 10], n: 150, twig: '#4E3A2E' },
  tropic: { cols: ['#2F6B3A', '#3E7F45', '#245A30', '#4E9150'], rx: [16, 24], ry: [7, 10], n: 70, twig: '#4F4A32' },
  shrub:  { cols: ['#4E7440', '#5E8649', '#3F6236', '#6E9455'], rx: [7, 10], ry: [4, 6], n: 260, twig: '#4A3E30' },
  lavender: { cols: ['#7C76A8', '#8E86BC', '#6F8A5A', '#9AA87E'], rx: [5, 8], ry: [2, 3], n: 260, twig: '#5B6B4A' },
};
export function leafTex(kind) {
  if (leafCache.has(kind)) return leafCache.get(kind);
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'); const rand = rng(hashStr('leaf' + kind));
  if (kind === 'needle') {
    for (let b = 0; b < 9; b++) {
      const y0 = 18 + b * 26 + rand() * 10, x0 = 8 + rand() * 20, x1 = S - 10 - rand() * 30, sag = 10 + rand() * 18;
      const tone = (rand() - 0.4) * 0.4;
      for (let t = 0; t <= 1; t += 0.012) {
        const x = x0 + (x1 - x0) * t, y = y0 + t * t * sag;
        const L = 16 * (1 - t * 0.6);
        ctx.strokeStyle = shade('#4E7340', tone + (rand() - 0.5) * 0.3); ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L * 0.5, y - L); ctx.moveTo(x, y); ctx.lineTo(x + L * 0.5, y + L * 0.9); ctx.stroke();
      }
      ctx.strokeStyle = '#4A3A2A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 0.2, x1, y0 + sag); ctx.stroke();
    }
  } else if (kind === 'ograss') {
    // ornamental grass: arching blades from one clump, feathery seed heads
    for (let i = 0; i < 70; i++) {
      const x0 = S / 2 + (rand() - 0.5) * S * 0.18, ang = (rand() - 0.5) * 1.5, len = S * (0.55 + rand() * 0.38);
      const x1 = x0 + Math.sin(ang) * len, y1 = S - Math.cos(ang) * len * 0.95;
      ctx.strokeStyle = shade(['#8E9A5C', '#A7A56B', '#7D8C52', '#B9AE7A'][Math.floor(rand() * 4)], (rand() - 0.5) * 0.25);
      ctx.lineWidth = 1.6 + rand() * 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, S); ctx.quadraticCurveTo(x0 + Math.sin(ang) * len * 0.3, S - len * 0.7, x1, y1); ctx.stroke();
      if (rand() < 0.35) {
        ctx.fillStyle = shade('#D8CDA8', (rand() - 0.5) * 0.2); ctx.globalAlpha = 0.85;
        ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 6, 3, 13, 0, 0, 7); ctx.fill(); ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  } else if (kind === 'frond') {
    const cx = S / 2;
    for (let t = 0.04; t < 0.98; t += 0.022) {
      const y = S - t * S, L = Math.sin(t * Math.PI * 0.95) * S * 0.46;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = shade('#4A8A43', (rand() - 0.5) * 0.35);
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + sgn * L, y - L * 0.55); ctx.lineTo(cx + sgn * L * 0.96, y - L * 0.55 - 5); ctx.lineTo(cx, y - 6); ctx.fill();
      }
    }
    ctx.strokeStyle = '#7B6A3A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, S); ctx.lineTo(cx, 4); ctx.stroke();
  } else {
    const L = LEAF[kind] || LEAF.broad;
    ctx.strokeStyle = L.twig; ctx.lineWidth = 2.2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(S / 2, S * 0.96); ctx.quadraticCurveTo(S * (0.3 + rand() * 0.4), S * 0.6, S * (0.15 + rand() * 0.7), S * (0.12 + rand() * 0.4)); ctx.stroke(); }
    for (let i = 0; i < L.n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * S * 0.42;
      const x = S / 2 + Math.cos(a) * r, y = S * 0.47 + Math.sin(a) * r * 0.95;
      const rx = L.rx[0] + rand() * (L.rx[1] - L.rx[0]), ry = L.ry[0] + rand() * (L.ry[1] - L.ry[0]);
      const base = L.cols[Math.floor(rand() * L.cols.length)];
      const lit = ((S - y) / S) * 0.18 - 0.06;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rand() * Math.PI * 2);
      ctx.fillStyle = shade(base, lit + (rand() - 0.5) * 0.18);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = shade(base, -0.35); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-rx * 0.9, 0); ctx.lineTo(rx * 0.9, 0); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  // Dilate: give fully transparent pixels the average foliage colour so
  // mipmapping does not bleed black into thin leaves and needles.
  const img = ctx.getImageData(0, 0, S, S).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 200) { r += img[i]; g += img[i + 1]; b += img[i + 2]; n++; }
  n = Math.max(1, n); r /= n; g /= n; b /= n;
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const si = (y * S + x) * 4, di = ((S - 1 - y) * S + x) * 4; // flip rows so v=0 is the bottom, like CanvasTexture
    if (img[si + 3] < 12) { out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 0; }
    else { out[di] = img[si]; out[di + 1] = img[si + 1]; out[di + 2] = img[si + 2]; out[di + 3] = img[si + 3]; }
  }
  const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  leafCache.set(kind, t);
  return t;
}
