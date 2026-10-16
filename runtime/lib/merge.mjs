// Declarative merging used for every native config file the sandbox manages.
//
// `applyDeclared` is a three-way merge in the spirit of `kubectl apply`:
//   - keys declared now are written (they win over whatever the file holds),
//   - keys declared last time but no longer declared are removed, unless the
//     tool or the user has changed them since,
//   - every other key (state the tool writes for itself) is left untouched.

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// Recursive merge of layers; later layers win, arrays and scalars are replaced.
export function deepMerge(...layers) {
  let result = {};
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    result = mergeTwo(result, layer);
  }
  return result;
}

function mergeTwo(base, over) {
  const out = clone(base);
  for (const [key, value] of Object.entries(over)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeTwo(out[key], value) : clone(value);
  }
  return out;
}

// `atomic` lists path patterns whose values are replaced as a whole instead of
// merged key by key, e.g. [['mcpServers', '*']] keeps each server definition intact.
function isAtomic(path, atomic) {
  return atomic.some((pattern) => pattern.length === path.length && pattern.every((seg, i) => seg === '*' || seg === path[i]));
}

function walkLeaves(obj, atomic, visit, prefix = []) {
  if (!isPlainObject(obj)) return;
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    if (isPlainObject(value) && Object.keys(value).length > 0 && !isAtomic(path, atomic)) {
      walkLeaves(value, atomic, visit, path);
    } else {
      visit(path, value);
    }
  }
}

export function getIn(obj, path) {
  let node = obj;
  for (const seg of path) {
    if (!isPlainObject(node) || !Object.hasOwn(node, seg)) return undefined;
    node = node[seg];
  }
  return node;
}

function hasIn(obj, path) {
  let node = obj;
  for (const seg of path) {
    if (!isPlainObject(node) || !Object.hasOwn(node, seg)) return false;
    node = node[seg];
  }
  return true;
}

function setIn(obj, path, value) {
  let node = obj;
  for (const seg of path.slice(0, -1)) {
    if (!isPlainObject(node[seg])) node[seg] = {};
    node = node[seg];
  }
  node[path.at(-1)] = value;
}

function deleteIn(obj, path) {
  const parents = [];
  let node = obj;
  for (const seg of path.slice(0, -1)) {
    if (!isPlainObject(node[seg])) return;
    parents.push([node, seg]);
    node = node[seg];
  }
  delete node[path.at(-1)];
  // Drop parents that became empty because of this removal.
  for (const [parent, seg] of parents.reverse()) {
    if (isPlainObject(parent[seg]) && Object.keys(parent[seg]).length === 0) delete parent[seg];
    else break;
  }
}

export function applyDeclared(current, desired, lastApplied, { atomic = [] } = {}) {
  const result = isPlainObject(current) ? clone(current) : {};
  walkLeaves(desired, atomic, (path, value) => setIn(result, path, clone(value)));
  walkLeaves(lastApplied, atomic, (path, value) => {
    if (hasIn(desired, path)) return;
    if (deepEqual(getIn(current, path), value)) deleteIn(result, path);
  });
  return result;
}

// Values only written when the key is absent; never enforced afterwards.
export function applySeed(current, seed) {
  const result = isPlainObject(current) ? clone(current) : {};
  walkLeaves(seed, [], (path, value) => {
    if (!hasIn(result, path)) setIn(result, path, clone(value));
  });
  return result;
}
