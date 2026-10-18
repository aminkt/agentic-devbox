# Configuration

agentic-devbox reads two layers of declarative configuration and turns them into each agent's native files every time a sidecar starts.

| Layer | Files | Applies to |
| --- | --- | --- |
| Global | `~/.config/agentic-devbox/mcp-global.json`, `settings-global.json`, `secrets.env` | Every project on this machine |
| Project | `<project>/.agentic-devbox/mcp-project.json`, `settings-project.json`, `secrets.env` | One project |

Commit the project's JSON files; never commit `secrets.env` or `home/`. After editing a layer, restart the sidecar (`agentic-devbox up`), or run `agentic-devbox apply` and restart the agent.

The installation is a git checkout, so edits to the global files are local changes; `agentic-devbox update` keeps them (`git pull --autostash`).

## MCP servers

### Format

Both MCP layers use the standard `mcpServers` format. Strings may reference environment variables as `${VAR}` or `${VAR:-default}`.

```json
{
  "$schema": "https://raw.githubusercontent.com/aminkt/agentic-devbox/main/schema/mcp.schema.json",
  "mcpServers": {
    "local-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server@1.2.3"],
      "env": { "API_TOKEN": "${SOME_API_TOKEN}" }
    },
    "remote-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${SOME_API_TOKEN}" }
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `command`, `args`, `env` | A stdio server. `npx` and `uvx` are available for Node and Python servers. |
| `type`, `url`, `headers` | A remote server: `"http"` (streamable HTTP) or `"sse"`. |
| `agents` | Only configure the server for these agents, e.g. `["claude", "codex"]`. |
| `tools` | Allowed tool names. Copilot and Codex enforce it; the other agents ignore it. |
| `disabled` | In the project layer, `true` removes a server inherited from the global layer. |

The JSON Schemas in [`schema/`](../schema/) give editors completion and validation.

### The default global servers

| Server | What it gives agents |
| --- | --- |
| `filesystem` | File tools limited to `/workspace` |
| `fetch` | Fetch a URL as Markdown |
| `chrome-devtools` | The sandbox's Chrome: navigation, input, console, network, screenshots, performance |

### Add a server for every project

Edit `~/.config/agentic-devbox/mcp-global.json`. For example, the reference memory server with its memory kept in each project's state folder, and GitHub's remote MCP server:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory@1.0.0"],
      "env": { "MEMORY_FILE_PATH": "/home/agent/.agentic-devbox/memory.jsonl" }
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    }
  }
}
```

Add the entries next to the existing ones and put `GH_TOKEN=...` in `~/.config/agentic-devbox/secrets.env`.

### Add a server for one project

The example project connects agents to its Postgres container through [DBHub](https://dbhub.ai), in read-only mode, as a role that can only read.

`.agentic-devbox/mcp-project.json`:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub@1.5.0", "--transport", "stdio", "--config", "/etc/agentic-devbox/project/dbhub.toml"],
      "env": { "PROJECT_DB_URL": "${PROJECT_DB_URL}" }
    }
  }
}
```

`.agentic-devbox/dbhub.toml` (DBHub resolves `${PROJECT_DB_URL}` itself, so the file holds no secret):

```toml
[[sources]]
id = "app"
dsn = "${PROJECT_DB_URL}"

[[tools]]
name = "execute_sql"
source = "app"
readonly = true
max_rows = 500
```

Give the sidecar the value, in the compose file for a local development database:

```yaml
  universal-agent:
    environment:
      PROJECT_DB_URL: postgres://agent_ro:agent_ro@db:5432/app
