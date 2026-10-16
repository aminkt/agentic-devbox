// GitHub Copilot CLI: https://docs.github.com/copilot/how-tos/copilot-cli
//
// ~/.copilot is linked into the state folder. Copilot reads personal skills from
// ~/.agents/skills, which the sandbox provides for every agent.

import { HOME } from '../lib/files.mjs';
import { allTools, compact } from './_render.mjs';

const home = `${HOME}/.agentic-devbox/copilot`;

export default {
  id: 'copilot',
  name: 'Copilot CLI',
  bin: 'copilot',
  order: 20,
  home,
  dirs: [home],
  links: [[home, '~/.copilot']],
  credentials: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
  loginHint: 'run `copilot login --device-code`, or set COPILOT_GITHUB_TOKEN (fine-grained PAT with "Copilot Requests")',

  settings: {
    file: `${home}/settings.json`,
    format: 'json',
    defaults: () => ({ autoUpdate: false }),
  },

  mcp: {
    file: `${home}/mcp-config.json`,
    format: 'json',
    path: ['mcpServers'],
    render: (s, ctx) =>
      s.type === 'stdio'
        ? compact({ type: 'local', command: s.command, args: ctx.expand(s.args), env: ctx.expand(s.env), tools: allTools(s.tools) ?? ['*'] })
        : compact({ type: s.type, url: ctx.expand(s.url), headers: ctx.expand(s.headers), tools: allTools(s.tools) ?? ['*'] }),
  },
};
