#!/usr/bin/env bash
# agentic-devbox entrypoint. Runs as the unprivileged `agent` user under tini.
#
#   1. Applies the declarative layers (MCP servers, per-agent settings, skills) to
#      every agent's native config inside the state folder.
#   2. Starts headless Chrome with DevTools on 127.0.0.1:${AGENTIC_DEVBOX_CDP_PORT}
#      and keeps it running.
#   3. Optionally forwards DevTools to the host (AGENTIC_DEVBOX_CDP_EXPOSE=1).
#   4. Hands over to the container command (default: sleep infinity).
set -euo pipefail

log() { printf '[agentic-devbox] %s\n' "$*" >&2; }

state_dir="${AGENTIC_DEVBOX_STATE:-${HOME}/.agentic-devbox}"
run_dir="${AGENTIC_DEVBOX_RUN:-/run/agentic-devbox}"
cdp_port="${AGENTIC_DEVBOX_CDP_PORT:-9222}"

mkdir -p "${run_dir}"

if ! touch "${state_dir}/.write-test" 2>/dev/null; then
  log "ERROR: ${state_dir} is not writable by uid $(id -u)."
  log "Docker probably created the host folder as root (Linux). Fix it on the host with:"
  log "  sudo chown -R $(id -u):$(id -g) <host folder bound to ${state_dir}>"
  log "or start the project with 'agentic-devbox up', which creates it with your ownership."
  exit 1
fi
rm -f "${state_dir}/.write-test"

if ! agentic-devbox-config apply; then
  log "WARNING: applying agent configuration failed; agents keep their previous settings."
fi

start_browser() {
  local shm_kb extra=()
  shm_kb="$(df -k /dev/shm | awk 'NR==2 {print $2}')"
  # Small /dev/shm (plain `docker run`) crashes Chrome; fall back to /tmp.
  if [[ "${shm_kb:-0}" -lt 524288 ]]; then extra+=(--disable-dev-shm-usage); fi
  # For local apps with self-signed certificates only; never for browsing the internet.
  if [[ "${AGENTIC_DEVBOX_BROWSER_IGNORE_CERT_ERRORS:-0}" == "1" ]]; then extra+=(--ignore-certificate-errors); fi

  while true; do
    rm -rf "${run_dir}/chrome-profile"
    # Each start gets a fresh, throwaway profile: no cookies or logins survive.
    "${CHROME_PATH}" \
      --headless \
      --remote-debugging-port="${cdp_port}" \
      --user-data-dir="${run_dir}/chrome-profile" \
      --no-sandbox \
      --no-first-run \
      --no-default-browser-check \
      --disable-gpu \
      --disable-background-networking \
      --disable-component-update \
      --disable-default-apps \
      --disable-sync \
      --disable-features=Translate,MediaRouter,OptimizationHints \
      --metrics-recording-only \
      --mute-audio \
      --hide-scrollbars \
      --window-size=1280,800 \
      "${extra[@]}" \
      about:blank >"${run_dir}/chrome.log" 2>&1 || true
    log "Chrome exited; restarting in 2s (log: ${run_dir}/chrome.log)."
    sleep 2
  done
}

if [[ "${AGENTIC_DEVBOX_BROWSER:-1}" != "0" ]]; then
  start_browser &
  log "Headless Chrome DevTools: http://127.0.0.1:${cdp_port}"
fi

# VS Code in the browser (official `code serve-web`). Setting AGENTIC_DEVBOX_VSCODE_WEB=1
# accepts the VS Code Server license terms on your behalf.
start_vscode_web() {
  local port="${AGENTIC_DEVBOX_VSCODE_WEB_PORT:-8800}"
  local token_file="${state_dir}/vscode/connection-token"
  mkdir -p "${state_dir}/vscode"
  if [[ ! -s "${token_file}" ]]; then
    (umask 077 && head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' >"${token_file}")
  fi
  while true; do
    vscode-cli serve-web \
      --host 0.0.0.0 \
      --port "${port}" \
      --connection-token-file "${token_file}" \
      --accept-server-license-terms \
      --disable-telemetry \
      --cli-data-dir "${HOME}/.vscode-server/cli" \
      --server-data-dir "${HOME}/.vscode-server/serve-web" \
      --default-folder "${AGENTIC_DEVBOX_VSCODE_FOLDER:-/workspace}" \
      >"${run_dir}/vscode-web.log" 2>&1 || true
    log "VS Code (browser) exited; restarting in 5s (log: ${run_dir}/vscode-web.log)."
    sleep 5
  done
}

if [[ "${AGENTIC_DEVBOX_VSCODE_WEB:-0}" == "1" ]]; then
  if command -v vscode-cli >/dev/null; then
    start_vscode_web &
    log "VS Code in the browser: port ${AGENTIC_DEVBOX_VSCODE_WEB_PORT:-8800} (run 'agentic-devbox vscode' on the host for the URL)."
  else
    log "WARNING: AGENTIC_DEVBOX_VSCODE_WEB=1 but the image was built without the VS Code CLI."
  fi
fi

if [[ "${AGENTIC_DEVBOX_CDP_EXPOSE:-0}" == "1" ]]; then
  expose_port="${AGENTIC_DEVBOX_CDP_EXPOSE_PORT:-9223}"
  socat "TCP-LISTEN:${expose_port},fork,reuseaddr,bind=0.0.0.0" "TCP:127.0.0.1:${cdp_port}" &
  log "DevTools forwarded on 0.0.0.0:${expose_port} (publish it on the app service as 127.0.0.1:${expose_port}:${expose_port})."
fi

exec "$@"
