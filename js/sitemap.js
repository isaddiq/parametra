// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Find and draw the lot on a map
//  Loaded only when someone opens the map. Leaflet is vendored and
//  loaded on first use; imagery, address search (Nominatim) and road
//  data (Overpass) are OpenStreetMap and Esri web services.
// ─────────────────────────────────────────────────────────────
import { buildLot, localFrame, signedArea } from './lot.js';

const VENDOR = new URL('../vendor/leaflet/', import.meta.url).href;
let loading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return (loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = VENDOR + 'leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = VENDOR + 'leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; reject(new Error('Leaflet failed to load')); };
    document.head.appendChild(s);
  }));
}

const TILES = {
  satellite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imagery © Esri, Maxar, Earthstar Geographics'],
  roads: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', ''],
  map: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'],
};
const ROAD_TYPES = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const VIEW_KEY = 'parametra.mapView';
const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** Address search with OpenStreetMap Nominatim. Returns up to five places. */
export async function searchAddress(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()).map((r) => ({ name: r.display_name, lat: +r.lat, lon: +r.lon, bbox: r.boundingbox?.map(Number) }));
}

async function fetchJSON(url, opts = {}, ms = 8000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { const res = await fetch(url, { ...opts, signal: ctl.signal }); return res.ok ? await res.json() : null; } catch { return null; } finally { clearTimeout(timer); }
}
/** Roads near a point as [{ name, highway, line: [[lat, lng]…] }]: the nearest street from Nominatim, else every road from Overpass. */
async function roadsNear(lat, lng, radius) {
  const rev = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=geojson&zoom=17&polygon_geojson=1&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': navigator.language || 'en' } }, 6000);
  const ft = rev?.features?.[0], g = ft?.geometry;
  if (ft?.properties?.category === 'highway' && g && /LineString/.test(g.type)) {
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    return lines.map((c) => ({ name: ft.properties.name || null, highway: ft.properties.type, line: c.map(([lo, la]) => [la, lo]) }));
  }
  const q = `[out:json][timeout:10];way(around:${radius},${lat},${lng})[highway~"^(${ROAD_TYPES})$"];out tags geom;`;
  const ov = await fetchJSON('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) }, 10000);
  return (ov?.elements || []).filter((e) => e.geometry?.length > 1).map((e) => ({ name: e.tags?.name || null, highway: e.tags?.highway, line: e.geometry.map((n) => [n.lat, n.lon]) }));
}

/**
 * Which edge faces the street: the edge with a road closest outside it, from OpenStreetMap.
 * Service roads (lanes, driveways) count only when no proper street is near.
 */
async function detectStreet(pts) {
  const F = localFrame(pts), P = pts.map(F.to);
  const area = Math.abs(signedArea(P));
  const roads = await roadsNear(F.lat0, F.lng0, Math.round(Math.min(150, Math.max(45, Math.sqrt(area) * 1.6))));
  const ccw = signedArea(P) > 0;
  let best = null;
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 2) return;
    const out = ccw ? [dy / len, -dx / len] : [-dy / len, dx / len];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const w of roads) {
      const g = w.line.map(F.to);
      for (let k = 0; k < g.length - 1; k++) {
        const [ax, ay] = g[k], [bx, by] = g[k + 1], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
        const t = L2 ? Math.max(0, Math.min(1, ((m[0] - ax) * ex + (m[1] - ay) * ey) / L2)) : 0;
        const cx = ax + t * ex - m[0], cy = ay + t * ey - m[1], dist = Math.hypot(cx, cy);
        if (cx * out[0] + cy * out[1] <= 0) continue; // the road must be outside this edge
        const cost = dist + (w.highway === 'service' ? 25 : 0);
        if (!best || cost < best.cost) best = { front: i, cost, name: w.name };
      }
    }
  });
  return best;
}

/**
 * Mount the lot map in `el`. Callbacks:
 *  onLot({ latlng, front, address } | null)  the lot changed (null = no lot)
 *  onStatus(text, kind)                      kind: '', 'ok', 'bad', 'busy'
 *  onMode(mode, corners)                     'idle' | 'drawing' | 'done'
 */
