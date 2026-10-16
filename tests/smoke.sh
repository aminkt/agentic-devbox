#!/usr/bin/env bash
# End-to-end smoke test: starts the example project with the sidecar and checks that the
# sandbox works as documented. Requires the image (agentic-devbox:local) to be built.
#
#   tests/smoke.sh            # run, then tear everything down
#   KEEP=1 tests/smoke.sh     # leave the stack running for inspection
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AGENTIC_DEVBOX_HOME="${repo}"
project="agentic-devbox-smoke"
work="$(mktemp -d "${TMPDIR:-/tmp}/agentic-devbox-smoke.XXXXXX")"
# A throwaway copy keeps test state out of the repository's own example folder.
cp -R "${repo}/project-template/." "${work}/"
find "${work}/.agentic-devbox/home" -mindepth 1 ! -name .gitkeep -exec rm -rf {} + 2>/dev/null || true
mkdir -p "${work}/.agentic-devbox/home"
cd "${work}"

# Also exercise the optional features: the exec bridge (second file of the include entry)
# and VS Code in the browser (on a port that does not clash with a running example).
python3 - "${work}/docker-compose.yml" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
old = "  - path: ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml\n"
new = ("  - path:\n"
       "      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/base-compose.yml\n"
       "      - ${AGENTIC_DEVBOX_HOME:-${HOME}/.config/agentic-devbox}/exec-bridge.yml\n")
assert old in text, "include line not found in the template"
open(path, "w").write(text.replace(old, new))
EOF
cat >compose.smoke.yml <<'EOF'
services:
  app:
    ports:
      - "127.0.0.1:18800:18800"
  universal-agent:
    volumes:
      # Projects mount host config folders under ~/.config; adapters must still work.
      - ./app:/home/agent/.config/example-tool:ro
    environment:
      AGENTIC_DEVBOX_VSCODE_WEB: "1"
      AGENTIC_DEVBOX_VSCODE_WEB_PORT: "18800"
EOF
export COMPOSE_FILE="docker-compose.yml:compose.smoke.yml"

compose() { docker compose -p "${project}" "$@"; }
in_agent() { compose exec -T universal-agent "$@"; }
cleanup() {
  if [[ "${KEEP:-0}" == "1" ]]; then
    echo "Stack left running: cd ${work} && docker compose -p ${project} ..."
  else
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "${work}"
  fi
}
trap cleanup EXIT

passed=0
failed=0
check() {
  local name="$1"
  shift
  if out="$("$@" 2>&1)"; then
    passed=$((passed + 1))
    printf '  \e[32m✓\e[0m %s\n' "${name}"
  else
    failed=$((failed + 1))
    printf '  \e[31m✗\e[0m %s\n%s\n' "${name}" "$(printf '%s' "${out}" | tail -n 15 | sed 's/^/      /')"
  fi
}

echo "Starting ${project} in ${work} ..."
compose up -d --wait --wait-timeout 180

echo "Isolation"
check "runs as non-root" bash -c "[ \"\$(docker compose -p ${project} exec -T universal-agent id -u)\" != 0 ]"
check "has no Linux capabilities" bash -c "docker compose -p ${project} exec -T universal-agent grep -q 'CapEff:[[:space:]]*0000000000000000' /proc/1/status"
check "credentials folder hidden from /workspace" bash -c "[ -z \"\$(docker compose -p ${project} exec -T universal-agent ls -A /workspace/.agentic-devbox)\" ]"
check "project config layer is read-only" bash -c "! docker compose -p ${project} exec -T universal-agent touch /etc/agentic-devbox/project/x 2>/dev/null"

echo "Network and browser"
check "app reachable on localhost (shared network)" in_agent curl -fsS http://localhost:3000/health
check "Chrome DevTools on :9222" in_agent curl -fsS http://127.0.0.1:9222/json/version
check "devbox-browser screenshot" in_agent devbox-browser screenshot http://localhost:3000 /tmp/devbox-browser/smoke.png
check "screenshot is a PNG" in_agent bash -c "head -c 8 /tmp/devbox-browser/smoke.png | od -An -tx1 | grep -q '89 50 4e 47'"
check "browser flow: add a note through the UI" in_agent devbox-browser run tests/browser/add-note.mjs
check "console check reports no errors" in_agent devbox-browser console http://localhost:3000

echo "Agents"
for agent in claude copilot codex opencode agy; do
  check "${agent} --version" in_agent "${agent}" --version
