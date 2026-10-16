// Discovers agent adapters: every module in ../adapters/ is one AI coding tool.
// Adding a tool means adding one file there (see CONTRIBUTING.md for the contract).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'adapters');

const REQUIRED = ['id', 'name', 'bin', 'home'];

async function load() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const loaded = [];
  for (const file of files) {
    const { default: adapter } = await import(pathToFileURL(path.join(dir, file)).href);
    const missing = REQUIRED.filter((key) => !adapter?.[key]);
    if (missing.length) throw new Error(`adapter ${file} is missing: ${missing.join(', ')}`);
    loaded.push(adapter);
  }
  return loaded.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
}

export const adapters = await load();
