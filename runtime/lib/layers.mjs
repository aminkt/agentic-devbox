// Loads the two declarative layers and merges them:
//
//   global   ~/.config/agentic-devbox/{mcp-global,settings-global}.json   (mounted read-only)
//   project  <project>/.agentic-devbox/{mcp-project,settings-project}.json (mounted read-only)
//
// The project layer wins. A project server with "disabled": true removes a global one,
// and an entry without command or url (only agents, tools, env or headers) modifies the
// global server of the same name instead of replacing it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './files.mjs';
import { deepMerge, isPlainObject } from './merge.mjs';

const GLOBAL_DIR = process.env.AGENTIC_DEVBOX_GLOBAL_DIR ?? '/etc/agentic-devbox/global';
const PROJECT_DIR = process.env.AGENTIC_DEVBOX_PROJECT_DIR ?? '/etc/agentic-devbox/project';
const IMAGE_DEFAULT_MCP = fileURLToPath(new URL('../share/mcp-global.default.json', import.meta.url));

export const layerFiles = {
  globalMcp: path.join(GLOBAL_DIR, 'mcp-global.json'),
  projectMcp: path.join(PROJECT_DIR, 'mcp-project.json'),
  globalSettings: path.join(GLOBAL_DIR, 'settings-global.json'),
  projectSettings: path.join(PROJECT_DIR, 'settings-project.json'),
};

function load(file, warnings) {
  try {
    return readConfig(file) ?? {};
  } catch (err) {
    warnings.push(`${err.message}; layer ignored`);
    return {};
  }
}

function validateServer(name, def, origin, warnings) {
  if (!isPlainObject(def)) {
    warnings.push(`${origin}: MCP server "${name}" must be an object; skipped`);
    return null;
  }
  if (def.disabled === true) return def;
  const type = def.type ?? (def.url ? 'http' : 'stdio');
  if (!['stdio', 'http', 'sse'].includes(type)) {
    warnings.push(`${origin}: MCP server "${name}" has unknown type "${type}"; skipped`);
    return null;
  }
  if (type === 'stdio' && typeof def.command !== 'string') {
    warnings.push(`${origin}: MCP server "${name}" (stdio) needs a "command"; skipped`);
    return null;
  }
  if (type !== 'stdio' && typeof def.url !== 'string') {
    warnings.push(`${origin}: MCP server "${name}" (${type}) needs a "url"; skipped`);
    return null;
  }
  for (const field of ['args', 'agents', 'tools']) {
    if (def[field] !== undefined && !Array.isArray(def[field])) {
      warnings.push(`${origin}: MCP server "${name}" field "${field}" must be an array; skipped`);
      return null;
    }
  }
  return { ...def, type, args: def.args ?? [], env: def.env ?? {}, headers: def.headers ?? {} };
}

function serversOf(doc, origin, warnings) {
  const servers = isPlainObject(doc.mcpServers) ? doc.mcpServers : {};
  const out = {};
  for (const [name, def] of Object.entries(servers)) {
    const valid = validateServer(name, def, origin, warnings);
    if (valid) out[name] = valid;
  }
  return out;
}

export function loadLayers() {
  const warnings = [];
  const globalMcpFile = fs.existsSync(layerFiles.globalMcp) ? layerFiles.globalMcp : IMAGE_DEFAULT_MCP;

  const servers = serversOf(load(globalMcpFile, warnings), globalMcpFile, warnings);
  const projectDoc = load(layerFiles.projectMcp, warnings);
  const projectEntries = isPlainObject(projectDoc.mcpServers) ? projectDoc.mcpServers : {};
  const patches = {};
  for (const [name, def] of Object.entries(projectEntries)) {
    if (isPlainObject(def) && !def.command && !def.url && def.disabled !== true) patches[name] = def;
  }
  const replacements = Object.fromEntries(Object.entries(projectEntries).filter(([name]) => !patches[name]));
  Object.assign(servers, serversOf({ mcpServers: replacements }, layerFiles.projectMcp, warnings));
  for (const [name, patch] of Object.entries(patches)) {
    if (!servers[name]) {
      warnings.push(`${layerFiles.projectMcp}: "${name}" has no command or url and no global server of that name exists; skipped`);
      continue;
    }
    servers[name] = { ...servers[name], ...patch, env: { ...servers[name].env, ...patch.env }, headers: { ...servers[name].headers, ...patch.headers } };
  }
  for (const [name, def] of Object.entries(servers)) {
    if (def.disabled === true) delete servers[name];
  }

  const globalSettings = load(layerFiles.globalSettings, warnings);
  const projectSettings = load(layerFiles.projectSettings, warnings);
  const agents = deepMerge(globalSettings.agents, projectSettings.agents);

  return { servers, agents, warnings, sources: { ...layerFiles, globalMcp: globalMcpFile } };
}

// Servers meant for one agent: honours the optional "agents": ["claude", ...] filter.
export function serversFor(agentId, servers) {
  return Object.fromEntries(
    Object.entries(servers).filter(([, def]) => !def.agents || def.agents.includes(agentId)),
  );
}
