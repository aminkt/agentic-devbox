// Claude Code: https://code.claude.com/docs
//
// CLAUDE_CONFIG_DIR (set in the image) moves both ~/.claude and ~/.claude.json into
// the state folder. Claude resolves ${VAR} in MCP definitions itself, so references
// are written as-is and secrets never land in .claude.json.

import { HOME } from '../lib/files.mjs';
import { compact } from './_render.mjs';

const home = process.env.CLAUDE_CONFIG_DIR ?? `${HOME}/.claude`;

export default {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  order: 10,
  home,
  dirs: [home],
  credentials: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  loginFile: `${home}/.credentials.json`,
  loginHint: 'run `claude auth login` and open the printed link, or set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`)',

  settings: {
    file: `${home}/settings.json`,
    format: 'json',
    defaults: () => ({ env: { DISABLE_AUTOUPDATER: '1' } }),
  },

  mcp: {
    file: `${home}/.claude.json`,
    format: 'json',
    path: ['mcpServers'],
    render: (s) =>
      s.type === 'stdio'
        ? compact({ type: 'stdio', command: s.command, args: s.args, env: s.env })
        : compact({ type: s.type, url: s.url, headers: s.headers }),
  },

  // Written once; Claude owns these keys afterwards.
  seed: [{ file: `${home}/.claude.json`, format: 'json', values: () => ({ hasCompletedOnboarding: true }) }],

  skillsDir: `${home}/skills`,
};
