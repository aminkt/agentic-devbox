#!/usr/bin/env bash
# agentic-devbox installer.
#
#   curl -fsSL https://raw.githubusercontent.com/aminkt/agentic-devbox/main/install.sh | bash
#   ./install.sh                      # from a local checkout: links it instead of cloning
#
# Nothing is copied. The repository itself becomes ~/.config/agentic-devbox (a git
# clone, or a symlink to your checkout), so `agentic-devbox update` is a `git pull`.
#
# Environment overrides:
#   AGENTIC_DEVBOX_HOME     install location        (default: ~/.config/agentic-devbox)
#   AGENTIC_DEVBOX_REPO     git URL                  (default: https://github.com/aminkt/agentic-devbox.git)
#   AGENTIC_DEVBOX_REF      branch or tag            (default: main)
#   AGENTIC_DEVBOX_BIN_DIR  where the CLI is linked  (default: ~/.local/bin)
#   AGENTIC_DEVBOX_NO_BUILD=1  skip building the image now
set -euo pipefail

home_dir="${AGENTIC_DEVBOX_HOME:-${XDG_CONFIG_HOME:-${HOME}/.config}/agentic-devbox}"
repo="${AGENTIC_DEVBOX_REPO:-https://github.com/aminkt/agentic-devbox.git}"
ref="${AGENTIC_DEVBOX_REF:-main}"
bin_dir="${AGENTIC_DEVBOX_BIN_DIR:-${HOME}/.local/bin}"

if [[ -t 1 ]]; then green=$'\e[32m'; yellow=$'\e[33m'; red=$'\e[31m'; bold=$'\e[1m'; reset=$'\e[0m'; else green=""; yellow=""; red=""; bold=""; reset=""; fi
ok() { printf '%s✓%s %s\n' "${green}" "${reset}" "$*"; }
warn() { printf '%s!%s %s\n' "${yellow}" "${reset}" "$*"; }
die() { printf '%serror:%s %s\n' "${red}" "${reset}" "$*" >&2; exit 1; }

# --- Prerequisites ---------------------------------------------------------------------
command -v git >/dev/null || die "git is required"
command -v docker >/dev/null || die "Docker is required: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable (is Docker running?)"
compose_version="$(docker compose version --short 2>/dev/null || true)"
[[ -n "${compose_version}" ]] || die "the Docker Compose plugin is required: https://docs.docker.com/compose/install/"
compose_major="${compose_version#v}"
compose_major="${compose_major%%.*}"
if [[ "${compose_major}" -lt 5 ]]; then
  warn "Docker Compose ${compose_version} found. Projects override the included sidecar in one file, which needs Compose v5+."
  warn "Upgrade Compose, or use the two-file form described in the README section 'Older Compose versions'."
else
  ok "Docker Compose ${compose_version}"
fi

# --- Source: link a local checkout, or clone ---------------------------------------
script_dir=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
mkdir -p "$(dirname "${home_dir}")"

if [[ -n "${script_dir}" && -f "${script_dir}/base-compose.yml" && "${script_dir}" != "$(cd "${home_dir}" 2>/dev/null && pwd -P)" ]]; then
  if [[ -L "${home_dir}" || ! -e "${home_dir}" ]]; then
    ln -sfn "${script_dir}" "${home_dir}"
    ok "linked ${home_dir} → ${script_dir}"
  else
    die "${home_dir} already exists and is not a symlink; move it away or set AGENTIC_DEVBOX_HOME"
  fi
elif [[ -d "${home_dir}/.git" ]]; then
  git -C "${home_dir}" pull --rebase --autostash --quiet
  ok "updated ${home_dir}"
elif [[ -e "${home_dir}" ]]; then
  die "${home_dir} exists but is not an agentic-devbox checkout; move it away or set AGENTIC_DEVBOX_HOME"
else
  git clone --quiet --branch "${ref}" "${repo}" "${home_dir}"
  ok "cloned ${repo} (${ref}) into ${home_dir}"
fi

# --- Global secrets file (private, never committed) --------------------------------
secrets="${home_dir}/secrets.env"
if [[ ! -f "${secrets}" ]]; then
  (umask 077 && printf '# Global credentials for every agentic-devbox project. Supported names: env/passthrough.env\n' >"${secrets}")
  ok "created ${secrets} (mode 600)"
fi
chmod 600 "${secrets}"

# --- Host CLI ----------------------------------------------------------------------
mkdir -p "${bin_dir}"
ln -sfn "${home_dir}/bin/agentic-devbox" "${bin_dir}/agentic-devbox"
ok "linked ${bin_dir}/agentic-devbox"
case ":${PATH}:" in
  *":${bin_dir}:"*) ;;
  *) warn "${bin_dir} is not on your PATH. Add this to your shell profile: export PATH=\"${bin_dir}:\$PATH\"" ;;
esac

# --- Image ---------------------------------------------------------------------------
if [[ "${AGENTIC_DEVBOX_NO_BUILD:-0}" != "1" ]]; then
  AGENTIC_DEVBOX_HOME="${home_dir}" "${home_dir}/bin/agentic-devbox" build
fi

cat <<EOF

${bold}agentic-devbox is installed.${reset}

  1. Add credentials (optional; you can also sign in inside the sidecar):
       \$EDITOR ${secrets}        # e.g. ANTHROPIC_API_KEY=..., GEMINI_API_KEY=...
  2. Try the example project:
       cd ${home_dir}/project-template && agentic-devbox up && agentic-devbox claude
  3. Or add the sidecar to your own project:
       cd /path/to/your/project && agentic-devbox init --app <your-app-service>
EOF
