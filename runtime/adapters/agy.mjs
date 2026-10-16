// Antigravity CLI (agy): https://antigravity.google/docs/cli
//
// ~/.gemini is linked into the state folder. With GEMINI_API_KEY set, the adapter
// selects the Gemini API model provider so agy runs headless without a browser login.

import { HOME } from '../lib/files.mjs';
import { compact } from './_render.mjs';

const home = `${HOME}/.agentic-devbox/gemini`;

export default {
  id: 'agy',
  name: 'Antigravity CLI',
  bin: 'agy',
  order: 30,
  home,
  dirs: [home, `${home}/config`, `${home}/antigravity-cli`],
  links: [[home, '~/.gemini']],
  credentials: ['GEMINI_API_KEY'],
  loginHint: 'run `agy`, open the printed sign-in URL and paste the code back, or set GEMINI_API_KEY',

  settings: {
    file: `${home}/antigravity-cli/settings.json`,
    format: 'json',
    defaults: (ctx) => (ctx.env.GEMINI_API_KEY ? { modelProvider: 'gemini' } : {}),
  },

  mcp: {
    file: `${home}/config/mcp_config.json`,
    format: 'json',
    path: ['mcpServers'],
    render: (s, ctx) =>
      s.type === 'stdio'
        ? compact({ command: s.command, args: ctx.expand(s.args), env: ctx.expand(s.env), disabled: false })
        : compact({ serverUrl: ctx.expand(s.url), headers: ctx.expand(s.headers), disabled: false }),
  },

  skillsDir: `${home}/config/skills`,
};
