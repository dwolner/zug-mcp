#!/usr/bin/env bash
# Merges local ~/.zug/ data with Fly.io volume, then pushes the result up.
# Run once (from the machine with the richest local data) before switching
# Claude Code from stdio → mcp-remote.
#
# Strategy:
#   observations.jsonl  — merge both sides, dedup by full line
#   sessions/           — union (local wins on collision)
#   PERSONA/PLAYBOOK/ACTIVE — local always wins (richer history)
#   lessons/reinforcements/growth — local wins

set -euo pipefail

# curl installer puts flyctl in ~/.fly/bin — add to PATH if needed
[[ -d "$HOME/.fly/bin" ]] && export PATH="$HOME/.fly/bin:$PATH"

if ! command -v fly &>/dev/null; then
  echo "Error: flyctl is required. Install it with:"
  echo "  brew install flyctl        # macOS"
  echo "  curl -L https://fly.io/install.sh | sh  # Linux"
  echo ""
  echo "Note: this script only needs to run once, from the machine with"
  echo "the richest local data. Other machines just need mcp-remote configured."
  exit 1
fi

APP="zug-mcp"
REMOTE="/data/.zug"
LOCAL="${ZUG_DATA_DIR:-$HOME/.zug}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${BLUE}[sync]${NC} $1"; }
success() { echo -e "${GREEN}[sync]${NC} $1"; }
warn()    { echo -e "${YELLOW}[sync]${NC} $1"; }

# ── 1. Pull everything from Fly in one tar pipe ───────────────────────────────
info "Pulling from Fly..."
mkdir -p "$TMP/fly"
fly ssh console -a "$APP" -C "sh -c 'tar czf - -C $REMOTE .'" 2>/dev/null \
  | tar xzf - -C "$TMP/fly" 2>/dev/null || true

FLY_OBS=$(wc -l < "$TMP/fly/observations.jsonl" 2>/dev/null | tr -d ' ') || FLY_OBS=0
FLY_SESSIONS=$(ls "$TMP/fly/sessions/"*.md 2>/dev/null | wc -l | tr -d ' ') || FLY_SESSIONS=0
info "  pulled: $FLY_OBS observations, $FLY_SESSIONS sessions"

# ── 2. Merge observations (dedup by full line, preserve order) ────────────────
info "Merging observations..."
LOCAL_OBS=$(wc -l < "$LOCAL/observations.jsonl" | tr -d ' ')
cat "$LOCAL/observations.jsonl" "$TMP/fly/observations.jsonl" 2>/dev/null \
  | awk '!seen[$0]++' \
  > "$TMP/merged-obs.jsonl"
MERGED=$(wc -l < "$TMP/merged-obs.jsonl" | tr -d ' ')
info "  local: $LOCAL_OBS, fly: $FLY_OBS → merged: $MERGED"
cp "$TMP/merged-obs.jsonl" "$LOCAL/observations.jsonl"

# Copy any Fly sessions not present locally
PULLED=0
for f in "$TMP/fly/sessions/"*.md; do
  [[ -f "$f" ]] || continue
  filename="$(basename "$f")"
  if [[ ! -f "$LOCAL/sessions/$filename" ]]; then
    cp "$f" "$LOCAL/sessions/$filename"
    PULLED=$((PULLED + 1))
  fi
done
info "  pulled $PULLED new sessions from Fly"

# ── 3. Push everything to Fly in one tar pipe ─────────────────────────────────
info "Pushing to Fly..."
TOTAL_SESSIONS=$(ls "$LOCAL/sessions/"*.md 2>/dev/null | wc -l | tr -d ' ')
TOTAL_OBS=$(wc -l < "$LOCAL/observations.jsonl" | tr -d ' ')

tar czf - -C "$LOCAL" --exclude=./sessions/archive . 2>/dev/null \
  | fly ssh console -a "$APP" -C "sh -c 'tar xzf - -C $REMOTE'"

success "  pushed: $TOTAL_SESSIONS sessions, $TOTAL_OBS observations"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Sync complete."
echo ""
echo "  Fly volume now has: $TOTAL_SESSIONS sessions, $TOTAL_OBS observations"
echo ""
echo "Restart Claude Code to connect via mcp-remote → Fly.io"
