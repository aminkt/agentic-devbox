# Environments with several projects in one app container

Some teams run one long-lived app container that serves several code bases: an Apache or PHP-FPM container whose web root holds `project_a/`, `project_b/` and `project_c/`, each its own git repository with its own agent instructions. The project docs tell agents to run tooling with `docker exec app ...` and use absolute paths inside that container.

One sidecar can serve the whole environment. This page shows how, using a PHP environment as the example:

```text
my-env/
├── docker-compose.yml        # defines `app` (container_name: app) with ./src mounted at /app/www
├── .env
└── src/
    └── html/
        ├── project_a/        # git repo, own AGENTS.md / .claude / .mcp.json
        ├── project_b/
        └── project_c/
```

## 1. Include the sidecar and the exec bridge

```yaml
# my-env/docker-compose.yml
name: my-env

include:
  - path:
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/exec-bridge.yml
    project_directory: .

services:
  app:
    # ... unchanged ...

  universal-agent:
    network_mode: "service:app"
    volumes:
      # Same path as in the app container, so documented paths work in both.
      - ./src:/app/www
    environment:
      AGENTIC_DEVBOX_VSCODE_FOLDER: /app/www/html
```

- **`name:`** pins the Compose project name. Your terminal and VS Code then always talk to the same stack.
- **The exec bridge** makes `docker exec app ...` work inside the sidecar ([exec-bridge.md](exec-bridge.md)).
- **The second mount** exposes the code at the same absolute path the app container uses (`/app/www/html/project_a`). Instructions such as `cd /app/www/html/project_a && php vendor/bin/phpunit` work identically on both sides. The base already mounts the whole environment at `/workspace` as well.

## 2. Keep agent state outside the web root

The state folder holds logins and tokens. It must never sit under a folder your web server serves. Many servers only block `.git`, so a `.agentic-devbox/home` inside `src/html/project_a` could be downloadable over HTTP.

The default state folder is `<env>/.agentic-devbox/home`, at the root of the environment, next to `docker-compose.yml` and outside `src/`. Keep it there. Run `agentic-devbox init` in the environment root to create it and add it to `.gitignore`.

One state folder serves all projects in the environment, which means the agents sign in once for all of them. If you need separate logins per project, run one sidecar per project instead (see the end of this page).

## 3. Let each project's own agent config apply

Agents read project instructions from the folder they start in:

- Claude Code loads `CLAUDE.md`, `.claude/settings.json`, `.claude/skills` and `.mcp.json` from its working directory.
- Copilot CLI, Codex and OpenCode read `AGENTS.md` and their project files the same way.

So start agents in the project folder:

```bash
docker compose exec -w /app/www/html/project_a universal-agent claude
```

Or open `/app/www/html/project_a` in VS Code inside the sidecar ([vscode.md](vscode.md)) and start the agent from its terminal or extension.

The agentic-devbox layers (global MCP servers, settings) apply on top, at user level. A project's own `.mcp.json` takes precedence over a user-level server with the same name.

## 4. Mount host-side helpers the projects expect

Project hooks sometimes read files from the developer's home directory, for example a telemetry or license config in `~/.config/<tool>`. Mount exactly those folders, never your whole home:

```yaml
  universal-agent:
    volumes:
      - ${HOME}/.config/some-tool:/home/agent/.config/some-tool
```

## 5. Choose the bridge policy

If the documented commands run as the container's default user (often root), the default `non-root` policy refuses them. Either pass `-u` in your commands, or allow any user:

```yaml
  agent-exec-bridge:
    environment:
      AGENTIC_DEVBOX_BRIDGE_USERS: any
```

With `any`, an agent can do in the app container whatever `docker exec` can, including as root. Read the risks in [security.md](security.md#shared-app-containers) first. Pay attention to what the app container mounts from your host (SSH keys, cloud credentials): anything the app container can read, an agent with root in it can read too.

## Team repositories: make it opt-in

Compose has no optional `include`. If you commit the include to the shared `docker-compose.yml`, every teammate without agentic-devbox installed gets an error on `docker compose up`. Put everything from steps 1, 4 and 5 into a separate file instead, and let each developer opt in from their own (gitignored) `.env`:

```yaml
# my-env/compose.agents.yml: everything agentic-devbox needs, nothing else
name: my-env
include:
  - path:
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/exec-bridge.yml
    project_directory: .
services:
  universal-agent:
    network_mode: "service:app"
    volumes:
      - ./src:/app/www
```

```bash
# my-env/.env (per developer)
COMPOSE_FILE=docker-compose.yml:compose.agents.yml
```

Compose reads `COMPOSE_FILE` from `.env`, so `docker compose up -d` and the `agentic-devbox` CLI pick up both files. In `.devcontainer/devcontainer.json`, list both: `"dockerComposeFile": ["../docker-compose.yml", "../compose.agents.yml"]`.

Turning the line on or off recreates the app container once, because Compose records which files define it. Plan the switch for a moment when nothing is running in it.

## Alternative: one sidecar per project

If projects must not share agent logins, give each project its own Compose project that joins the app container's network with `network_mode: "container:app"`:

```yaml
# my-env/agents/project_a/compose.yaml
name: project-a-agent
include:
  - path: ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
    project_directory: .
services:
  universal-agent:
    network_mode: "container:app"
    volumes:
      - ../../src/html/project_a:/workspace
    environment:
      AGENTIC_DEVBOX_CDP_PORT: "9223"   # every sidecar in one namespace needs its own Chrome port
```

Each sidecar then has its own state, caches and VS Code server. The exec bridge does not cross Compose projects, so this layout cannot use it to reach `app`.
