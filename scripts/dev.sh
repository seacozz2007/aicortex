#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- WSL detection ----------
_is_wsl=
if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
  _is_wsl=1
fi

# ---------- Windows PATH helpers ----------
# Git Bash / WSL on Windows doesn't inherit the full Windows PATH for
# non-interactive shells. Add common tool locations so the prerequisite
# check below passes.

_windows_path_try() {
  local _p
  for _p in "$@"; do
    [ -d "$_p" ] && PATH="${_p}:${PATH}" && return 0
  done
  return 0  # not finding paths is not an error
}

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # MSYS2/Git Bash — try /c/... and C:/... formats
    _windows_path_try \
      "/c/Program Files/nodejs" "C:/Program Files/nodejs" \
      "/c/Program Files/Docker/Docker/resources/bin" "C:/Program Files/Docker/Docker/resources/bin" \
      "/c/Users/${USER:-$(whoami)}/AppData/Roaming/npm" "C:/Users/${USER:-$(whoami)}/AppData/Roaming/npm" \
      "/c/Users/${USER:-$(whoami)}/go1.26.1/go/bin" "C:/Users/${USER:-$(whoami)}/go1.26.1/go/bin" \
      "/c/Program Files (x86)/GnuWin32/bin" "C:/Program Files (x86)/GnuWin32/bin"
    if [ -n "${GOROOT:-}" ]; then
      PATH="${GOROOT}/bin:${PATH}"
    fi
    ;;
esac

if [ -n "$_is_wsl" ]; then
  # WSL — /mnt/c/... format
  _windows_path_try \
    "/mnt/c/Program Files/nodejs" \
    "/mnt/c/Program Files/Docker/Docker/resources/bin" \
    "/mnt/c/Users/${USER:-$(whoami)}/AppData/Roaming/npm" \
    "/mnt/c/Users/${USER:-$(whoami)}/go1.26.1/go/bin" \
    "/mnt/c/Program Files (x86)/GnuWin32/bin"
  if [ -n "${GOROOT:-}" ]; then
    PATH="${GOROOT}/bin:${PATH}"
  fi
fi

# ---------- Windows PATH fallback via where.exe ----------
# If the hardcoded paths above didn't cover the user's install locations,
# ask where.exe to resolve the tool paths from the Windows system PATH.
_find_in_windows_path() {
  local _tool="$1"
  local _path _dir _drive
  _path=$(where.exe "$_tool" 2>/dev/null | head -1 | tr -d '\r')
  [ -n "$_path" ] || return 1
  # Convert C:\... → /c/... (MSYS2) or /mnt/c/... (WSL)
  _path="${_path//\\/\/}"          # backslash → forward slash
  _drive="${_path:0:1}"           # drive letter
  if [ -n "$_is_wsl" ]; then
    _path="/mnt/${_drive,,}${_path:2}"
  else
    _path="/${_drive,,}${_path:2}"
  fi
  _dir="$(dirname "$_path")"
  PATH="${_dir}:${PATH}"
  # Verify the tool is reachable. WSL bash may not find node via
  # command -v node (it doesn't auto-append .exe), so also try
  # with the .exe suffix and a direct exec test.
  command -v "${_tool%.exe}" >/dev/null 2>&1 && return 0
  command -v "$_tool" >/dev/null 2>&1 && return 0
  "${_tool%.exe}" --version >/dev/null 2>&1
}
if command -v where.exe >/dev/null 2>&1; then
  command -v node  >/dev/null 2>&1 || _find_in_windows_path node.exe
  command -v pnpm  >/dev/null 2>&1 || _find_in_windows_path pnpm.cmd
  command -v go    >/dev/null 2>&1 || _find_in_windows_path go.exe
  command -v docker>/dev/null 2>&1 || _find_in_windows_path docker.exe
fi

# ---------- Check prerequisites ----------
# WSL bash's command -v doesn't auto-append .exe, so try the
# bare name first, then fall back to .exe and .cmd suffixes.
_check_tool() { command -v "$1" >/dev/null 2>&1 || command -v "${1}.exe" >/dev/null 2>&1 || command -v "${1}.cmd" >/dev/null 2>&1; }
missing=()
_check_tool node   || missing+=("node")
_check_tool pnpm   || missing+=("pnpm")
_check_tool go     || missing+=("go")
_check_tool docker || missing+=("docker")

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing prerequisites: ${missing[*]}"
  echo "  Please install: Node.js v20+, pnpm v10.28+, Go v1.26+, Docker"
  exit 1
fi

# ---------- Environment file ----------
if [ -f .git ]; then
  # Inside a git worktree (.git is a file, not a directory)
  ENV_FILE=".env.worktree"
  if [ ! -f "$ENV_FILE" ]; then
    echo "==> Worktree detected. Generating $ENV_FILE..."
    bash scripts/init-worktree-env.sh "$ENV_FILE"
  fi
else
  ENV_FILE=".env"
  if [ ! -f "$ENV_FILE" ]; then
    echo "==> Creating $ENV_FILE from .env.example..."
    cp .env.example "$ENV_FILE"
  fi
fi

echo "==> Using $ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# ---------- Install dependencies ----------
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  pnpm install
fi

# ---------- Database ----------
bash scripts/ensure-postgres.sh "$ENV_FILE"

echo "==> Running migrations..."
(cd server && go run ./cmd/migrate up)

# ---------- Start services ----------
echo ""
echo "✓ Ready. Starting services..."
echo "  Backend:  http://localhost:${PORT:-8080}"
echo "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo ""

trap 'kill 0' EXIT
(cd server && go run ./cmd/server) &
pnpm dev:web &
wait
