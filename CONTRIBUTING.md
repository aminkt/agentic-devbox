# Contributing to agentic-devbox

Thanks for helping. This guide covers the local setup, the checks every change must pass, and the two most common contributions: supporting a new AI coding tool and bumping a pinned version.

## Set up a development checkout

```bash
git clone https://github.com/aminkt/agentic-devbox.git
cd agentic-devbox
./install.sh            # links ~/.config/agentic-devbox to this checkout and builds the image
```

Because the install is a symlink, every edit in your checkout is live for all your projects. Rebuild the image after changing `Dockerfile.agents` or anything under `runtime/`:

```bash
agentic-devbox build
```

## Run the checks

All four run in CI on every pull request, on both amd64 and arm64.

```bash
# Unit tests for the config engine and every adapter
cd runtime && npm ci && npm test && cd ..

# Shell and Dockerfile lint
shellcheck install.sh bin/agentic-devbox runtime/entrypoint.sh runtime/profile.d/agentic-devbox.sh runtime/bin/docker-compose tests/smoke.sh
hadolint --config .hadolint.yaml Dockerfile.agents

# End-to-end: starts the example project and checks isolation, browser, agents, MCP and DB access
tests/smoke.sh
```

Set `KEEP=1` to leave the smoke-test stack running so you can look inside it.

## Repository layout

| Path | What it is |
| --- | --- |
| `Dockerfile.agents` | The sidecar image: toolchain, Chrome, agent CLIs, runtime |
| `base-compose.yml` | The `universal-agent` service every project includes |
| `exec-bridge.yml` | Optional `docker exec` bridge service |
| `mcp-global.json`, `settings-global.json` | Global configuration layers (users edit these in place) |
| `env/passthrough.env` | Credential variables forwarded from the host shell |
| `runtime/` | Code baked into the image: entrypoint, config engine, adapters, `devbox-browser`, the bridge server and `docker` client, skills |
| `docs/` | User documentation |
| `bin/agentic-devbox` | Host CLI |
| `project-template/` | Example project; also the source of the snippet `agentic-devbox init` prints |
| `schema/` | JSON Schemas for the configuration layers (editor validation) |
| `tests/smoke.sh` | End-to-end test |

## Add support for another AI coding tool

Each tool is one adapter module in `runtime/adapters/`. The engine discovers every `*.mjs` file there (files starting with `_` are helpers), so adding a tool never touches a central list.

1. **Install it in the image.** Add a case for its id to the agent loop in `Dockerfile.agents` (npm package), or a separate `RUN` step guarded by the same `AGENTIC_DEVBOX_AGENTS` check (native installer). Add the id to the default `AGENTIC_DEVBOX_AGENTS` list.
2. **Write the adapter.** Create `runtime/adapters/<id>.mjs` exporting the object below. Keep the tool's state under `~/.agentic-devbox/<id>` so it lands in the project's state folder, and link the tool's default paths there.
3. **Add credentials.** List the tool's credential variables in `env/passthrough.env`.
4. **Test it.** Extend `runtime/test/apply.test.mjs` with assertions on the native files, add a stub binary name to the test's stub list, and add a `--version` and a config check to `tests/smoke.sh`.
5. **Document it.** Add a row to the agents table and the authentication table in the README.

### The adapter contract

```js
export default {
  id: 'mytool',                 // used in settings files and the "agents" MCP filter
  name: 'My Tool',              // shown in reports
  bin: 'mytool',                // command name; the adapter is skipped when it is not on PATH
  order: 60,                    // apply order (lower first)
  home: '/home/agent/.agentic-devbox/mytool',  // state folder; holds the apply record
  dirs: ['...'],                // folders to create before applying
  links: [['/home/agent/.agentic-devbox/mytool', '~/.mytool']],  // [target, link] symlinks
  credentials: ['MYTOOL_API_KEY'],  // env vars that sign the tool in (doctor output)
  loginFile: '/home/agent/.agentic-devbox/mytool/auth.json',  // optional: file that proves a login
  loginHint: 'run `mytool login`, or set MYTOOL_API_KEY',

  settings: {                   // optional: native settings file
    file: '/home/agent/.agentic-devbox/mytool/config.json',
    format: 'json',             // 'json' or 'toml'
    defaults: (ctx) => ({ autoUpdate: false }),  // lowest layer, below settings-global.json
  },

  mcp: {                        // optional: where MCP servers go
    file: '/home/agent/.agentic-devbox/mytool/config.json',
    format: 'json',
    path: ['mcpServers'],       // key path inside the file
    // server: { type, command, args, env, url, headers, tools } with defaults filled in.
    // Return the native entry, or null to skip this server for this tool.
    render: (server, ctx, name) => ({ command: server.command, args: ctx.expand(server.args) }),
  },

  seed: [],                     // optional: [{ file, format, values: (ctx) => ({...}) }], written once
  skillsDir: '...',             // optional: only if the tool does not read ~/.agents/skills
};
```

`ctx` gives you `env` (the container environment), `expand(value)` to resolve `${VAR}` references now, `warn(message)` to report a problem, and `cdpPort`. Keep references unexpanded when the tool resolves them itself, so secrets stay out of its files (see the Claude and OpenCode adapters).

The engine merges what you return into the native file with a three-way merge: declared keys win, keys the tool writes for itself are kept, and keys removed from a layer are removed from the file. You never write files yourself.

## Bump a pinned version

- **uv**: update `UV_VERSION` and both `UV_SHA256_*` values in `Dockerfile.agents`. Take the checksums from the release's `.sha256` files.
- **MCP servers in `mcp-global.json`**: update the version in the package spec. The image build pre-downloads exactly those versions, so a mismatch only costs a download at first use.
- **Agent CLIs** default to `latest`; pin one with its build arg (for example `--build-arg CODEX_VERSION=0.163.0`).

## Pull requests

- One topic per pull request, with a description of what changed and how you tested it.
- Keep the "no copy" rule: projects reference the sandbox's files and never receive copies of them. If a feature needs per-project files, `agentic-devbox init` creates folders or appends single lines to existing files.
- Security-relevant changes (capabilities, mounts, credential handling) need a note in the README's Security section.

Report security issues privately as described in [SECURITY.md](SECURITY.md), not in public issues.
