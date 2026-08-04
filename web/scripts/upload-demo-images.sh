#!/usr/bin/env bash
# Uploads the demo furniture photos to the paths the seed data already
# references (demo/sofa.jpg, demo/dining.jpg, …).
#
# The seed migration inserted listing_images rows pointing at these paths but
# never uploaded the files, so the demo listings showed placeholders forever.
#
# Usage:  web/scripts/upload-demo-images.sh [source-dir]
# Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from web/.env.
set -euo pipefail

SRC_DIR="${1:-$HOME/Documents/pro/demo}"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
BUCKET="listing-images"

[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }
[ -d "$SRC_DIR" ]  || { echo "error: source dir $SRC_DIR not found" >&2; exit 1; }

read_env() { grep -h "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
URL="$(read_env SUPABASE_URL)"
KEY="$(read_env SUPABASE_SERVICE_ROLE_KEY)"
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "error: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing" >&2; exit 1; }

# Local filename  ->  storage path used by the seed rows.
map_pairs=(
  "3-Seater Fabric Sofa — Charcoal.jpg|demo/sofa.jpg"
  "Solid Wood Dining Set (6 Chairs).jpg|demo/dining.jpg"
  "Ergonomic Mesh Office Chair.jpg|demo/chair.jpg"
  "Two-Door Wardrobe with Mirror.jpg|demo/wardrobe.jpg"
  "Glass Top Coffee Table.jpg|demo/coffee.jpg"
  "Queen Bed Frame with Headboard.jpg|demo/bed.jpg"
)

failed=0
for pair in "${map_pairs[@]}"; do
  local_name="${pair%%|*}"
  remote_path="${pair##*|}"
  src="$SRC_DIR/$local_name"

  if [ ! -f "$src" ]; then
    printf '  MISSING  %s\n' "$local_name" >&2
    failed=1
    continue
  fi

  # x-upsert lets the script be re-run without first deleting the objects.
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$URL/storage/v1/object/$BUCKET/$remote_path" \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary "@$src")"

  if [ "$code" = "200" ]; then
    printf '  uploaded %-20s <- %s\n' "$remote_path" "$local_name"
  else
    printf '  FAILED   %-20s (HTTP %s)\n' "$remote_path" "$code" >&2
    failed=1
  fi
done

exit "$failed"
