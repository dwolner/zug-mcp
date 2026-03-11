#!/usr/bin/env bash
set -e

ZUG_DIR="$HOME/.zug"
SERVER_DIR="$ZUG_DIR/server"
CLAUDE_RULES_DIR="$HOME/.claude/rules"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[zug]${NC} $1"; }
success() { echo -e "${GREEN}[zug]${NC} $1"; }
warn()    { echo -e "${YELLOW}[zug]${NC} $1"; }

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"
if [[ "$OS" == "Darwin" ]]; then
  VSCODE_MCP="$HOME/Library/Application Support/Code/User/mcp.json"
  CLAUDE_DESKTOP="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OS" == "Linux" ]]; then
  VSCODE_MCP="$HOME/.config/Code/User/mcp.json"
  CLAUDE_DESKTOP="$HOME/.config/Claude/claude_desktop_config.json"
else
  warn "Unsupported OS: $OS. Manual configuration required."
  VSCODE_MCP=""
  CLAUDE_DESKTOP=""
fi

# ── Check dependencies ────────────────────────────────────────────────────────
info "Checking dependencies..."
if ! command -v node &>/dev/null; then
  echo "Node.js is required. Install from https://nodejs.org" && exit 1
fi
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm
fi

# ── Install server ────────────────────────────────────────────────────────────
if [[ "$1" != "--configure-only" ]]; then
  info "Installing Zug MCP server to $SERVER_DIR..."
  if [[ -d "$SERVER_DIR/.git" ]]; then
    warn "Server already installed. Pulling latest..."
    git -C "$SERVER_DIR" pull
  else
    git clone https://github.com/dwolner/zug-mcp "$SERVER_DIR"
  fi
fi

info "Installing dependencies..."
cd "$SERVER_DIR"
pnpm install --frozen-lockfile

# ── Create data directories ────────────────────────────────────────────────────
info "Creating data directories..."
mkdir -p "$ZUG_DIR/sessions"

# ── Seed PERSONA.md if missing ────────────────────────────────────────────────
if [[ ! -f "$ZUG_DIR/PERSONA.md" ]]; then
  cp "$SERVER_DIR/templates/PERSONA.template.md" "$ZUG_DIR/PERSONA.md"
  success "Created $ZUG_DIR/PERSONA.md — edit this to seed your cognitive fingerprint"
fi

# ── Seed PLAYBOOK.md if missing ───────────────────────────────────────────────
if [[ ! -f "$ZUG_DIR/PLAYBOOK.md" ]]; then
  cat > "$ZUG_DIR/PLAYBOOK.md" << 'EOF'
# Playbook

*Universal patterns about what works in a Zug learning session. Grows from session data over time.*

*This file will be updated automatically as sessions accumulate.*
EOF
  success "Created $ZUG_DIR/PLAYBOOK.md"
fi

# ── Register with Claude Code (~/.claude.json) ────────────────────────────────
CLAUDE_JSON="$HOME/.claude.json"
if [[ -f "$CLAUDE_JSON" ]]; then
  info "Configuring Claude Code MCP (~/.claude.json)..."
  python3 - "$CLAUDE_JSON" "$SERVER_DIR" << 'PYEOF'
import json, sys
path, server_dir = sys.argv[1], sys.argv[2]
config = json.load(open(path))
config.setdefault("mcpServers", {})["zug"] = {
  "type": "stdio",
  "command": "npx",
  "args": ["tsx", f"{server_dir}/src/stdio.ts"]
}
json.dump(config, open(path, "w"), indent=2)
PYEOF
  success "Claude Code MCP configured"
else
  warn "~/.claude.json not found — Claude Code may not be installed yet"
fi

# ── Register with Claude desktop ──────────────────────────────────────────────
if [[ -n "$CLAUDE_DESKTOP" && -f "$CLAUDE_DESKTOP" ]]; then
  info "Configuring Claude desktop..."
  python3 - "$CLAUDE_DESKTOP" "$SERVER_DIR" << 'PYEOF'
import json, sys
path, server_dir = sys.argv[1], sys.argv[2]
config = json.load(open(path))
config.setdefault("mcpServers", {})["zug"] = {
  "command": "npx",
  "args": ["tsx", f"{server_dir}/src/stdio.ts"]
}
json.dump(config, open(path, "w"), indent=2)
PYEOF
  success "Claude desktop configured"
fi

# ── Install Claude Code rules ─────────────────────────────────────────────────
if [[ -d "$CLAUDE_RULES_DIR" ]]; then
  info "Installing Claude Code rules..."
  cp "$SERVER_DIR/prompts/zug-rule.md" "$CLAUDE_RULES_DIR/zug.md"
  success "Installed ~/.claude/rules/zug.md"
else
  warn "~/.claude/rules/ not found — Claude Code rules not installed."
  warn "Create the directory and copy prompts/zug-rule.md to ~/.claude/rules/zug.md manually."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Zug installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Edit ~/.zug/PERSONA.md to seed your cognitive fingerprint"
echo "  2. Restart VS Code / Claude desktop to pick up the MCP server"
echo "  3. For Claude.ai web: paste prompts/system-prompt.md into a Project's system prompt"
echo "     and add the HTTP endpoint (Phase 3) when ready"
echo ""
echo "Data lives at: $ZUG_DIR"
echo "Server lives at: $SERVER_DIR"
echo ""
echo "See ROADMAP.md for what's coming next."
