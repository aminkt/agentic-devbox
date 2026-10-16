# Security

> [!WARNING]
> An AI agent in this sandbox can read, change and delete everything in the project you mount, run any command inside the container, and reach the internet. The sandbox protects your machine and your other projects. It cannot protect the project you give the agent. Commit or back up your work before you let an agent run unattended.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What the sidecar does by default

- Runs as an unprivileged user whose uid matches yours on Linux. The container never runs as root.
- Drops all Linux capabilities (`cap_drop: ALL`) and sets `no-new-privileges`.
- Mounts the configuration layers read-only and hides `/workspace/.agentic-devbox`, so agents cannot read stored logins through the workspace or add MCP servers to themselves.
- Keeps the browser profile and rendered runtime files in memory (`tmpfs`).
- Limits memory (`AGENTIC_DEVBOX_MEMORY`, default 8g) and processes (4096).
- Has no Docker socket. The optional exec bridge holds it in a separate container instead ([exec-bridge.md](exec-bridge.md)).
- Builds from an allowlist `.dockerignore`, so `secrets.env` never enters the build context.

## Handle credentials deliberately

- Put long-lived keys in `~/.config/agentic-devbox/secrets.env` (all projects) or `.agentic-devbox/secrets.env` (one project). Both are created with mode 600 and gitignored. Never put keys in a compose file or another committed file.
- Prefer scoped tokens: a fine-grained GitHub PAT with only "Copilot Requests", a database role that can only read, an API key with a spending limit.
- Agents still see their own environment variables, as any process does.
- If your app's Dockerfile copies the project directory, make sure `.dockerignore` excludes `.agentic-devbox/`, or agent logins end up in your app image. `agentic-devbox init` adds the line when a `.dockerignore` exists.
- Never put the state folder under a directory your web server serves ([shared-app-environments.md](shared-app-environments.md#2-keep-agent-state-outside-the-web-root)).

## Never mount your host's root, home folder or Docker socket

The sidecar should see one project. Do not add mounts such as `/:/host`, `${HOME}:/home/you` or `/var/run/docker.sock:/var/run/docker.sock`. Each of them hands the agent your whole machine: your SSH keys, browser profile, cloud credentials, or with the Docker socket, root on the host. If an agent needs a second repository, mount just that folder, read-only if it only reads it:

```yaml
  universal-agent:
    volumes:
      - ../shared-lib:/workspace-extra/shared-lib:ro
```

When a project expects a config file from your home directory, mount that one folder, not `${HOME}`.

## Choose the agent's permission mode on purpose

Every agent has a mode that skips confirmation prompts (`claude --dangerously-skip-permissions`, `copilot --allow-all-tools`, `codex --dangerously-bypass-approvals-and-sandbox`, `agy --dangerously-skip-permissions`). The container limits the damage to the project and the network, which is why people use these modes in a sandbox. That limit only holds with the rules on this page: no host mounts, scoped credentials, and restricted egress for sensitive projects.

## Restrict internet access

The agent shares the app's network namespace, so egress rules apply to both. The sidecar never gets `NET_ADMIN`, so an agent cannot change firewall rules.

**Offline mode** cuts the app, its database and the agents off from the internet while they can still reach each other. Save this next to your compose file as `compose.offline.yml`:

```yaml
services:
  app:
    networks: [project]
  db:
    networks: [project]

networks:
  project:
    internal: true
```

```bash
docker compose -f docker-compose.yml -f compose.offline.yml up -d --wait
```

Offline mode suits running tests and browser checks on code an agent wrote, or agents that use a model server inside the project network. Hosted model APIs are unreachable, and so are ports published to your host.

**An allowlist proxy** keeps hosted models working. Add a forward proxy (Squid, Tinyproxy or similar) attached to both the internal network and the default network, allow only the domains your agents need (their model APIs, `registry.npmjs.org`, `pypi.org` and `files.pythonhosted.org` for MCP servers, `github.com` if they push), and set `HTTPS_PROXY=http://<proxy>:<port>` and `NO_PROXY=localhost,127.0.0.1,db` on the sidecar. Claude Code and Copilot CLI document `HTTPS_PROXY` support; check each agent's network documentation for the domains it uses.

## Know the browser's trade-offs

Chrome runs with `--no-sandbox`, because its own sandbox needs kernel features that Docker's default seccomp profile blocks. The container is the boundary instead. Use the sandbox browser to test your own app, not to browse untrusted sites with real accounts. `AGENTIC_DEVBOX_BROWSER_IGNORE_CERT_ERRORS=1` turns off certificate checks; enable it only for local apps with self-signed certificates.

## VS Code

Desktop VS Code forwards your SSH agent socket into the sidecar while a window is connected; your private keys stay on your machine. VS Code in the browser is protected by a connection token: anyone with the URL gets a terminal in the sidecar, so publish its port on `127.0.0.1` only ([vscode.md](vscode.md#the-connection-token)).

## Treat MCP servers as code you run

An MCP server runs with the agent's permissions inside the container. Pin versions (as the shipped config does), prefer servers from vendors you trust, and review a server before adding it to the global layer, where it reaches every project. The `fetch` server can request any URL, which an agent could use to send data out; remove it with `"disabled": true` in projects that hold sensitive data.

## Give databases a least-privilege role

Connect MCP servers to a role that has only the rights the agent needs. The example's `db/init.sql` creates `agent_ro` with `SELECT` grants and `default_transaction_read_only = on`, and DBHub adds its own read-only check on top. The smoke test proves that `agent_ro` cannot insert rows.

## Shared app containers

With the exec bridge, an agent can do in the project's other containers whatever `docker exec` allows under the policy you chose. Look at those containers with an attacker's eyes:

- What do they mount from your host? An app container that mounts `~/.ssh`, `~/.aws` or a cloud credentials file exposes it to any agent that can run code there.
- Who can become root? A user with passwordless sudo is root in practice. In `non-root` mode, add such users to `AGENTIC_DEVBOX_BRIDGE_DENY_USERS`.
- Can code the agent writes run with more rights than the agent? A web server that executes project files (PHP, CGI) as a sudo-capable user lets an agent escalate by writing a file and requesting it. Remove passwordless sudo from such users, or remove sensitive host mounts from that container.
