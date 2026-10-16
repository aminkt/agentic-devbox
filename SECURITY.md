# Security policy

## Report a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. You will get an acknowledgement within five working days. Fixes ship on `main`, and the advisory credits you unless you prefer otherwise.

## Supported versions

Only the latest `main` is supported. `agentic-devbox update` moves an install to it.

## What agentic-devbox protects, and what it does not

agentic-devbox runs AI coding agents in a container, so a mistaken or manipulated agent can only reach the project it was given and the network. Treat it as one layer of defence: inside that project, the agent can do anything you could.

In scope:

- Escaping the container, or gaining privileges inside it (the agent runs non-root with no Linux capabilities and `no-new-privileges`).
- An agent reading or changing another project's state while state is isolated (the default).
- Credentials leaking into places the documentation says they do not go: the image, the build context, `/workspace`, or the config files of agents that resolve `${VAR}` themselves.
- The agent rewriting its own MCP servers or settings through the read-only config mounts.

Out of scope, by design:

- Anything inside the mounted project: the agent has read-write access to `/workspace`.
- Network access: the sidecar can reach the internet unless you restrict egress (see the README).
- Behaviour of the agent CLIs, MCP servers and models themselves. Report those to their vendors.
- Shared-state mode (`AGENTIC_DEVBOX_STATE_DIR=${HOME}/.agentic-devbox`), where projects share logins and native configs on purpose.

The README's Security section explains the defaults and how to tighten them.
