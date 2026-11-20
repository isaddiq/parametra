// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Real surroundings for a lot drawn on the map
//  loadImagery()   Esri World Imagery tiles around the lot, stitched
//                  into one canvas, its edges faded so it blends into
//                  the lawn beyond. The same imagery the lot was drawn
//                  on, so the two line up.
//  loadBuildings() neighbouring building footprints and heights from
//                  OpenStreetMap (Overpass). Best effort: the public
//                  service is often busy, and the scene works without it.
//  Results are cached per place, so switching designs reuses them.
// ─────────────────────────────────────────────────────────────
const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
export const IMAGERY_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics';
export const BUILDINGS_CREDIT = 'Buildings © OpenStreetMap contributors';
const MAX_TILES = 8; // per side, so the canvas stays at most 2048 px
const cache = new Map();
const keyOf = (kind, lat, lng, r) => `${kind}|${lat.toFixed(5)}|${lng.toFixed(5)}|${Math.round(r)}`;

const tileX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const tileY = (lat, z) => { const p = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / Math.PI) / 2) * 2 ** z; };
const lngOf = (x, z) => (x / 2 ** z) * 360 - 180;
const latOf = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

function loadTile(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed to use the pixels as a WebGL texture
    const timer = setTimeout(() => resolve(null), 12000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * Satellite imagery covering `radius` metres around a point.
 * Resolves to { canvas, nw: [lat, lng], se: [lat, lng], tiles, loaded }, or null if no tile loads.
 */
export function loadImagery(lat, lng, radius = 150) {
  const key = keyOf('img', lat, lng, radius);
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    let z = 19, span;
    for (; z > 15; z--) {
      const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z; // metres per pixel
      span = radius / (256 * mpp); // radius in tiles
      if (Math.floor(tileX(lng, z) + span) - Math.floor(tileX(lng, z) - span) + 1 <= MAX_TILES) break;
    }
    const cx = tileX(lng, z), cy = tileY(lat, z);
    const x0 = Math.floor(cx - span), x1 = Math.floor(cx + span), y0 = Math.floor(cy - span), y1 = Math.floor(cy + span);
    const canvas = document.createElement('canvas');
    canvas.width = (x1 - x0 + 1) * 256; canvas.height = (y1 - y0 + 1) * 256;
    const g = canvas.getContext('2d');
    g.fillStyle = '#7d8a6a'; g.fillRect(0, 0, canvas.width, canvas.height);
    const jobs = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      jobs.push(loadTile(`${TILE}${z}/${ty}/${tx}`).then((img) => { if (img) g.drawImage(img, (tx - x0) * 256, (ty - y0) * 256); return !!img; }));
    }
    const ok = (await Promise.all(jobs)).filter(Boolean).length;
    if (!ok) return null;
    // fade the edges into the lawn: opaque in the middle, transparent at the rim
    const w = canvas.width, h = canvas.height, r = Math.min(w, h) / 2;
    const fade = g.createRadialGradient(w / 2, h / 2, r * 0.62, w / 2, h / 2, r * 0.98);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    return { canvas, nw: [latOf(y0, z), lngOf(x0, z)], se: [latOf(y1 + 1, z), lngOf(x1 + 1, z)], zoom: z, tiles: jobs.length, loaded: ok };
  })();
  cache.set(key, job);
  job.then((v) => { if (!v) cache.delete(key); });
  return job;
}

/** Height (m) of an OpenStreetMap building from its tags. */
export function buildingHeight(t = {}) {
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
  const h = num(t.height) ?? num(t['building:height']);
  if (h) return Math.min(h, 150);
  const lv = num(t['building:levels']);
  if (lv) return Math.min(lv * 3 + (t['roof:shape'] && t['roof:shape'] !== 'flat' ? 1.5 : 0.6), 150);
  const type = t.building;
  if (['garage', 'garages', 'shed', 'carport', 'hut', 'roof'].includes(type)) return 2.8;
  if (['apartments', 'commercial', 'office', 'retail', 'hotel'].includes(type)) return 12;
  return 7; // a typical two-storey house
}

/**
 * Building footprints within `radius` metres, as [{ ring: [[lat, lng]…], height }].
 * Resolves to [] when the service is unavailable.
 */
export function loadBuildings(lat, lng, radius = 150) {
  const key = keyOf('bld', lat, lng, radius);
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const q = `[out:json][timeout:12];way(around:${Math.round(radius)},${lat},${lng})[building];out tags geom;`;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctl.signal });
      if (!res.ok) return null;
      const els = (await res.json()).elements || [];
      return els.filter((e) => e.geometry?.length > 3).map((e) => ({ ring: e.geometry.map((n) => [n.lat, n.lon]), height: buildingHeight(e.tags) }));
    } catch { return null; } finally { clearTimeout(timer); }
  })();
  cache.set(key, job);
  job.then((v) => { if (!v) cache.delete(key); }); // try again next time
  return job.then((v) => v || []);
}
