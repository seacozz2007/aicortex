#!/usr/bin/env bash
# PDC 镜像构建并推送到 Harbor（ark-it 项目）。
#
# 用法（Linux / Git Bash）:
#   docker login harbor-pdc1.eniot.io
#   bash scripts/pdc_push.sh
#   bash scripts/pdc_push.sh --with-up    # build 后额外 docker compose up -d
#
# 推送地址示例:
#   harbor-pdc1.eniot.io/ark-it/aicortex-web:tag_20260630_0609001
#   harbor-pdc1.eniot.io/ark-it/aicortex-api:tag_20260630_0609001
#
# 流程: 清理 aicortex 资源 → git tag → compose build → tag → push
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

REGISTRY="${REGISTRY:-harbor-pdc1.eniot.io/ark-it}"
REGISTRY="${REGISTRY%/}"
ENV_FILE="${ENV_FILE:-.env-pdc}"
WITH_UP=0
COMPOSE_ENV_FILE=""
COMPOSE=()

cleanup() {
  [[ -n "$COMPOSE_ENV_FILE" && -f "$COMPOSE_ENV_FILE" ]] && rm -f "$COMPOSE_ENV_FILE"
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-up) WITH_UP=1; shift ;;
    --build-only) shift ;; # 兼容旧参数：默认已是仅 build
    -h|--help)
      grep '^#' "$0" | head -n 14 | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

compose_cmd() {
  docker compose --env-file "$ENV_FILE" \
    -f docker-compose.selfhost.yml \
    -f docker-compose.selfhost.build.yml "$@"
}

# tag_YYYYMMDD_MMDDNNN  例: tag_20260630_0609001
gen_push_tag() {
  local date_ymd date_md prefix max n next suffix t
  date_ymd="$(date +%Y%m%d)"
  date_md="$(date +%m%d)"
  prefix="tag_${date_ymd}_${date_md}"
  max=0
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    suffix="${t#"${prefix}"}"
    if [[ "$suffix" =~ ^[0-9]{3}$ ]]; then
      n=$((10#$suffix))
      if (( n > max )); then max=$n; fi
    fi
  done < <(git tag -l "${prefix}*" 2>/dev/null || true)
  next=$((max + 1))
  printf '%s%03d' "$prefix" "$next"
}

# 合并 .env-pdc + 本次 build tag，确保 compose 插值读到 AICORTEX_BUILD_TAG（避免落到 :dev）
setup_compose_env() {
  local push_tag="$1" commit="$2"
  COMPOSE_ENV_FILE="$(mktemp)"
  cat "$ENV_FILE" > "$COMPOSE_ENV_FILE"
  {
    echo ""
    echo "# injected by scripts/pdc_push.sh"
    echo "AICORTEX_BUILD_TAG=${push_tag}"
    echo "COMMIT=${commit}"
  } >> "$COMPOSE_ENV_FILE"
  COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" \
    -f docker-compose.selfhost.yml \
    -f docker-compose.selfhost.build.yml)
}

clean_local_docker() {
  echo "==> Cleaning aicortex selfhost resources only..."
  compose_cmd down --rmi local --remove-orphans 2>/dev/null || true

  local img
  while IFS= read -r img; do
    [[ -z "$img" ]] && continue
    echo "    rmi ${img}"
    docker rmi -f "$img" 2>/dev/null || true
  done < <(
    docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
      | grep -E '(^aicortex-(web|backend)|/ark-it/aicortex-(web|api)):' || true
  )
}

PUSH_TAG="$(gen_push_tag)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
LOCAL_WEB="aicortex-web:${PUSH_TAG}"
LOCAL_API="aicortex-backend:${PUSH_TAG}"
REMOTE_WEB="${REGISTRY}/aicortex-web:${PUSH_TAG}"
REMOTE_API="${REGISTRY}/aicortex-api:${PUSH_TAG}"

echo "==> Push tag: ${PUSH_TAG}"
echo "    Remote:   ${REMOTE_WEB}"
echo "              ${REMOTE_API}"

clean_local_docker

if git rev-parse "$PUSH_TAG" >/dev/null 2>&1; then
  echo "Git tag already exists: $PUSH_TAG" >&2
  exit 1
fi

echo "==> Creating git tag: ${PUSH_TAG}"
git tag "$PUSH_TAG"

setup_compose_env "$PUSH_TAG" "$COMMIT"

echo "==> Building images (AICORTEX_BUILD_TAG=${PUSH_TAG})..."
"${COMPOSE[@]}" build

if [[ "$WITH_UP" -eq 1 ]]; then
  echo "==> Starting compose stack..."
  "${COMPOSE[@]}" up -d
fi

for img in "$LOCAL_WEB" "$LOCAL_API"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "Expected image not found: $img" >&2
    echo "Local aicortex images:" >&2
    docker images 'aicortex-web' 'aicortex-backend' 2>/dev/null || true
    exit 1
  fi
done

echo "==> Tagging for registry ${REGISTRY}..."
docker tag "$LOCAL_WEB" "$REMOTE_WEB"
docker tag "$LOCAL_API" "$REMOTE_API"

echo "==> Pushing..."
docker push "$REMOTE_WEB"
docker push "$REMOTE_API"

echo ""
echo "Done."
echo "  Git tag:     ${PUSH_TAG}"
echo "  Local web:   ${LOCAL_WEB}"
echo "  Local api:   ${LOCAL_API}"
echo "  Remote web:  ${REMOTE_WEB}"
echo "  Remote api:  ${REMOTE_API}"
