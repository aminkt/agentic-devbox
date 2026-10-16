import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

export const HOME = os.homedir();

export function resolveHome(p) {
  return p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p;
}

const formats = {
  json: {
    parse: (text) => (text.trim() === '' ? {} : JSON.parse(text)),
    stringify: (data) => `${JSON.stringify(data, null, 2)}\n`,
  },
  toml: {
    parse: (text) => parseToml(text),
    stringify: (data) => `${stringifyToml(data)}\n`,
  },
};

export function readConfig(file, format = 'json') {
  const full = resolveHome(file);
  if (!fs.existsSync(full)) return undefined;
  const text = fs.readFileSync(full, 'utf8');
  try {
    return formats[format].parse(text);
  } catch (err) {
    throw new Error(`${full}: invalid ${format.toUpperCase()} (${err.message})`);
  }
}

// Atomic write: temp file + rename, so a crash never leaves a half-written config.
export function writeConfig(file, data, format = 'json', mode = 0o600) {
  const full = resolveHome(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.agentic-devbox.tmp`;
  fs.writeFileSync(tmp, formats[format].stringify(data), { mode });
  fs.renameSync(tmp, full);
}

export function ensureDir(dir) {
  fs.mkdirSync(resolveHome(dir), { recursive: true });
}

// Points `link` at `target`, replacing a stale link but never a real file or folder.
export function ensureSymlink(target, link) {
  const full = resolveHome(link);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  try {
    const stat = fs.lstatSync(full);
    if (!stat.isSymbolicLink()) return false;
    if (fs.readlinkSync(full) === target) return true;
    fs.unlinkSync(full);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.symlinkSync(target, full);
  return true;
}

export function isWritableDir(dir) {
  try {
    fs.accessSync(resolveHome(dir), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
