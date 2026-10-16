# The exec bridge: `docker exec` from the sandbox

Many projects run their tooling inside the app container: `docker exec app php artisan migrate`, `docker compose exec web npm test`, a PHPUnit run in a PHP image. Project docs, AI agent instructions and VS Code tasks often hard-code these commands. The sidecar has no Docker socket, on purpose, so by default these commands fail inside the sandbox.

The exec bridge makes them work without giving the sidecar the socket. With the bridge enabled, these commands work inside the sidecar against the containers of the same Compose project:

```bash
docker exec [-i] [-t] [-u USER] [-w DIR] [-e KEY=VALUE] CONTAINER COMMAND [ARG...]
docker compose exec [-T] [-u USER] [-w DIR] [-e KEY=VALUE] SERVICE COMMAND [ARG...]
docker-compose exec ...     # legacy spelling
docker ps [--format TEMPLATE] [-q] [-a]
```

Everything else (`docker run`, `docker build`, `docker compose up`, other projects' containers) is refused.

## Enable it

List `exec-bridge.yml` as a second file of the same include entry:

```yaml
include:
  - path:
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/exec-bridge.yml
    project_directory: .
```

Then restart the stack (`agentic-devbox up`). A new service, `agent-exec-bridge`, starts first, and the sidecar waits for it.

Check it from the sidecar:

```bash
agentic-devbox run docker ps --format '{{.Names}}\t{{.Service}}\t{{.Status}}'
agentic-devbox run docker exec app sh -c 'echo hello from $(hostname)'
```

## Choose a user policy

| `AGENTIC_DEVBOX_BRIDGE_USERS` | Behaviour |
| --- | --- |
| `non-root` (default) | Refuses `root` and `0`, plus any users in `AGENTIC_DEVBOX_BRIDGE_DENY_USERS`. Requests without `-u` run as `AGENTIC_DEVBOX_BRIDGE_DEFAULT_USER` (default `1000:1000`). |
| `any` | Same as `docker exec` on your host: any user, and the container's default user (often root) when `-u` is omitted. |

Set the policy on the bridge service in your compose file:

```yaml
services:
  agent-exec-bridge:
    environment:
      AGENTIC_DEVBOX_BRIDGE_USERS: non-root
      AGENTIC_DEVBOX_BRIDGE_DENY_USERS: deploy,admin   # users with passwordless sudo, if any
```

Pick `non-root` unless the commands you need only work as root. If the target container gives a regular user passwordless sudo, add that user to `AGENTIC_DEVBOX_BRIDGE_DENY_USERS`, or non-root mode protects nothing.

## What the bridge can and cannot do

- It can run any command in any running container of **this** Compose project, as the policy allows. An agent with the bridge can do in those containers whatever you could do with `docker exec`.
- It cannot start, stop, build or delete containers, mount anything, reach containers of other projects, or run privileged execs (`--privileged` is ignored).
- It logs every exec with its target, user and command line. Read the audit trail with `docker compose logs agent-exec-bridge`.

The bridge container itself is locked down: no network (`network_mode: none`), no Linux capabilities, a read-only filesystem, and `no-new-privileges`. It runs as root inside its container only so it can open the Docker socket. Agents cannot reach that container's filesystem; they only talk to its unix socket, which lives in a volume the sidecar mounts read-only.

## TTYs, stdin and exit codes

- `-t` allocates a TTY only when your terminal is one. Agents that run `docker exec -it ...` from a script get the same output without the "input device is not a TTY" error.
- `docker compose exec` attaches stdin like Compose does; `-T` disables the TTY.
- Stdin is forwarded both ways, so `echo data | docker exec -i app cat` works.
- The exit code of the command becomes the exit code of `docker`. Bridge errors exit with 125 (bad usage) or 126 (refused or failed).
- Interactive shells (`docker exec -it app bash`) follow terminal resizes.

## Troubleshooting

**`the exec bridge is not running`.** `exec-bridge.yml` is not in the include entry, or the bridge failed to start: `docker compose logs agent-exec-bridge`.

**`no running container or service "x" in Compose project "y"`.** The bridge only sees its own project. The error lists the names it can reach; use a container name or a service name from that list.

**`user "root" is not allowed in non-root mode`.** Pass `-u <user>`, or switch the policy to `any` if root is really needed.

**`exec bridge failed to start: the bridge must run as a Docker Compose service`.** The bridge was started outside Compose. Start it through your project's compose file.
