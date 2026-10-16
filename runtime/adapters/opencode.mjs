// OpenCode: https://opencode.ai/docs
//
// OpenCode follows XDG paths; its config, data (logins) and state folders are linked
// into the state folder. ${VAR} references become OpenCode's own {env:VAR} syntax.

import { rewriteRefs, mapStrings } from '../lib/expand.mjs';
import { HOME } from '../lib/files.mjs';
import { compact } from './_render.mjs';

const home = `${HOME}/.agentic-devbox/opencode`;

const toOpenCodeRefs = (value, ctx) =>
  mapStrings(value, (s) =>
    rewriteRefs(s, (name, fallback) => (ctx.env[name] || fallback === undefined ? `{env:${name}}` : fallback)),
  );

export default {
  id: 'opencode',
  name: 'OpenCode',
  bin: 'opencode',
  order: 50,
  home,
  dirs: [`${home}/config`, `${home}/data`, `${home}/state`],
  links: [
    [`${home}/config`, '~/.config/opencode'],
    [`${home}/data`, '~/.local/share/opencode'],
    [`${home}/state`, '~/.local/state/opencode'],
  ],
  credentials: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY'],
  loginFile: `${home}/data/auth.json`,
  loginHint: 'run `opencode auth login`, or set a provider key such as ANTHROPIC_API_KEY',

  settings: {
    file: `${home}/config/opencode.json`,
    format: 'json',
    defaults: () => ({ $schema: 'https://opencode.ai/config.json', autoupdate: false }),
  },

  mcp: {
    file: `${home}/config/opencode.json`,
    format: 'json',
    path: ['mcp'],
    render: (s, ctx) =>
      s.type === 'stdio'
        ? compact({ type: 'local', command: toOpenCodeRefs([s.command, ...s.args], ctx), environment: toOpenCodeRefs(s.env, ctx), enabled: true })
        : compact({ type: 'remote', url: toOpenCodeRefs(s.url, ctx), headers: toOpenCodeRefs(s.headers, ctx), enabled: true }),
  },
};
