// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Exact solvers for the banded layout
//
//  The banded typology breaks layout into two small problems that
//  can be solved exactly in the browser, with no solver library:
//
//  distribute()  Room widths along one band: a separable convex QP
//                  minimise  Σ (w_i − p_i)² / f_i
//                  s.t.      Σ w_i = L,  lo_i ≤ w_i ≤ hi_i
//                The KKT conditions give w_i(λ) = clamp(p_i + λ·f_i, lo_i, hi_i).
//                Σ w_i(λ) is piecewise linear and non-decreasing in λ, so
//                the optimum is found exactly by walking its breakpoints.
//                When Σ lo_i > L no widths can fit, and the shortfall is exact.
//
//  partition()   Which band a free room goes in: branch and bound over
//                every assignment, minimising the longer band (then the
//                total), so the envelope is as narrow as the program allows.
// ─────────────────────────────────────────────────────────────
const EPS = 1e-9;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Exact widths for one band.
 * p: preferred widths, lo/hi: bounds, f: flexibility (> 0 moves, 0 stays at p), L: band length.
 * Returns { w, status, gap }: status 'ok' when Σw = L, 'short' when even the minimum
 * widths overrun L by `gap`, 'slack' when the maximum widths leave `gap` unused.
 */
export function distribute(p, lo, hi, f, L) {
  const at = (lam) => p.map((pi, i) => clamp(f[i] > 0 ? pi + lam * f[i] : pi, lo[i], hi[i]));
  const S = (lam) => sum(at(lam));
  const bps = [];
  p.forEach((pi, i) => { if (f[i] > 0) bps.push((lo[i] - pi) / f[i], (hi[i] - pi) / f[i]); });
  if (!bps.length) {
    const w = at(0), s = sum(w);
    return { w, status: Math.abs(s - L) < 1e-6 ? 'ok' : s > L ? 'short' : 'slack', gap: Math.abs(s - L) };
  }
  bps.sort((a, b) => a - b);
  const sMin = S(bps[0]), sMax = S(bps[bps.length - 1]);
  if (sMin > L + 1e-6) return { w: at(bps[0]), status: 'short', gap: sMin - L };
  if (sMax < L - 1e-6) return { w: at(bps[bps.length - 1]), status: 'slack', gap: L - sMax };
  // S is linear between consecutive breakpoints: find the bracket and interpolate
  let a = bps[0], Sa = sMin;
  for (let k = 1; k < bps.length; k++) {
    const b = bps[k], Sb = S(b);
    if (Sb >= L - EPS) {
      const lam = Sb - Sa < EPS ? b : a + ((L - Sa) * (b - a)) / (Sb - Sa);
      return { w: at(lam), status: 'ok', gap: 0 };
    }
    a = b; Sa = Sb;
  }
  return { w: at(bps[bps.length - 1]), status: 'ok', gap: 0 };
}

/**
 * Exact two-band assignment. base0/base1: lengths already fixed in each band;
 * w0[i]/w1[i]: length of free item i in band 0 / band 1 (bands differ in depth).
 * `seed` is a starting assignment (e.g. greedy) kept unless strictly beaten.
 * Returns an array of 0/1, or null when there are too many items to enumerate.
 */
export function partition(base0, base1, w0, w1, seed = null, maxN = 16) {
  const n = w0.length;
  if (!n) return [];
  if (n > maxN) return null;
  const cost = (asg) => {
    let l0 = base0, l1 = base1;
    asg.forEach((s, i) => { if (s) l1 += w1[i]; else l0 += w0[i]; });
    return [Math.max(l0, l1), l0 + l1];
  };
  let best = seed && seed.length === n ? seed.slice() : new Array(n).fill(0);
  let [bMax, bSum] = cost(best);
  // big items first prunes fastest
  const order = [...Array(n).keys()].sort((i, j) => Math.max(w0[j], w1[j]) - Math.max(w0[i], w1[i]));
  const minRest = order.map((_, k) => sum(order.slice(k).map((i) => Math.min(w0[i], w1[i]))));
  const cur = new Array(n);
  const dfs = (k, l0, l1) => {
    const m = Math.max(l0, l1);
    if (m > bMax + 1e-6) return;
    if (l0 + l1 + minRest[k] > bSum + 1e-6 && m > bMax - 1e-6) return;
    if (k === n) {
      const s = l0 + l1;
      if (m < bMax - 1e-6 || (m < bMax + 1e-6 && s < bSum - 1e-6)) { bMax = m; bSum = s; best = cur.slice(); }
      return;
    }
    const i = order[k];
    cur[i] = 0; dfs(k + 1, l0 + w0[i], l1);
    cur[i] = 1; dfs(k + 1, l0, l1 + w1[i]);
  };
  dfs(0, base0, base1);
  return best;
}
