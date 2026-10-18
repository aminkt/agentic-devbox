# Getting started

This guide takes you from nothing to an agent working on your own project. It takes about fifteen minutes, most of it the first image build.

## Requirements

- Docker Engine with the Compose plugin **v5.0 or newer** (`docker compose version`). Docker Desktop on macOS and Windows ships it. Tested with Docker 29.7 and Compose 5.4.
- macOS (Apple Silicon or Intel) or Linux (amd64 or arm64). On Windows, run everything inside WSL 2.
- About 5 GB of disk for the image, which holds five agent CLIs, Chrome, the VS Code CLI and a Node.js and Python toolchain.
- Optional: VS Code with the Dev Containers extension ([vscode.md](vscode.md)).

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/aminkt/agentic-devbox/main/install.sh | bash
```

The installer:

1. checks Docker and the Compose version,
2. clones this repository into `~/.config/agentic-devbox` (from a local checkout, `./install.sh` links that folder to your checkout instead),
3. creates `~/.config/agentic-devbox/secrets.env` with mode 600,
4. links the `agentic-devbox` command into `~/.local/bin`,
5. builds the image `agentic-devbox:local` with your user id.

Run `agentic-devbox doctor` to check the result. If `agentic-devbox` is not found, add `~/.local/bin` to your PATH.

To install only some agents and keep the image smaller:

```bash
AGENTIC_DEVBOX_AGENTS="claude codex" agentic-devbox build
```

## 2. Try the example project

```bash
cd ~/.config/agentic-devbox/project-template
agentic-devbox up        # app on :3000, Postgres, and the sidecar; waits until healthy
agentic-devbox doctor    # versions, browser, sign-in status
```

The example is a small notes app with a database and a read-only database role for the agents. Open `http://localhost:3000` in your own browser to see it.

## 3. Sign in

Sign in inside the sidecar. Logins are stored in the project's state folder (`.agentic-devbox/home`), so they survive restarts and image updates. They are per project by default.

| Agent | Run in the sidecar | Or put in `secrets.env` |
| --- | --- | --- |
| Claude Code | `claude auth login`, open the link, paste the code | `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` |
| Copilot CLI | `copilot login --device-code` | `COPILOT_GITHUB_TOKEN` (fine-grained PAT with "Copilot Requests") |
| Antigravity CLI | `agy`, open the printed URL, paste the code back | `GEMINI_API_KEY` |
| Codex CLI | `codex login --device-auth` | none; with a key, run `printenv OPENAI_API_KEY \| codex login --with-api-key` once |
| OpenCode | `opencode auth login` | a provider key such as `ANTHROPIC_API_KEY` |

For example: `agentic-devbox run claude auth login`.

Tokens in `~/.config/agentic-devbox/secrets.env` sign every project in at once. Tokens in `<project>/.agentic-devbox/secrets.env` apply to one project. Your shell environment wins over both. [`env/passthrough.env`](../env/passthrough.env) lists every supported variable.

## 4. Work with an agent

```bash
agentic-devbox claude                    # interactive session in /workspace
agentic-devbox codex exec "add input validation to POST /api/notes and test it in the browser"
agentic-devbox shell                     # a bash shell in the sidecar
agentic-devbox down                      # stop; state stays in .agentic-devbox/home
```

Or work in VS Code inside the sidecar: `agentic-devbox code` ([vscode.md](vscode.md)).

The example app runs with `node --watch`, so an agent's edit restarts the server within about two seconds, and the agent can check its change in the browser right away ([browser-testing.md](browser-testing.md)).

## 5. Add the sidecar to your own project

```bash
cd /path/to/your/project
agentic-devbox init --app web     # "web" is the compose service the agent should attach to
```

`init` creates `.agentic-devbox/` and `.agentic-devbox/home/`, adds the state folder and `secrets.env` to `.gitignore`, adds `.agentic-devbox/` to `.dockerignore` when you have one, and prints the lines to add to your compose file:

```yaml
include:
  - path: ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
    project_directory: .

services:
  web:
    # ... your existing service ...

  universal-agent:
    network_mode: "service:web"
```

`network_mode: "service:web"` puts the agent in `web`'s network namespace, so `localhost` in the agent is your app. When there is no single app to attach to, for example several services behind a reverse proxy, run `agentic-devbox init --network default` instead: the sidecar becomes its own container on the project's network and reaches services by name and network alias. [architecture.md](architecture.md#the-network-model) compares the two.

Then run `agentic-devbox up`. Next steps:

- Add project MCP servers and agent settings: [configuration.md](configuration.md).
- Let agents run commands in your other containers: [exec-bridge.md](exec-bridge.md).
- Several projects served by one app container: [shared-app-environments.md](shared-app-environments.md).
- Several services and repositories, a reverse proxy, or a script around Compose: [workplaces.md](workplaces.md).
- Before running agents unattended: [security.md](security.md).

## Update and uninstall

```bash
agentic-devbox update     # git pull + rebuild with the latest agent CLIs
agentic-devbox up         # in each project, to switch to the new image
```

To uninstall:

```bash
# In each project
docker compose down -v && rm -rf .agentic-devbox/home

# Once per machine
rm ~/.local/bin/agentic-devbox
rm -rf ~/.config/agentic-devbox     # with ./install.sh this removes only the symlink to your checkout
docker image rm agentic-devbox:local
```
