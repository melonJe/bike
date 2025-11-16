#!/usr/bin/env bash
set -euo pipefail

# Weekly updater for GraphHopper data (bicycle-web)
# - Backs up existing /data/graph-cache to /data/backup (inside mounted volume)
# - Rebuilds graph-cache (force)
# - Restarts runtime service to apply updated graph

here=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$here/.." && pwd)
cd "$repo_root"

# Options
DockerServiceName=graphhopper
FORCE_DOWNLOAD=false
PBF_URL="${PBF_URL:-}"

usage() { echo "Usage: $0 [--download] [--pbf-url=URL]"; exit 0; }
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage ;;
    --download) FORCE_DOWNLOAD=true ;;
    --pbf-url=*) PBF_URL="${arg#*=}" ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

echo "[update] Stopping graphhopper service (if running)..."
docker compose stop "$DockerServiceName" || true

echo "[update] Creating backup of current graph-cache..."
timestamp=$(date +%Y%m%d-%H%M%S)
# Note: backup will be created under ./data/backup on host
mkdir -p "$repo_root/data/backup"
if [ -d "$repo_root/data/graph-cache" ]; then
  tar -czf "$repo_root/data/backup/graph-cache-$timestamp.tgz" -C "$repo_root/data" graph-cache || true
else
  echo "[update] no graph-cache to backup"
fi

echo "[update] Rebuilding graph-cache using PBF..."
forward=(--force)
if [[ "$FORCE_DOWNLOAD" == true ]]; then forward+=(--download); fi
if [[ -n "$PBF_URL" ]]; then forward+=("--pbf-url=$PBF_URL"); fi
bash "$repo_root/scripts/graphhopper_import.sh" "${forward[@]}"

echo "[update] Starting graphhopper service..."
docker compose up -d "$DockerServiceName"

echo "[update] Waiting for GraphHopper ..."
READY=""
for i in $(seq 1 60); do
  if curl -fsS "http://graphhopper:8989/maps" >/dev/null 2>&1; then
    echo "[update] GraphHopper is up."
    READY=1
    break
  fi
  sleep 2
done
if [ -z "${READY:-}" ]; then
  echo "[update] WARN: GraphHopper did not respond on 8989 within timeout" >&2
  echo "[update] Recent container logs:"
  docker compose logs --no-color --tail=100 "$DockerServiceName" || true
fi

echo "[update] Done."
