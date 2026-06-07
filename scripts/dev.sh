#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- Windows (MSYS2/Git Bash) PATH helpers ----------
# Git Bash on Windows doesn't inherit the full Windows PATH for non-interactive
# shells. Add common tool locations so the prerequisite check below passes.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Resolve known Windows tool paths.
    # Use C:/... (not /c/...) syntax — MSYS2 path translation may be absent when
    # bash is spawned from a non-MSYS2 parent (e.g. GnuWin32 make from PowerShell).
    for _try in \
      "C:/Program Files/nodejs" \
      "C:/Program Files/Docker/Docker/resources/bin" \
      "C:/Users/${USER:-$(whoami)}/AppData/Roaming/npm" \
      "C:/Users/${USER:-$(whoami)}/go1.26.1/go/bin" \
      "C:/Program Files (x86)/GnuWin32/bin"; do
      [ -d "$_try" ] && PATH="${_try}:${PATH}"
    done
    # Restore the Go binary path from GOROOT if set
    if [ -n "${GOROOT:-}" ]; then
      PATH="${GOROOT}/bin:${PATH}"
    fi
    ;;
esac

# ---------- Windows PATH fallback via cmd.exe / where ----------
# If the hardcoded paths above didn't cover the user's install locations,
# ask cmd.exe to resolve the tool paths from the Windows system PATH.
_find_in_windows_path() {
  local _tool="$1"
  local _path _dir
  # Use where.exe directly (not cmd.exe /c) to avoid MSYS2 argument
  # path translation mangling the /c flag into C:\.
  _path=$(where.exe "$_tool" 2>/dev/null | head -1 | tr -d '\r')
  [ -n "$_path" ] && [ -f "$_path" ] || return 1
  # Convert to MSYS2 path (/c/...) so the colon in "C:\" doesn't break
  # the colon-separated PATH variable.
  _dir="$(dirname "${_path//\\/\/}")"
  _dir=$(cygpath -u "$_dir" 2>/dev/null || echo "$_dir")
  PATH="${_dir}:${PATH}"
}
if command -v where.exe >/dev/null 2>&1; then
  command -v node  >/dev/null 2>&1 || _find_in_windows_path node.exe
  command -v pnpm  >/dev/null 2>&1 || _find_in_windows_path pnpm.cmd
  command -v go    >/dev/null 2>&1 || _find_in_windows_path go.exe
  command -v docker>/dev/null 2>&1 || _find_in_windows_path docker.exe
fi

# ---------- Check prerequisites ----------
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
command -v go >/dev/null 2>&1 || missing+=("go")
command -v docker >/dev/null 2>&1 || missing+=("docker")

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
