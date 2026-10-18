# Command reference

## Host: `agentic-devbox`

Run project commands anywhere inside a project whose compose file includes `base-compose.yml`. Each command maps to plain `docker` / `docker compose` commands you can also run yourself.

- **Project root.** The CLI runs from the nearest folder at or above the current one that holds `.agentic-devbox/` (it stops below your home folder), or from the current folder when there is none.
- **Compose command.** `docker compose`, unless `AGENTIC_DEVBOX_COMPOSE` names another one, in your shell or in the project root's `.env`. Use it when the project wraps Compose in a script, for example `AGENTIC_DEVBOX_COMPOSE=./dev.sh compose`. The script must pass its arguments on to `docker compose` and keep its own messages off stdout ([workplaces.md](workplaces.md#5-a-script-around-compose)).
- **Folder.** Commands in the sidecar start in the folder that matches your current one, when you are below the project mount at the sidecar's working directory. `cd service/api && agentic-devbox claude` starts Claude Code in that repository, with its own `CLAUDE.md`.

| Command | What it does |
| --- | --- |
| `agentic-devbox init [--app <service> \| --network <name>...]` | Create `.agentic-devbox/` and `.agentic-devbox/home/`, add them to `.gitignore` (and `.dockerignore`), print the compose lines to add. `--app` shares that service's network namespace (default: `app`); `--network` joins those networks as a container of its own ([architecture.md](architecture.md#the-network-model)) |
| `agentic-devbox up` | Create state folders with your ownership, build the image if missing, `docker compose up -d --wait` |
| `agentic-devbox down` | `docker compose down`; agent state stays |
| `agentic-devbox claude \| copilot \| agy \| codex \| opencode [args]` | Run that agent in the sidecar, in the folder matching your current one |
| `agentic-devbox shell` | Bash login shell in the sidecar |
| `agentic-devbox run <command...>` | Any command in the sidecar |
| `agentic-devbox code [folder]` | Open desktop VS Code attached to the sidecar (default: the folder matching your current one, else `AGENTIC_DEVBOX_VSCODE_FOLDER` or `/workspace`) |
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