```

or in `.agentic-devbox/secrets.env` for a real secret (gitignored, mode 600):

```bash
echo 'PROJECT_DB_URL=postgres://agent_ro:s3cret@db:5432/app' >> .agentic-devbox/secrets.env
```

Everything in `.agentic-devbox/` is available inside the sidecar at `/etc/agentic-devbox/project/`, read-only. Declare every variable a server needs in its `env` block: Copilot passes only `PATH` and the declared variables to MCP servers.

### Override or remove a global server in one project

A project entry with the same name replaces the global one completely, and `"disabled": true` removes it:

```json
{
  "mcpServers": {
    "fetch": { "disabled": true },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/workspace/src", "/workspace/docs"]
    }
  }
}
```

### Narrow a global server in one project

A project entry without `command` or `url` modifies the global server of the same name instead of replacing it. Use it to change `agents`, `tools`, `env` or `headers` without repeating the definition. For example, a project that brings its own `chrome-devtools` server for Claude Code in `.mcp.json` keeps the sandbox's server for every other agent:

```json
{
  "mcpServers": {
    "chrome-devtools": { "agents": ["copilot", "agy", "codex", "opencode"] }
  }
}
```

### Check the result

```bash
agentic-devbox run agentic-devbox-config mcp-check    # starts every server and lists its tools
agentic-devbox config                                 # merged layers and per-agent output
agentic-devbox config codex                           # one agent
```

`config` leaves `${VAR}` references unresolved, so it never prints a secret. Each agent's own command works too: `claude mcp list`, `copilot mcp list`, `agy mcp list`, `codex mcp list`, `opencode mcp list`.

### What each agent receives

| Agent | Native file (in the state folder) | `${VAR}` handling |
| --- | --- | --- |
| Claude Code | `claude/.claude.json` (`mcpServers`) | Kept as written; Claude Code resolves them at launch |
| OpenCode | `opencode/config/opencode.json` (`mcp`) | Rewritten as OpenCode's `{env:VAR}` references |
| Codex CLI | `codex/config.toml` (`[mcp_servers]`) | `VAR=${VAR}` becomes `env_vars`, `Bearer ${VAR}` becomes `bearer_token_env_var`; other values are resolved |
| Copilot CLI | `copilot/mcp-config.json` | Resolved when the sidecar starts |
| Antigravity CLI | `gemini/config/mcp_config.json` | Resolved when the sidecar starts |

Resolved values land in the state folder, which is gitignored, hidden from `/workspace` inside the sidecar, and private to the project unless you share it.

## Agent settings

`settings-global.json` and `.agentic-devbox/settings-project.json` set native settings per agent. Each `settings` object is merged into that agent's own settings file, so you use the keys from the agent's documentation.

```json
{
  "agents": {
    "claude": {
      "settings": {
        "model": "opus",
        "permissions": { "allow": ["Bash(npm test *)", "mcp__postgres__*"] }
      }
    },
    "codex": { "settings": { "approval_policy": "on-request" } },
    "opencode": { "settings": { "share": "disabled" } },
    "copilot": { "enabled": false }
  }
}
```

| Agent | Settings file |
| --- | --- |
| `claude` | `claude/settings.json` |
| `copilot` | `copilot/settings.json` |
| `agy` | `gemini/antigravity-cli/settings.json` |
| `codex` | `codex/config.toml` (write the TOML keys as JSON) |
| `opencode` | `opencode/config/opencode.json` |

The merge has three inputs: what the layers declare now, what the file holds, and what was declared last time. Declared keys win. Keys the agent wrote for itself (a theme, trusted folders, session data) stay. A key you delete from a layer is deleted from the file, unless the agent changed it since.

Below both layers, each adapter adds a few defaults: auto-updates off (the image is the unit of update), and the Gemini API provider for Antigravity when `GEMINI_API_KEY` is set. The shipped global file adds Claude Code deny rules for `.env` files and `secrets/` folders.

`"enabled": false` skips an agent. To leave agents out of the image, build with `AGENTIC_DEVBOX_AGENTS="claude codex" agentic-devbox build`.

## State

Each agent keeps its logins, history and native config in one folder, bind-mounted at `/home/agent/.agentic-devbox`:

```text
.agentic-devbox/
├── mcp-project.json        # commit
├── settings-project.json   # commit
├── secrets.env             # never commit
└── home/                   # never commit
    ├── agents/skills/      # skills shared by every agent
    ├── claude/             # CLAUDE_CONFIG_DIR: .claude.json, settings.json, sessions
    ├── copilot/            # ~/.copilot
    ├── gemini/             # ~/.gemini (Antigravity CLI)
    ├── codex/              # ~/.codex
    ├── opencode/           # ~/.config/opencode, ~/.local/share/opencode, ~/.local/state/opencode
    └── vscode/             # connection token for VS Code in the browser
```

By default every project has its own `home/`. To share one state across projects on purpose (sign in once), point the bind mount at a common folder in each project's `.env`:

```bash
AGENTIC_DEVBOX_STATE_DIR=${HOME}/.agentic-devbox
```

In shared mode, each sidecar re-applies its own project's MCP servers when it starts, so the shared files reflect the project that started last. Use it for projects you trust equally.

To reset one agent in one project, stop the sidecar and delete its folder, for example `rm -rf .agentic-devbox/home/codex`.

## Environment variables

| Variable | Where | Default | Effect |
| --- | --- | --- | --- |
| `AGENTIC_DEVBOX_HOME` | shell | `~/.config/agentic-devbox` | Location of the installation |
| `AGENTIC_DEVBOX_COMPOSE` | shell or project `.env` | `docker compose` | Command the CLI runs Compose with, for projects that wrap it in a script ([workplaces.md](workplaces.md#5-a-script-around-compose)) |
| `AGENTIC_DEVBOX_STATE_DIR` | project `.env` | `./.agentic-devbox/home` | Host folder for agent state |
| `AGENTIC_DEVBOX_MEMORY` | project `.env` | `8g` | Sidecar memory limit |
| `AGENTIC_DEVBOX_BROWSER` | compose or secrets | `1` | `0` disables headless Chrome |
| `AGENTIC_DEVBOX_CDP_PORT` | compose | `9222` | Chrome DevTools port inside the namespace |
| `AGENTIC_DEVBOX_CDP_EXPOSE` | compose or secrets | `0` | `1` forwards DevTools on port 9223 |
| `AGENTIC_DEVBOX_VSCODE_WEB` | compose | `0` | `1` starts VS Code in the browser |
| `AGENTIC_DEVBOX_VSCODE_WEB_PORT` | compose | `8800` | Port of VS Code in the browser |
| `AGENTIC_DEVBOX_VSCODE_FOLDER` | compose | `/workspace` | Folder VS Code opens by default |
| `AGENTIC_DEVBOX_BRIDGE_USERS` | bridge service | `non-root` | Exec bridge user policy: `non-root` or `any` |
| `AGENT_UID`, `AGENT_GID` | shell | `1000` | Image user ids; the CLI sets them on Linux |

## Build arguments

| Argument | Default | Effect |
| --- | --- | --- |
| `AGENTIC_DEVBOX_AGENTS` | `claude copilot agy codex opencode` | Agent CLIs to install |
| `AGENTIC_DEVBOX_VSCODE_CLI` | `true` | Install the VS Code CLI for browser VS Code |
| `CLAUDE_CODE_VERSION`, `COPILOT_VERSION`, `CODEX_VERSION`, `OPENCODE_VERSION` | `latest` | Pin an agent CLI version |
| `NODE_MAJOR` | `24` | Node.js LTS line of the base image |
| `UV_VERSION` | `0.13.1` | uv release (checksums pinned next to it) |

Pass them through the CLI: `agentic-devbox build --build-arg CODEX_VERSION=0.163.0`.
