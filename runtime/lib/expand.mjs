// ${VAR} and ${VAR:-default} references inside MCP definitions.
//
// Tools that resolve references themselves receive them untouched, so secrets stay
// out of their config files. For the others, `expand` resolves them at render time.

const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

export function expandString(value, env, onMissing = () => {}) {
  return value.replace(REF, (_, name, fallback) => {
    if (env[name] !== undefined && env[name] !== '') return env[name];
    if (fallback !== undefined) return fallback;
    onMissing(name);
    return '';
  });
}

// Rewrites each reference with `format(name, fallback)`, e.g. OpenCode's {env:NAME}.
export function rewriteRefs(value, format) {
  return value.replace(REF, (_, name, fallback) => format(name, fallback));
}

export function referencedVars(value) {
  return [...value.matchAll(REF)].map((m) => m[1]);
}

export function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return value;
}