export async function mountLotMap(el, { lot = null, onLot, onStatus, onMode }) {
  const L = await loadLeaflet();
  const map = L.map(el, { worldCopyJump: true, zoomSnap: 0.5 });
  let base = null, roads = null, layer = 'satellite';
  const setLayer = (k) => {
    layer = k; base?.remove(); roads?.remove(); roads = null;
    base = L.tileLayer(TILES[k][0], { maxNativeZoom: 19, maxZoom: 21, attribution: TILES[k][1] }).addTo(map);
    if (k === 'satellite') roads = L.tileLayer(TILES.roads[0], { maxNativeZoom: 19, maxZoom: 21, opacity: 0.8 }).addTo(map);
  };
  setLayer('satellite');

  let pts = lot?.latlng ? lot.latlng.map((p) => [...p]) : [];
  let front = lot?.front ?? 0;
  let address = lot?.address || '';
  let mode = pts.length >= 3 ? 'done' : 'idle';
  let version = 0;
  const shapes = L.layerGroup().addTo(map);
  const refs = { poly: null, edges: [], hits: [], lens: [] };
  const status = (t, k = '') => onStatus?.(t, k);
  const setMode = (m) => { mode = m; el.classList.toggle('drawing', m === 'drawing'); onMode?.(m, pts.length); };

  // initial view: the lot, else the last view, else the world
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(VIEW_KEY)); } catch { /* storage unavailable */ }
  if (pts.length >= 3) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 20 });
  else if (saved?.c) map.setView(saved.c, saved.z);
  else map.setView([25, 10], 2);
  map.on('moveend', () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ c: map.getCenter(), z: map.getZoom() })); } catch { /* storage unavailable */ } });

  const vtx = (cls) => L.divIcon({ className: `lot-vtx ${cls}`, iconSize: [14, 14] });
  // edge lengths are measured in one frame for the whole lot, as buildLot does
  const lenIcon = (i, a, b) => {
    const F = localFrame(pts), p = F.to(a), q = F.to(b);
    return L.divIcon({ className: `lot-len${i === front ? ' front' : ''}`, html: `<span>${i === front ? 'Street · ' : ''}${Math.hypot(q[0] - p[0], q[1] - p[1]).toFixed(1)} m</span>`, iconSize: null });
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  function draw() {
    shapes.clearLayers();
    refs.edges = []; refs.hits = []; refs.lens = []; refs.poly = null;
    if (!pts.length) return;
    if (mode === 'drawing') {
      L.polyline(pts, { color: '#F2C14E', weight: 3, dashArray: '6 6', interactive: false }).addTo(shapes);
      pts.forEach((p, i) => {
        const m = L.marker(p, { icon: vtx(i === 0 && pts.length >= 3 ? 'first' : ''), interactive: i === 0 && pts.length >= 3, keyboard: false }).addTo(shapes);
        if (i === 0) m.on('click', (e) => { L.DomEvent.stop(e); finish(); });
      });
      return;
    }
    refs.poly = L.polygon(pts, { color: '#F2C14E', weight: 0, fillColor: '#F2C14E', fillOpacity: 0.14, interactive: false }).addTo(shapes);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length], isFront = i === front;
      refs.edges.push(L.polyline([p, q], { color: isFront ? '#E8572A' : '#F2C14E', weight: isFront ? 6 : 2.5, interactive: false }).addTo(shapes));
      const hit = L.polyline([p, q], { weight: 20, opacity: 0.001, className: 'lot-edge-hit' }).addTo(shapes);
      hit.bindTooltip(isFront ? 'Street side' : 'Click to make this the street side', { sticky: true, direction: 'top' });
      hit.on('click', (e) => { L.DomEvent.stop(e); if (front !== i) { front = i; draw(); emit('Street side changed. The house faces this edge.'); } });
      refs.hits.push(hit);
      refs.lens.push(L.marker(mid(p, q), { icon: lenIcon(i, p, q), interactive: false, keyboard: false }).addTo(shapes));
    });
    pts.forEach((p, i) => {
      const m = L.marker(p, { icon: vtx('edit'), draggable: true, keyboard: false, title: 'Drag to move this corner' }).addTo(shapes);
      m.on('drag', (e) => { const ll = e.target.getLatLng(); pts[i] = [round6(ll.lat), round6(ll.lng)]; live(); });
      m.on('dragend', () => { draw(); emit(); });
    });
  }
  // update shapes in place while a corner is dragged (redrawing would drop the dragged marker)
  function live() {
    refs.poly?.setLatLngs(pts);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      refs.edges[i]?.setLatLngs([p, q]); refs.hits[i]?.setLatLngs([p, q]);
      refs.lens[i]?.setLatLng(mid(p, q)).setIcon(lenIcon(i, p, q));
    });
  }

  function emit(msg) {
    const built = buildLot(pts, front);
    if (built.error) { status(built.error, 'bad'); return false; }
    onLot?.({ latlng: pts.map((p) => [...p]), front, address });
    if (msg !== undefined) status(msg, 'ok');
    return true;
  }

  function startDraw() {
    pts = []; front = 0; version++;
    map.doubleClickZoom.disable();
    setMode('drawing'); draw();
    onLot?.(null);
    status('Click each corner of the lot in turn. To close it, click the first corner, double-click, or press Finish.');
  }
  function undo() {
    if (mode !== 'drawing' || !pts.length) return;
    pts.pop(); draw(); onMode?.(mode, pts.length);
  }
  async function finish() {
    if (mode !== 'drawing') return;
    // a double-click also lands as two clicks: drop corners closer than 30 cm to the previous one
    pts = pts.filter((p, i) => { if (!i) return true; const F = localFrame([pts[i - 1], p]), a = F.to(pts[i - 1]), b = F.to(p); return Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.3; });
    if (pts.length < 3) { status('A lot needs at least three corners.', 'bad'); return; }
    map.doubleClickZoom.enable();
    setMode('done'); draw();
    if (!emit()) return;
    const v = ++version;
    status('Looking for the street next to this lot…', 'busy');
    const st = await detectStreet(pts);
    if (v !== version || mode !== 'done') return;
    if (st) { front = st.front; draw(); emit(`Street side found from OpenStreetMap${st.name ? `: ${st.name}` : ''}. Click another edge if that is wrong.`); }
    else status('Could not find a street next to this lot. Click the edge that faces the street.', 'bad');
  }
  function clear() {
    pts = []; front = 0; version++;
    map.doubleClickZoom.enable();
    setMode('idle'); draw(); onLot?.(null);
    status('Lot cleared. Press Draw lot to start again.');
  }
  function goTo(place) {
    address = place.name;
    const bb = place.bbox;
    if (bb && bb.length === 4 && Math.abs(bb[1] - bb[0]) < 0.02) map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 19, padding: [20, 20] });
    else map.setView([place.lat, place.lon], 19);
  }

  map.on('click', (e) => {
    if (mode !== 'drawing') return;
    pts.push([round6(e.latlng.lat), round6(e.latlng.lng)]); // ~10 cm, the precision the brief stores
    draw(); onMode?.(mode, pts.length);
  });
  map.on('dblclick', (e) => { if (mode === 'drawing' && pts.length >= 3) { L.DomEvent.stop(e); finish(); } });
  const onKey = (e) => {
    if (mode !== 'drawing') return;
    if (e.key === 'Enter' && pts.length >= 3) { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { e.preventDefault(); clear(); }
    if ((e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) && e.target === document.body) { e.preventDefault(); undo(); }
  };
  document.addEventListener('keydown', onKey);

  setMode(mode); draw();
  if (mode === 'done') status('Drag a corner to adjust the lot, or click an edge to make it the street side.');
  else status('Search for an address or pan to your plot, then press Draw lot.');

  return {
    startDraw, undo, finish, clear, goTo,
    setLayer: (k) => setLayer(k),
    get layer() { return layer; },
    destroy() { document.removeEventListener('keydown', onKey); map.remove(); },
    invalidate() { map.invalidateSize(); },
  };
}
