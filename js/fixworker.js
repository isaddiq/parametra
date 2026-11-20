// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Fix search worker
//  When no layout meets the planning rules, findFixes() regenerates
//  hundreds of layouts for candidate brief changes, and the designs
//  for the two best changes are generated here too, so the studio can
//  show buildable alternatives. Running it here keeps the page responsive.
// ─────────────────────────────────────────────────────────────
import { findFixes, adjustedDesigns } from './engine.js';

self.onmessage = (e) => {
  const { id, brief } = e.data;
  let fixes = [], adjusted = [];
  try { fixes = findFixes(brief); adjusted = adjustedDesigns(brief, fixes); } catch (err) { console.error(err); }
  self.postMessage({ id, fixes, adjusted });
};
