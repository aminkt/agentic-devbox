// End-to-end: layers from test/fixtures → native files of every agent in a temp HOME.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';

const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-devbox-test-'));
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-devbox-project-'));
fs.cpSync(path.join(fixtures, 'project'), projectDir, { recursive: true });

// Stub binaries: adapters only configure agents that are installed.
const binDir = path.join(home, 'bin');
fs.mkdirSync(binDir);
for (const bin of ['claude', 'copilot', 'agy', 'codex', 'opencode']) fs.writeFileSync(path.join(binDir, bin), '', { mode: 0o755 });

Object.assign(process.env, {
  PATH: `${binDir}:${process.env.PATH}`,
  HOME: home,
  CLAUDE_CONFIG_DIR: path.join(home, '.agentic-devbox/claude'),
  AGENTIC_DEVBOX_GLOBAL_DIR: path.join(fixtures, 'global'),
  AGENTIC_DEVBOX_PROJECT_DIR: projectDir,
  PROJECT_DB_URL: 'postgres://agent_ro:secret@db:5432/app',
  ISSUES_TOKEN: 'tok-123',
  GEMINI_API_KEY: 'gemini-key',
});
delete process.env.AGENTIC_DEVBOX_CDP_PORT;

const { applyAll } = await import('../lib/apply.mjs');
const { loadLayers } = await import('../lib/layers.mjs');

const state = path.join(home, '.agentic-devbox');
const json = (p) => JSON.parse(fs.readFileSync(path.join(state, p), 'utf8'));
const toml = (p) => parseToml(fs.readFileSync(path.join(state, p), 'utf8'));

const first = applyAll(loadLayers());

test('apply reports every adapter and no errors', () => {
  assert.deepEqual(first.reports.filter((r) => r.error), []);
  assert.deepEqual(first.reports.map((r) => r.id), ['skills', 'claude', 'copilot', 'agy', 'codex', 'opencode']);
  assert.equal(first.reports.find((r) => r.id === 'copilot').disabled, true);
});

test('claude: references kept verbatim, settings layered, onboarding seeded', () => {
  const cfg = json('claude/.claude.json');
  // chrome-devtools is narrowed to other agents by a project patch entry.
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), ['filesystem', 'issues', 'postgres']);
  assert.equal(cfg.mcpServers.postgres.env.PROJECT_DB_URL, '${PROJECT_DB_URL}');
  assert.equal(cfg.mcpServers.issues.headers.Authorization, 'Bearer ${ISSUES_TOKEN}');
  assert.equal(cfg.hasCompletedOnboarding, true);
  const settings = json('claude/settings.json');
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.permissions.deny, ['Read(./.env)']);
  assert.equal(settings.env.DISABLE_AUTOUPDATER, '1');
});

test('copilot: disabled in the project layer, so nothing is written', () => {
  assert.equal(fs.existsSync(path.join(state, 'copilot/mcp-config.json')), false);
});

test('agy: values expanded, agents filter honoured, Gemini provider selected', () => {
  const cfg = json('gemini/config/mcp_config.json');
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), ['chrome-devtools', 'filesystem', 'postgres']);
  assert.equal(cfg.mcpServers.postgres.env.PROJECT_DB_URL, 'postgres://agent_ro:secret@db:5432/app');
  assert.ok(cfg.mcpServers['chrome-devtools'].args.includes('--browser-url=http://127.0.0.1:9222'), 'patched server keeps its global command');
  assert.equal(json('gemini/antigravity-cli/settings.json').modelProvider, 'gemini');
});

test('codex: TOML with bearer token read from the environment', () => {
  const cfg = toml('codex/config.toml');
  assert.equal(cfg.check_for_update_on_startup, false);
  assert.equal(cfg.mcp_servers.issues.bearer_token_env_var, 'ISSUES_TOKEN');
  assert.equal(cfg.mcp_servers.issues.http_headers, undefined);
  assert.equal(cfg.mcp_servers.postgres.command, 'npx');
  assert.deepEqual(cfg.mcp_servers.postgres.env_vars, ['PROJECT_DB_URL'], 'same-name reference is forwarded, not stored');
  assert.equal(cfg.mcp_servers.postgres.env, undefined);
});

test('opencode: {env:VAR} references and command arrays', () => {
  const cfg = json('opencode/config/opencode.json');
  assert.equal(cfg.share, 'disabled');
  assert.equal(cfg.autoupdate, false);
  assert.deepEqual(cfg.mcp.postgres.command.slice(0, 3), ['npx', '-y', '@bytebase/dbhub@1.5.0']);
  assert.equal(cfg.mcp.postgres.environment.PROJECT_DB_URL, '{env:PROJECT_DB_URL}');
  assert.equal(cfg.mcp.issues.headers.Authorization, 'Bearer {env:ISSUES_TOKEN}');
  assert.equal(cfg.mcp['chrome-devtools'].command.at(-1), '--browser-url=http://127.0.0.1:9222');
});

test('shared skills and agent links point into the state folder', () => {
  assert.equal(fs.readlinkSync(path.join(home, '.agents')), path.join(state, 'agents'));
  assert.equal(fs.readlinkSync(path.join(home, '.codex')), path.join(state, 'codex'));
  assert.ok(fs.lstatSync(path.join(state, 'agents/skills/browser')).isSymbolicLink());
  assert.ok(fs.lstatSync(path.join(state, 'claude/skills/browser')).isSymbolicLink());
});

test('re-apply: tool-written keys survive, removed declarations disappear', () => {
  const claudeJson = path.join(state, 'claude/.claude.json');
  const cfg = json('claude/.claude.json');
  cfg.numStartups = 7;
  cfg.mcpServers.handmade = { type: 'stdio', command: 'my-server' };
  fs.writeFileSync(claudeJson, JSON.stringify(cfg));

  const mcp = JSON.parse(fs.readFileSync(path.join(projectDir, 'mcp-project.json'), 'utf8'));
  delete mcp.mcpServers.postgres;
  fs.writeFileSync(path.join(projectDir, 'mcp-project.json'), JSON.stringify(mcp));
  fs.writeFileSync(path.join(projectDir, 'settings-project.json'), JSON.stringify({ agents: {} }));

  const second = applyAll(loadLayers());
  assert.deepEqual(second.reports.filter((r) => r.error), []);
  const after = json('claude/.claude.json');
  assert.equal(after.numStartups, 7);
  assert.ok(after.mcpServers.handmade);
  assert.equal(after.mcpServers.postgres, undefined);
  assert.equal(json('claude/settings.json').model, undefined);
  assert.ok(fs.existsSync(path.join(state, 'copilot/mcp-config.json')), 'copilot re-enabled');
});
