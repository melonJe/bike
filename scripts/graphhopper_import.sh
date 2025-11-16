#!/usr/bin/env bash
set -euo pipefail

# GraphHopper 데이터 임포트 스크립트 (bicycle-web)
# 사용법:
#   bash scripts/graphhopper_import.sh [--force] [--download] [--pbf-url=URL]
#   --force     기존 /data/graph-cache 제거 후 재생성
#   --download  PBF 파일이 있어도 다시 다운로드
#   --pbf-url=  다운로드할 PBF 파일 URL (기본: Geofabrik South Korea)
#
# 전제 조건:
# - docker 및 docker compose 사용 가능
# - docker-compose.yml 에 graphhopper 서비스 정의되어 있음

here=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$here/.." && pwd)
cd "$repo_root"

PBF_URL_DEFAULT="https://download.geofabrik.de/asia/south-korea-latest.osm.pbf"
PBF_URL="${PBF_URL:-$PBF_URL_DEFAULT}"
PBF_FILE="$repo_root/data/south-korea-latest.osm.pbf"
FORCE_REBUILD=false
FORCE_DOWNLOAD=false

usage() { echo "Usage: $0 [--force] [--download] [--pbf-url=URL]"; exit 0; }

# Parse args
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage ;;
    --force) FORCE_REBUILD=true ;;
    --download) FORCE_DOWNLOAD=true ;;
    --pbf-url=*) PBF_URL="${arg#*=}" ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

download_pbf_if_needed() {
  if [[ "$FORCE_DOWNLOAD" == true || ! -f "$PBF_FILE" ]]; then
    echo "[graphhopper] Downloading PBF: $PBF_URL -> $PBF_FILE"
    mkdir -p "$(dirname "$PBF_FILE")"
    curl -fL "$PBF_URL" -o "$PBF_FILE"
  else
    echo "[graphhopper] Using existing PBF: $PBF_FILE"
  fi
}

  # Prepare PBF on host
  echo "[graphhopper] Preparing PBF on host..."
  download_pbf_if_needed
  
  
  # Ensure images are built
  echo "[graphhopper] Building service image if needed..."
  docker compose build graphhopper

# Optionally remove existing graph-cache
if [[ "$FORCE_REBUILD" == true ]]; then
  echo "[graphhopper] Stopping graphhopper service (if running)..."
  docker compose stop graphhopper || true

  echo "[graphhopper] Forcing rebuild: cleaning /data/graph-cache contents..."
  # Clean contents without removing the mount point; run as root to avoid permission issues
  docker compose run --rm --user root graphhopper sh -lc 'set -euo pipefail; mkdir -p /data/graph-cache; find /data/graph-cache -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
fi

  echo "[graphhopper] Ensuring /data permissions and required directories..."
  docker compose run --rm --user root graphhopper sh -lc '
    set -euo pipefail;
    mkdir -p /data/graph-cache;
    chown -R 10001:10001 /data/graph-cache || true;
    chmod -R u+rwX,g+rwX /data/graph-cache || true;
  '

# Import by running GraphHopper directly in a one-off container
echo "[graphhopper] Importing OSM data via one-off container..."
docker compose run --rm graphhopper sh -lc '
  set -euo pipefail
  echo "[container] Running GraphHopper import..."
  java $JAVA_OPTS -jar ./graphhopper-web.jar import ./config.yml
  echo "[container] Writing checksum stamp inside /data/graph-cache..."
  if [ -f "/data/south-korea-latest.osm.pbf" ]; then
    sha256sum "/data/south-korea-latest.osm.pbf" > "/data/graph-cache/.pbf.sha256" || true
  fi
'
echo "[graphhopper] Import completed successfully."
