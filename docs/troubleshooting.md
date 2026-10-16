# Troubleshooting

Start with `agentic-devbox doctor` in the project folder. It checks Docker, the Compose version, the installation, the image and, when the sidecar runs, the browser, every agent and the last configuration apply.

## Installing and starting

**`include` error mentioning `base-compose.yml`.** agentic-devbox is not installed on this machine, or `AGENTIC_DEVBOX_HOME` points elsewhere. Run the installer, then `agentic-devbox doctor`.

**`services.universal-agent conflicts with imported resource`.** Your Compose is older than v5. Upgrade it, or move the `universal-agent` block into its own file and list it as a second file of the include entry. This form resolves on Compose 5.4; CI does not cover older releases.

```yaml
include:
  - path:
      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml
      - ./agentic-devbox.override.yml   # contains: services: universal-agent: network_mode: "service:app"
    project_directory: .
```

**`ERROR: /home/agent/.agentic-devbox is not writable` (Linux).** Docker created the state folder as root because it did not exist. Run `sudo chown -R "$(id -u):$(id -g)" .agentic-devbox`, then `agentic-devbox up`. The CLI creates the folder with your ownership, which avoids this.

**Files the agent creates are owned by another user (Linux).** The image was built with a different uid. Rebuild with `agentic-devbox build`, which uses your uid, then `agentic-devbox up`.

**`port is already allocated`.** Two projects publish the same host port. Change the left side of the mapping in one of them. Ports inside each sidecar, such as 9222, never clash between projects, because every project has its own network namespace.

**`docker pull` or the first build hangs.** Docker Desktop's registry proxy can stall while containers still reach the internet. Restart Docker Desktop, check its proxy settings, then run `agentic-devbox build` again.

## Agents

**An agent asks you to sign in again.** State is per project by default, so each new project starts signed out. Sign in once per project, put a token in the global `secrets.env`, or share state with `AGENTIC_DEVBOX_STATE_DIR`.

**An agent says it is out of date.** Agent updates come with the image: `agentic-devbox update`, then `agentic-devbox up` in each project.

**An MCP server is missing or failing.** `agentic-devbox run agentic-devbox-config mcp-check` starts each server and shows its error. `agentic-devbox config <agent>` shows what the agent received. Warnings from the last start are listed by `agentic-devbox doctor`.

**Claude Code shows a project MCP server as "Pending approval".** Run `claude` in that project folder once and approve it, or trust the folder when asked.

**A command is missing in a login shell.** Rebuild the image (`agentic-devbox build`); images built before the `/etc/profile.d` fix lost `/opt/agentic-devbox/bin` in login shells.

## Browser

**Chrome DevTools not reachable.** Run `agentic-devbox doctor`, then read the log: `agentic-devbox run cat /run/agentic-devbox/chrome.log`. A `docker run` without `--shm-size` makes Chrome fall back to `/tmp`, which is slower but works.

**`net::ERR_CERT_AUTHORITY_INVALID`.** The app uses a self-signed certificate; see [browser-testing.md](browser-testing.md#self-signed-certificates).

## VS Code and the exec bridge

See the troubleshooting sections of [vscode.md](vscode.md#troubleshooting) and [exec-bridge.md](exec-bridge.md#troubleshooting).
