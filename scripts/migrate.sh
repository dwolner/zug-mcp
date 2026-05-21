#!/usr/bin/env bash
# One-time migration: uploads local ~/.zug/ data to the fly.io persistent volume.
# Run once after first deploy. Safe to re-run (overwrites existing files).
set -e

APP="${FLY_APP:-zug-mcp}"
ZUG_DIR="$HOME/.zug"
REMOTE="/data/.zug"

echo "[migrate] App: $APP"
echo "[migrate] Source: $ZUG_DIR"
echo "[migrate] Destination: $REMOTE"
echo ""

# Create remote directories via SSH (fly sftp shell doesn't support mkdir)
echo "[migrate] Creating remote directories..."
fly ssh console -a "$APP" -C "mkdir -p $REMOTE/sessions" 2>/dev/null || true

# Build SFTP batch file
BATCH=$(mktemp)
trap "rm -f $BATCH" EXIT

# Upload top-level data files
for file in PERSONA.md PLAYBOOK.md ACTIVE.md observations.jsonl; do
  local="$ZUG_DIR/$file"
  if [ -f "$local" ]; then
    echo "put $local $REMOTE/$file" >> "$BATCH"
    echo "[migrate] Queued: $file"
  fi
done

# Upload session files
SESSION_COUNT=0
for f in "$ZUG_DIR/sessions/"*.md; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  echo "put $f $REMOTE/sessions/$base" >> "$BATCH"
  SESSION_COUNT=$((SESSION_COUNT + 1))
done
echo "[migrate] Queued: $SESSION_COUNT session files"

echo "bye" >> "$BATCH"
echo ""

echo "[migrate] Uploading via fly sftp..."
fly sftp shell -a "$APP" < "$BATCH"

echo ""
echo "[migrate] Done. Verify with:"
echo "  fly ssh console -a $APP -C 'ls -la $REMOTE'"
