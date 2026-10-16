// Applies the merged layers to every enabled agent through its adapter.
//
// For each native file an adapter manages, the desired content (adapter defaults <
// global settings < project settings, plus rendered MCP servers) is merged into the
// file with `applyDeclared`. What was applied is remembered next to the agent's
// state, so a key removed from a layer is also removed from the native file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapters } from './adapters.mjs';
import { expandString, mapStrings } from './expand.mjs';
import { ensureDir, ensureSymlink, readConfig, resolveHome, writeConfig } from './files.mjs';
import { serversFor } from './layers.mjs';
import { applyDeclared, applySeed, deepEqual, deepMerge } from './merge.mjs';

export const SKILLS_DIR = fileURLToPath(new URL('../skills', import.meta.url));
const APPLIED_FILE = '.agentic-devbox.applied.json';

// Agents left out of the image (AGENTIC_DEVBOX_AGENTS build arg) are skipped.
function onPath(bin) {
  return (process.env.PATH ?? '').split(':').some((dir) => dir && fs.existsSync(path.join(dir, bin)));
}

export function makeContext(warnings) {
  const env = process.env;
  return {
    env,
    cdpPort: env.AGENTIC_DEVBOX_CDP_PORT ?? '9222',
    warn: (msg) => warnings.push(msg),
    // Resolve ${VAR} references now (for agents that cannot do it themselves).
    expand: (value, label = 'MCP config') =>
      mapStrings(value, (s) => expandString(s, env, (name) => warnings.push(`${label}: \${${name}} is not set`))),
  };
}

function nestAt(pathSegments, value) {
  return pathSegments.reduceRight((acc, seg) => ({ [seg]: acc }), value);
}

// Desired content per native file for one adapter.
export function desiredFiles(adapter, layers, ctx) {
  const files = new Map();
  const add = (file, format, content, atomic = []) => {
    const entry = files.get(file) ?? { format, content: {}, atomic: [] };
    entry.content = deepMerge(entry.content, content);
    entry.atomic.push(...atomic);
    files.set(file, entry);
  };

  if (adapter.settings) {
    const declared = deepMerge(adapter.settings.defaults?.(ctx), layers.agents[adapter.id]?.settings);
    add(adapter.settings.file, adapter.settings.format, declared);
  }

  if (adapter.mcp) {
    const rendered = {};
    for (const [name, server] of Object.entries(serversFor(adapter.id, layers.servers))) {
      const native = adapter.mcp.render(server, ctx, name);
      if (native) rendered[name] = native;
    }
    add(adapter.mcp.file, adapter.mcp.format, nestAt(adapter.mcp.path, rendered), [[...adapter.mcp.path, '*']]);
  }

  return files;
}

function applyAdapter(adapter, layers, ctx) {
  const report = { id: adapter.id, name: adapter.name, files: [], skills: [] };
  if (layers.agents[adapter.id]?.enabled === false) {
    report.disabled = true;
    return report;
  }
  if (!onPath(adapter.bin)) {
    report.notInstalled = true;
    return report;
  }

  for (const dir of adapter.dirs ?? []) ensureDir(dir);
  for (const [target, link] of adapter.links ?? []) {
    if (!ensureSymlink(resolveHome(target), link)) ctx.warn(`${adapter.id}: ${link} is a real folder, not linking it to ${target}`);
  }

  const appliedPath = path.join(resolveHome(adapter.home), APPLIED_FILE);
  const applied = readConfig(appliedPath) ?? {};
  const nextApplied = {};

  for (const [file, { format, content, atomic }] of desiredFiles(adapter, layers, ctx)) {
    const current = readConfig(file, format);
    const next = applyDeclared(current, content, applied[file], { atomic });
    if (!deepEqual(current, next)) writeConfig(file, next, format);
    nextApplied[file] = content;
    report.files.push(resolveHome(file));
  }

  for (const { file, format, values } of adapter.seed ?? []) {
    const current = readConfig(file, format);
    const next = applySeed(current, values(ctx));
    if (!deepEqual(current, next)) writeConfig(file, next, format);
  }

  if (adapter.skillsDir) report.skills = linkSkills(adapter.skillsDir);

  writeConfig(appliedPath, nextApplied);
  return report;
}

// Bundled skills are symlinked, never copied, so image updates reach every project.
function linkSkills(dir) {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR).filter((skill) => ensureSymlink(path.join(SKILLS_DIR, skill), path.join(resolveHome(dir), skill)));
}

// ~/.agents/skills is the cross-agent skills folder (read by Copilot, Codex, OpenCode
// and Antigravity). It lives in the state folder so personal skills persist.
function prepareSharedSkills(ctx) {
  const shared = '~/.agentic-devbox/agents';
  ensureDir(`${shared}/skills`);
  if (!ensureSymlink(resolveHome(shared), '~/.agents')) ctx.warn('~/.agents is a real folder; shared skills not linked');
  return linkSkills(`${shared}/skills`);
}

export function applyAll(layers) {
  const warnings = [...layers.warnings];
  const ctx = makeContext(warnings);
  const reports = [];
  try {
    reports.push({ id: 'skills', name: 'Shared skills', files: [], skills: prepareSharedSkills(ctx) });
  } catch (err) {
    warnings.push(`shared skills: ${err.message}`);
  }
  for (const adapter of adapters) {
    try {
      reports.push(applyAdapter(adapter, layers, ctx));
    } catch (err) {
      warnings.push(`${adapter.id}: ${err.message}`);
      reports.push({ id: adapter.id, name: adapter.name, error: err.message });
    }
  }
  return { reports, warnings };
}