done

echo "Configuration layers"
state=/home/agent/.agentic-devbox
check "claude: global + project MCP servers" in_agent jq -e '.mcpServers | has("filesystem") and has("chrome-devtools") and has("fetch") and has("postgres")' "${state}/claude/.claude.json"
# shellcheck disable=SC2016 # the literal ${PROJECT_DB_URL} is what we look for
check "claude: \${PROJECT_DB_URL} kept as a reference" in_agent jq -e '.mcpServers.postgres.env.PROJECT_DB_URL == "${PROJECT_DB_URL}"' "${state}/claude/.claude.json"
check "claude: project settings applied" in_agent jq -e '.permissions.allow | index("Bash(devbox-browser *)")' "${state}/claude/settings.json"
check "claude: global settings applied" in_agent jq -e '.permissions.deny | index("Read(./.env)")' "${state}/claude/settings.json"
check "copilot: native format" in_agent jq -e '.mcpServers.postgres.type == "local"' "${state}/copilot/mcp-config.json"
check "agy: native format" in_agent jq -e '.mcpServers["chrome-devtools"].args | index("--browser-url=http://127.0.0.1:9222")' "${state}/gemini/config/mcp_config.json"
check "codex: TOML config" in_agent grep -q '^\[mcp_servers.postgres\]' "${state}/codex/config.toml"
check "opencode: {env:} references" in_agent jq -e '.mcp.postgres.environment.PROJECT_DB_URL == "{env:PROJECT_DB_URL}"' "${state}/opencode/config/opencode.json"
check "/browser skill linked for every agent" in_agent bash -c "test -f ${state}/agents/skills/browser/SKILL.md && test -f ${state}/claude/skills/browser/SKILL.md && test -f ${state}/gemini/config/skills/browser/SKILL.md"
check "state lands in the project folder" test -f "${work}/.agentic-devbox/home/claude/settings.json"
check "every adapter applied without errors" in_agent jq -e '[.reports[] | select(.error)] | length == 0' /run/agentic-devbox/status.json

echo "MCP servers (live handshake)"
check "every MCP server starts and lists tools" in_agent agentic-devbox-config mcp-check

echo "Exec bridge"
check "runtime commands on PATH in login shells" in_agent bash -lc 'command -v docker && command -v devbox-browser && command -v agentic-devbox-config'
check "docker ps lists this project's containers" bash -c "docker compose -p ${project} exec -T universal-agent docker ps --format '{{.Service}}' | grep -qx app"
check "docker compose exec reaches the app service" bash -c "docker compose -p ${project} exec -T universal-agent docker compose exec -T app node -e 'console.log(process.version)' | grep -q '^v24'"
check "stdin is forwarded" bash -c "[ \"\$(echo bridged | docker compose -p ${project} exec -T universal-agent docker exec -i ${project}-app-1 cat)\" = bridged ]"
check "exit codes are forwarded" bash -c "docker compose -p ${project} exec -T universal-agent docker exec ${project}-app-1 sh -c 'exit 7'; [ \$? -eq 7 ]"
check "non-root policy refuses -u root" bash -c "! docker compose -p ${project} exec -T universal-agent docker exec -u root ${project}-app-1 id 2>/dev/null"
check "other docker commands are refused" bash -c "! docker compose -p ${project} exec -T universal-agent docker run alpine true 2>/dev/null"

echo "VS Code in the browser"
check "serve-web answers with the token" bash -c "for i in \$(seq 1 60); do t=\$(docker compose -p ${project} exec -T universal-agent cat /home/agent/.agentic-devbox/vscode/connection-token 2>/dev/null); [ -n \"\$t\" ] && curl -fsS -o /dev/null \"http://127.0.0.1:18800/?tkn=\$t\" && exit 0; sleep 2; done; exit 1"
check "serve-web rejects requests without the token" bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18800/)\" != 200 ]"

echo "Database least privilege"
check "agent_ro can read" in_agent psql "postgres://agent_ro:agent_ro@db:5432/app" -tAc "select count(*) from customers"
check "agent_ro cannot write" bash -c "! docker compose -p ${project} exec -T universal-agent psql 'postgres://agent_ro:agent_ro@db:5432/app' -c \"insert into customers (name, email) values ('x', 'x@example.com')\" 2>/dev/null"

echo
echo "${passed} passed, ${failed} failed"
[[ "${failed}" -eq 0 ]]
