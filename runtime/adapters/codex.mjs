// OpenAI Codex CLI: https://developers.openai.com/codex
//
// ~/.codex is linked into the state folder; settings and MCP servers share config.toml.
// Headers and env values that are a single ${VAR} become Codex's *_env_var fields, so
// Codex reads the secret from its environment instead of from the file.

import { HOME } from '../lib/files.mjs';
import { allTools, compact, soleRef } from './_render.mjs';

const home = `${HOME}/.agentic-devbox/codex`;

function renderEnv(env, ctx) {
  const literal = {};
  const forwarded = [];
  for (const [key, value] of Object.entries(env)) {
    if (soleRef(value) === key) forwarded.push(key);
    else literal[key] = ctx.expand(value);
  }
  return { env: literal, env_vars: forwarded };
}

function renderHeaders(headers, ctx) {
  const out = { http_headers: {}, env_http_headers: {} };
  for (const [name, value] of Object.entries(headers)) {
    const bearer = typeof value === 'string' && value.match(/^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    if (name.toLowerCase() === 'authorization' && bearer) out.bearer_token_env_var = bearer[1];
    else if (soleRef(value)) out.env_http_headers[name] = soleRef(value);
    else out.http_headers[name] = ctx.expand(value);
  }
  return out;
}

export default {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  order: 40,
  home,
  dirs: [home],
  links: [[home, '~/.codex']],
  // Codex stores its login in auth.json; an API key is handed over once via stdin.
  credentials: [],
  loginFile: `${home}/auth.json`,
  loginHint: 'run `codex login --device-auth`, or `printenv OPENAI_API_KEY | codex login --with-api-key`',

  settings: {
    file: `${home}/config.toml`,
    format: 'toml',
    defaults: () => ({ check_for_update_on_startup: false }),
  },

  mcp: {
    file: `${home}/config.toml`,
    format: 'toml',
    path: ['mcp_servers'],
    render: (s, ctx, name) => {
      if (s.type === 'sse') {
        ctx.warn(`codex: MCP server "${name}" uses SSE, which Codex does not support; skipped for Codex`);
        return null;
      }
      const tools = allTools(s.tools);
      return s.type === 'stdio'
        ? compact({ command: s.command, args: ctx.expand(s.args), ...renderEnv(s.env, ctx), enabled_tools: tools })
        : compact({ url: ctx.expand(s.url), ...renderHeaders(s.headers, ctx), enabled_tools: tools });
    },
  },
};
