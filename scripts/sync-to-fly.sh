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

rget() { fly sftp get -a "$APP" -q "$1" "$2" 2>/dev/null; }
rput() { fly ssh console -a "$APP" -C "sh -c 'cat > $2'" < "$1"; }
rssh() { fly ssh console -a "$APP" -C "sh -c '$*'" 2>/dev/null; }

# ── 1. Pull Fly observations ──────────────────────────────────────────────────
info "Pulling observations from Fly..."
rget "$REMOTE/observations.jsonl" "$TMP/fly-obs.jsonl" || touch "$TMP/fly-obs.jsonl"

LOCAL_OBS=$(wc -l < "$LOCAL/observations.jsonl" | tr -d ' ')
FLY_OBS=$(wc -l < "$TMP/fly-obs.jsonl" | tr -d ' ')
info "  local: $LOCAL_OBS lines, fly: $FLY_OBS lines"

# ── 2. Pull Fly sessions not present locally ──────────────────────────────────
info "Checking Fly sessions..."
mkdir -p "$TMP/fly-sessions"
fly sftp get -a "$APP" -q -R "$REMOTE/sessions" "$TMP/fly-sessions" 2>/dev/null || true

PULLED=0
for f in "$TMP/fly-sessions/sessions/"*.md; do
  [[ -f "$f" ]] || continue
  filename="$(basename "$f")"
  if [[ ! -f "$LOCAL/sessions/$filename" ]]; then
    cp "$f" "$LOCAL/sessions/$filename"
    PULLED=$((PULLED + 1))
  fi
done
info "  pulled $PULLED new sessions from Fly"

# ── 3. Merge observations (dedup by full line, preserve order) ────────────────
info "Merging observations..."
cat "$LOCAL/observations.jsonl" "$TMP/fly-obs.jsonl" \
  | awk '!seen[$0]++' \
  > "$TMP/merged-obs.jsonl"
MERGED=$(wc -l < "$TMP/merged-obs.jsonl" | tr -d ' ')
info "  merged: $MERGED lines"
cp "$TMP/merged-obs.jsonl" "$LOCAL/observations.jsonl"

# ── 4. Push everything to Fly ─────────────────────────────────────────────────
info "Pushing to Fly..."

rput "$LOCAL/observations.jsonl" "$REMOTE/observations.jsonl"
success "  observations.jsonl"

for f in PERSONA.md PLAYBOOK.md ACTIVE.md; do
  [[ -f "$LOCAL/$f" ]] && rput "$LOCAL/$f" "$REMOTE/$f" && success "  $f"
done

for f in lessons.jsonl reinforcements.jsonl growth.jsonl; do
  [[ -f "$LOCAL/$f" ]] && rput "$LOCAL/$f" "$REMOTE/$f" && success "  $f"
done

info "Pushing sessions..."
PUSHED=0
for session_file in "$LOCAL/sessions/"*.md; do
  [[ -f "$session_file" ]] || continue
  filename="$(basename "$session_file")"
  rput "$session_file" "$REMOTE/sessions/$filename"
  PUSHED=$((PUSHED + 1))
done
success "  pushed $PUSHED sessions"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Sync complete."
echo ""
TOTAL_SESSIONS=$(ls "$LOCAL/sessions/"*.md 2>/dev/null | wc -l | tr -d ' ')
TOTAL_OBS=$(wc -l < "$LOCAL/observations.jsonl" | tr -d ' ')
echo "  Fly volume now has: $TOTAL_SESSIONS sessions, $TOTAL_OBS observations"
echo ""
echo "Restart Claude Code to connect via mcp-remote → Fly.io"
