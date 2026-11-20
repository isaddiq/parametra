// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Fix search worker
//  When no layout meets the planning rules, findFixes() regenerates
//  hundreds of layouts for candidate brief changes. Running it here
//  keeps the wizard and studio responsive meanwhile.
// ─────────────────────────────────────────────────────────────
import { findFixes } from './engine.js';

self.onmessage = (e) => {
  const { id, brief } = e.data;
  let fixes = [];
  try { fixes = findFixes(brief); } catch (err) { console.error(err); }
  self.postMessage({ id, fixes });
};
