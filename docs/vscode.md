# VS Code inside the sandbox

You can run VS Code against the sidecar in two ways. Both put the editor's terminal, extensions, language servers and git inside the sandbox, next to the agents, so an AI extension (Claude Code, Copilot, Codex) gets the same isolation as the CLIs.

| | Desktop VS Code | VS Code in the browser |
| --- | --- | --- |
| How | Your installed VS Code connects to the sidecar (Dev Containers extension) | The official VS Code server (`code serve-web`) runs in the sidecar; you open a URL |
| Extensions | Visual Studio Marketplace, installed into the sidecar | Visual Studio Marketplace, installed into the sidecar |
| Needs on your machine | VS Code and the Dev Containers extension | A browser |
| Turn on | Nothing to turn on | `AGENTIC_DEVBOX_VSCODE_WEB=1` and a published port |

Both store the VS Code server and its extensions in the project's `vscode-server` volume, so they survive restarts and image updates.

## Desktop VS Code

### One-time setup

1. Install [VS Code](https://code.visualstudio.com/) and the **Dev Containers** extension (`ms-vscode-remote.remote-containers`).
2. Put the `code` command on your PATH: in VS Code, run **Shell Command: Install 'code' command in PATH** from the Command Palette.
3. Make sure Docker is running.

### Open a project

Pick whichever fits your project:

**With a `.devcontainer/devcontainer.json` in the project** (the example project has one): open the project folder in VS Code and run **Dev Containers: Reopen in Container**. VS Code starts the Compose stack if needed, connects to `universal-agent`, and installs the extensions the file lists.

**Without one:** start the stack and attach from the terminal:

```bash
agentic-devbox up
agentic-devbox code                 # opens /workspace
agentic-devbox code /workspace/api  # or a sub-folder
```

`agentic-devbox code` asks your VS Code to open the folder inside the running sidecar (a `vscode-remote://attached-container+...` URI). The window then appears in **File → Open Recent**, so the next time it is one click. You can also run **Dev Containers: Attach to Running Container...** and pick the `universal-agent` container.

### A devcontainer.json for your project

```jsonc
{
  "name": "my-project (agentic-devbox)",
  "dockerComposeFile": ["../docker-compose.yml"],
  "service": "universal-agent",
  "workspaceFolder": "/workspace",
  "remoteUser": "agent",
  "updateRemoteUserUID": false,
  "overrideCommand": false,
  "shutdownAction": "none",
  "customizations": {
    "vscode": {
      "extensions": ["anthropic.claude-code", "GitHub.copilot-chat", "openai.chatgpt"]
    }
  }
}
```

Keep these settings as they are:

- `overrideCommand: false` keeps the sidecar's entrypoint, which applies agent configuration and starts the browser.
- `updateRemoteUserUID: false` stops VS Code from building a modified image to change the user id. The image already uses your uid on Linux.
- `shutdownAction: "none"` leaves the stack running when you close the window. Stop it with `agentic-devbox down`.

If your compose file has no top-level `name:`, add one. VS Code and your terminal then use the same Compose project, instead of VS Code starting a second copy of the stack. If the sandbox lives in a separate opt-in file, list both files in `dockerComposeFile` ([shared-app-environments.md](shared-app-environments.md#team-repositories-make-it-opt-in)).

### Git and SSH

Dev Containers forwards your host's SSH agent and copies your `.gitconfig` into the container. Pushing to an SSH remote works if your key is loaded in the agent on the host:

```bash
ssh-add -l                              # lists your key? then you are set
ssh-add --apple-use-keychain ~/.ssh/id_ed25519   # macOS: load it once
```

Your private keys never enter the sandbox. Only the agent socket is forwarded, and only while a VS Code window is connected.

### AI extensions inside the sidecar

Extensions installed in the window run in the sidecar. Claude Code's extension uses the same state as the `claude` CLI (`CLAUDE_CONFIG_DIR` points into the project's state folder), so you sign in once for both. MCP servers and settings from the agentic-devbox layers apply to the extensions as they do to the CLIs.

## VS Code in the browser

### Turn it on

Add two things to your project's compose file: the switch on the sidecar, and the port on the service whose network the sidecar shares.

```yaml
services:
  app:
    ports:
      - "127.0.0.1:8800:8800"   # loopback only

  universal-agent:
    network_mode: "service:app"
    environment:
      AGENTIC_DEVBOX_VSCODE_WEB: "1"
      AGENTIC_DEVBOX_VSCODE_FOLDER: /workspace   # folder to open by default
      # AGENTIC_DEVBOX_VSCODE_WEB_PORT: "8800"   # change if 8800 is taken
```

When the sidecar joins the project's networks instead of sharing a service's ([architecture.md](architecture.md#the-network-model)), publish the port on `universal-agent` itself.

Setting `AGENTIC_DEVBOX_VSCODE_WEB=1` accepts the [VS Code Server license terms](https://aka.ms/vscode-server-license) on your behalf.

### Open it

```bash
agentic-devbox up
agentic-devbox vscode-web --open    # prints http://localhost:8800/?tkn=... and opens it
```

The first start downloads the VS Code server (about 70 MB) into the `vscode-server` volume.

### The connection token

Anyone who reaches the port with the token gets a terminal in the sidecar. The token is generated on first start and stored in the project's state folder (`.agentic-devbox/home/vscode/connection-token`, mode 600). To rotate it, delete the file and restart the sidecar. Publish the port on `127.0.0.1` only; never on `0.0.0.0`.

## Troubleshooting

**Reopen in Container starts a second stack, or fails with "container name already in use".** VS Code chose a different Compose project name. Add a top-level `name:` to your compose file with the name your stack already uses (by default, the folder name).

**VS Code asks to rebuild or modify the image.** Make sure `updateRemoteUserUID` is `false`. agentic-devbox images are built with your uid by `agentic-devbox build`.

**`agentic-devbox code` opens an empty window.** The Dev Containers extension is missing or disabled, or Docker is not running.

**The browser shows "Forbidden".** The URL lacks the token. Use the URL from `agentic-devbox vscode-web`.

**`code serve-web` keeps restarting.** Read its log: `agentic-devbox run cat /run/agentic-devbox/vscode-web.log`. The usual cause is no internet access for the first download.
