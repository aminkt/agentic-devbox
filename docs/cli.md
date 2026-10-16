# Command reference

## Host: `agentic-devbox`

Run project commands in a folder whose compose file includes `base-compose.yml`. Each command maps to plain `docker` / `docker compose` commands you can also run yourself.

| Command | What it does |
| --- | --- |
| `agentic-devbox init [--app <service>]` | Create `.agentic-devbox/` and `.agentic-devbox/home/`, add them to `.gitignore` (and `.dockerignore`), print the compose lines to add |
| `agentic-devbox up` | Create state folders with your ownership, build the image if missing, `docker compose up -d --wait` |
| `agentic-devbox down` | `docker compose down`; agent state stays |
| `agentic-devbox claude \| copilot \| agy \| codex \| opencode [args]` | Run that agent in the sidecar |
| `agentic-devbox shell` | Bash login shell in the sidecar |
| `agentic-devbox run <command...>` | Any command in the sidecar |
| `agentic-devbox code [folder]` | Open desktop VS Code attached to the sidecar (default: `AGENTIC_DEVBOX_VSCODE_FOLDER` or `/workspace`) |
| `agentic-devbox vscode-web [--open]` | Print, or open, the URL of VS Code in the browser |
| `agentic-devbox browser <args>` | `devbox-browser` in the sidecar |
| `agentic-devbox config [agent]` | Merged layers and what each agent receives (secrets left as `${VAR}`) |
| `agentic-devbox apply` | Re-apply the layers without restarting the sidecar |
| `agentic-devbox doctor` | Host checks, then the sidecar's own checks |
| `agentic-devbox logs` | Follow the sidecar's logs |
| `agentic-devbox build [docker build args]` | Build `agentic-devbox:local` with your uid |
| `agentic-devbox update` | `git pull` the installation, rebuild with the latest agent CLIs |
| `agentic-devbox version` | Installed version (git describe) |

On Linux the CLI exports `AGENT_UID` and `AGENT_GID` so the image matches your user.

## Inside the sidecar

| Command | What it does |
| --- | --- |
| `agentic-devbox-config apply` | Apply the layers to every agent (runs at start) |
| `agentic-devbox-config show [agent]` | Same as `agentic-devbox config` on the host |
| `agentic-devbox-config doctor` | Browser, agents, sign-in status, last apply's warnings |
| `agentic-devbox-config mcp-check [name]` | Start each MCP server and list its tools |
| `devbox-browser status \| open \| screenshot \| console \| run` | Drive the sandbox Chrome ([browser-testing.md](browser-testing.md)) |
| `docker exec`, `docker compose exec`, `docker ps` | Forwarded to the exec bridge when it is enabled ([exec-bridge.md](exec-bridge.md)) |
| `vscode-cli` | The VS Code CLI (named so it never shadows VS Code's own `code` command) |
