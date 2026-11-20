// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Real lots
//
//  buildLot()     turns corners drawn on a map (latitude, longitude)
//                 into a polygon in plot coordinates: metres, the
//                 street edge along y = 0, the lot on +y, x to the
//                 right seen from the street. It also reads the area,
//                 frontage, street bearing and hemisphere.
//  lotCapacity()  the buildable area inside the setbacks, on a fine
//                 grid, and the widest street-aligned rectangle that
//                 fits at every depth (a largest-rectangle-in-histogram
//                 sweep). Works for any lot shape, concave ones too.
// ─────────────────────────────────────────────────────────────
const R = 6371008.8, DEG = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

export function pointInPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Shortest distance from a point to the polygon boundary. */
export function distToBoundary(x, y, p) {
  let d = Infinity;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; d = Math.min(d, distToSeg(x, y, a[0], a[1], b[0], b[1])); }
  return d;
}

/** True when the rectangle lies inside the polygon (corners and edge midpoints inside, no polygon corner inside it). */
export function rectInPoly(x, y, w, h, p) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  if (!pts.every(([u, v]) => pointInPoly(u, v, p))) return false;
  return !p.some(([u, v]) => u > x + 1e-6 && u < x + w - 1e-6 && v > y + 1e-6 && v < y + h - 1e-6);
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
export function selfIntersects(p) {
  const n = p.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segsCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
  }
  return false;
}

/** Local east/north metres around the corners' mean position. */
export function localFrame(latlng) {
  const lat0 = latlng.reduce((s, q) => s + q[0], 0) / latlng.length;
  const lng0 = latlng.reduce((s, q) => s + q[1], 0) / latlng.length;
  const kx = DEG * R * Math.cos(lat0 * DEG), ky = DEG * R;
  return { lat0, lng0, to: ([la, ln]) => [(ln - lng0) * kx, (la - lat0) * ky] };
}

const COMPASS16 = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
export const compassName = (deg) => COMPASS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/**
 * Build a lot from map corners. `front` is the index of the edge (corner i → i+1) facing the street.
 * Returns { error } for an unusable drawing.
 */
export function buildLot(latlng, front = 0) {
  const n = latlng.length;
  if (n < 3) return { error: 'Draw at least three corners.' };
  const F = localFrame(latlng);
  const P = latlng.map(F.to);
  if (selfIntersects(P)) return { error: 'The boundary crosses itself. Drag the corners to fix it.' };
  const sA = signedArea(P), area = Math.abs(sA);
  if (area < 40) return { error: 'That lot is under 40 m². Zoom in and draw it again.' };
  if (area > 50000) return { error: 'That lot is over 5 hectares. Parametra designs single houses, so draw just the house lot.' };
  front = ((front % n) + n) % n;
  const A = P[front], B = P[(front + 1) % n];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (len < 2) return { error: 'The street edge is under 2 m long. Pick another edge.' };
  const u = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  const nIn = sA > 0 ? [-u[1], u[0]] : [u[1], -u[0]]; // from the street into the lot
  const xAx = [nIn[1], -nIn[0]];                    // a rotation, never a mirror
  const local = P.map(([x, y]) => [(x - A[0]) * xAx[0] + (y - A[1]) * xAx[1], (x - A[0]) * nIn[0] + (y - A[1]) * nIn[1]]);
  const minX = Math.min(...local.map((q) => q[0])), minY = Math.min(0, ...local.map((q) => q[1]));
  const poly = local.map(([x, y]) => [r3(x - minX), r3(y - minY)]);
  const plotW = Math.max(...poly.map((q) => q[0])), plotD = Math.max(...poly.map((q) => q[1]));
  // compass bearing of the street, seen from the house (clockwise from north)
  const bearing = Math.round(((Math.atan2(-nIn[0], -nIn[1]) / DEG) + 360) % 360);
  const pA = signedArea(poly);
  const kinds = poly.map((p, i) => {
    if (i === front) return 'front';
    const q = poly[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const outY = (pA > 0 ? -dx : dx) / l; // y of the outward normal
    return outY > 0.6 ? 'rear' : 'side';
  });
  const lengths = poly.map((p, i) => { const q = poly[(i + 1) % n]; return Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * 10) / 10; });
  // the transform from latitude/longitude to plot coordinates (see toPlot)
  const frame = { lat0: F.lat0, lng0: F.lng0, ax: A[0], ay: A[1], xx: xAx[0], xy: xAx[1], nx: nIn[0], ny: nIn[1], minX, minY };
  return {
    latlng, front, poly, kinds, lengths, frame,
    area: Math.round(area), frontage: Math.round(len * 10) / 10,
    plotW: Math.round(plotW * 10) / 10, plotD: Math.round(plotD * 10) / 10,
    bearing, street: ['N', 'E', 'S', 'W'][Math.round(bearing / 90) % 4],
    hemisphere: F.lat0 >= 0 ? 'N' : 'S', center: [F.lat0, F.lng0],
  };
}

/** Plot coordinates (metres) of a latitude/longitude, in a drawn lot's frame. */
export function toPlot(f, lat, lng) {
  const e = (lng - f.lng0) * DEG * R * Math.cos(f.lat0 * DEG) - f.ax, n = (lat - f.lat0) * DEG * R - f.ay;
  return [e * f.xx + n * f.xy - f.minX, e * f.nx + n * f.ny - f.minY];
}
/** A lot's frame; lots saved before frames were stored are rebuilt from their corners. */
export const lotFrame = (lot) => lot.frame || buildLot(lot.latlng, lot.front).frame;

