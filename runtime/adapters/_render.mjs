// Shared helpers for adapters (files starting with "_" are not loaded as adapters).

import { isPlainObject } from '../lib/merge.mjs';

// Drops undefined values and empty objects/arrays so native files stay minimal.
export function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (isPlainObject(v)) return Object.keys(v).length > 0;
      return true;
    }),
  );
}

// "${NAME}" exactly (no default, nothing around it) → "NAME"; otherwise null.
export function soleRef(value) {
  const m = typeof value === 'string' && value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return m ? m[1] : null;
}

export const allTools = (tools) => (tools && !(tools.length === 1 && tools[0] === '*') ? tools : undefined);