// ── Buildable capacity ───────────────────────────────────────
const cache = new Map();

/**
 * Buildable area of a lot inside its setbacks, and the widest rectangle (aligned with the
 * street) that fits at each depth. A grid cell counts as buildable only if every point in it
 * keeps the setback from every edge, so fitted rectangles are never over-reported.
 * set: { front, side, rear } in metres.
 */
export function lotCapacity(lot, set) {
  const key = JSON.stringify([lot.poly, lot.kinds, set]);
  if (cache.has(key)) return cache.get(key);
  const P = lot.poly, n = P.length;
  const W = Math.max(...P.map((q) => q[0])), D = Math.max(...P.map((q) => q[1]));
  const cell = Math.max(0.1, Math.max(W, D) / 360);
  const cols = Math.max(1, Math.ceil(W / cell)), rows = Math.max(1, Math.ceil(D / cell));
  const half = cell * Math.SQRT1_2;
  const sb = lot.kinds.map((k) => Math.max(0, set[k] ?? set.side));
  const h = new Int32Array(cols), left = new Int32Array(cols), right = new Int32Array(cols), stack = new Int32Array(cols + 1);
  const bestW = new Float64Array(rows + 2), bx = new Float64Array(rows + 2), by = new Float64Array(rows + 2);
  const grid = new Uint8Array(rows * cols);
  let okCells = 0;
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell;
      let ok = pointInPoly(x, y, P);
      for (let i = 0; ok && i < n; i++) { const a = P[i], b = P[(i + 1) % n]; if (distToSeg(x, y, a[0], a[1], b[0], b[1]) < sb[i] + half) ok = false; }
      h[c] = ok ? h[c] + 1 : 0;
      if (ok) { okCells++; grid[r * cols + c] = 1; }
    }
    // for each column, how far left and right the run of heights >= h[c] reaches
    let top = 0;
    for (let c = 0; c < cols; c++) { while (top && h[stack[top - 1]] >= h[c]) top--; left[c] = top ? stack[top - 1] + 1 : 0; stack[top++] = c; }
    top = 0;
    for (let c = cols - 1; c >= 0; c--) { while (top && h[stack[top - 1]] >= h[c]) top--; right[c] = top ? stack[top - 1] - 1 : cols - 1; stack[top++] = c; }
    for (let c = 0; c < cols; c++) {
      const k = h[c]; if (!k) continue;
      const w = (right[c] - left[c] + 1) * cell;
      if (w > bestW[k] + 1e-9) { bestW[k] = w; bx[k] = left[c] * cell; by[k] = (r - k + 1) * cell; }
    }
  }
  // a rectangle deep enough for depth k+1 also serves depth k
  for (let k = rows - 1; k >= 1; k--) if (bestW[k + 1] > bestW[k]) { bestW[k] = bestW[k + 1]; bx[k] = bx[k + 1]; by[k] = by[k + 1]; }
  const idx = (Dm) => Math.max(1, Math.ceil(Dm / cell - 1e-6));
  let largest = null;
  for (let k = 1; k <= rows; k++) { const a = bestW[k] * k * cell; if (bestW[k] && (!largest || a > largest.w * largest.h)) largest = { x: bx[k], y: by[k], w: bestW[k], h: k * cell }; }
  // the house is centred on the street frontage where it can be
  const fa = P[lot.front ?? 0], fb = P[((lot.front ?? 0) + 1) % n], frontMid = (fa[0] + fb[0]) / 2;
  const placed = new Map();
  /** Nearest-the-street spot for a w × d rectangle, as close to the frontage centre as the lot allows. */
  const place = (w, d) => {
    const k = idx(d);
    if (k > rows || bestW[k] + 1e-6 < w) return null;
    const pk = `${w.toFixed(2)}|${d.toFixed(2)}`;
    if (placed.has(pk)) return placed.get(pk);
    const hh = new Int32Array(cols);
    let at = null;
    for (let r = 0; r < rows && !at; r++) {
      for (let c = 0; c < cols; c++) hh[c] = grid[r * cols + c] ? hh[c] + 1 : 0;
      if (r < k - 1) continue;
      // runs of columns buildable for the k rows ending here: pick the one nearest the frontage centre
      let best = null, s = -1;
      for (let c = 0; c <= cols; c++) {
        const good = c < cols && hh[c] >= k;
        if (good && s < 0) s = c;
        if (!good && s >= 0) {
          const x0 = s * cell, x1 = c * cell;
          if (x1 - x0 + 1e-6 >= w) {
            const x = Math.max(x0, Math.min(x1 - w, frontMid - w / 2));
            const off = Math.abs(x + w / 2 - frontMid);
            if (!best || off < best.off) best = { x, off };
          }
          s = -1;
        }
      }
      if (best) at = { x: best.x, y: (r - k + 1) * cell };
    }
    if (placed.size > 400) placed.clear();
    placed.set(pk, at);
    return at;
  };
  const cap = {
    cell, area: okCells * cell * cell, maxW: bestW[1], largest,
    /** widest rectangle that fits at depth Dm (0 if none) */
    widthAt: (Dm) => { const k = idx(Dm); return k > rows ? 0 : bestW[k]; },
    /** deepest rectangle at least minW wide */
    maxDepth: (minW) => { for (let k = rows; k >= 1; k--) if (bestW[k] + 1e-9 >= minW) return k * cell; return 0; },
    place,
  };
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  cache.set(key, cap);
  return cap;
}
