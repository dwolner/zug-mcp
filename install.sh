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
  CLAUDE_DESKTOP=""  # Claude Desktop is not available on Linux
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
if ! command -v git &>/dev/null; then
  echo "git is required. Install it (e.g. apt install git / brew install git)." && exit 1
fi
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm
fi

# ── JSON config helpers (node-based, no python3 dependency) ──────────────────
patch_mcp_config() {
  local config_path="$1"
  local server_dir="$2"
  node - "$config_path" "$server_dir" << 'JSEOF'
const fs = require('fs');
const [configPath, serverDir] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers.zug = { type: 'stdio', command: 'npx', args: ['tsx', serverDir + '/src/stdio.ts'] };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
JSEOF
}

patch_http_config() {
  local config_path="$1"
  local http_url="$2"
  local http_token="$3"
  node - "$config_path" "$http_url" "$http_token" << 'JSEOF'
const fs = require('fs');
const [configPath, url, token] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.mcpServers = config.mcpServers || {};
config.mcpServers.zug = { command: 'npx', args: ['mcp-remote', url + '/mcp', '--header', 'X-Zug-Token:' + token] };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
JSEOF
}

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

info "Building..."
pnpm build

# ── Install zug CLI globally ──────────────────────────────────────────────────
info "Installing zug CLI..."
if pnpm link --global 2>/dev/null; then
  success "zug CLI installed (run 'zug status' to verify)"
  # Ensure pnpm global bin is in PATH
  PNPM_BIN="$(pnpm bin -g 2>/dev/null)"
  if [[ -n "$PNPM_BIN" ]] && [[ ":$PATH:" != *":$PNPM_BIN:"* ]]; then
    warn "Add pnpm global bin to your PATH to use 'zug' from anywhere:"
    warn "  echo 'export PATH=\"$PNPM_BIN:\$PATH\"' >> ~/.zshrc  # or ~/.bashrc"
  fi
else
  warn "Could not link zug CLI globally. Using alias fallback:"
  warn "  echo 'alias zug=\"pnpm --prefix $SERVER_DIR cli\"' >> ~/.zshrc"
fi

# ── Register PreCompact hook ──────────────────────────────────────────────────
SETTINGS_JSON="$HOME/.claude/settings.json"
ZUG_BIN="$(command -v zug 2>/dev/null)"
if [[ -n "$ZUG_BIN" && -f "$SETTINGS_JSON" ]]; then
  info "Registering PreCompact hook..."
  node - "$SETTINGS_JSON" "$ZUG_BIN" << 'JSEOF'
const fs = require('fs');
const [settingsPath, zugBin] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.hooks = settings.hooks || {};
settings.hooks.PreCompact = (settings.hooks.PreCompact || []).filter(
  h => !h.hooks?.some(e => e.command?.includes('zug compact'))
);
settings.hooks.PreCompact.push({
  matcher: "",
  hooks: [{ type: "command", command: zugBin + " compact" }]
});
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
JSEOF
  success "PreCompact hook registered ($ZUG_BIN compact)"
else
  warn "Could not register PreCompact hook — add manually to ~/.claude/settings.json:"
  warn '  { "hooks": { "PreCompact": [{ "matcher": "", "hooks": [{ "type": "command", "command": "zug compact" }] }] } }'
fi

# ── Register SessionStart hook (post-compaction resume) ───────────────────────
# ZUG_BIN and SETTINGS_JSON already resolved above
if [[ -n "$ZUG_BIN" && -f "$SETTINGS_JSON" ]]; then
  info "Registering SessionStart hook..."
  node - "$SETTINGS_JSON" "$ZUG_BIN" << 'JSEOF'
const fs = require('fs');
const [settingsPath, zugBin] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.hooks = settings.hooks || {};
settings.hooks.SessionStart = (settings.hooks.SessionStart || []).filter(
  h => !h.hooks?.some(e => e.command?.includes('zug resume'))
);
settings.hooks.SessionStart.push({
  matcher: "compact",
  hooks: [{ type: "command", command: zugBin + " resume" }]
});
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
JSEOF
  success "SessionStart hook registered ($ZUG_BIN resume)"
fi

# ── Create data directories ────────────────────────────────────────────────────
info "Creating data directories..."
mkdir -p "$ZUG_DIR/sessions"

# ── Seed PERSONA.md if missing ────────────────────────────────────────────────
if [[ ! -f "$ZUG_DIR/PERSONA.md" ]]; then
  info "Running onboarding to seed your cognitive fingerprint..."
  npx tsx "$SERVER_DIR/src/cli.ts" onboard || true
  # Check the outcome, not the exit code: onboarding exits 0 when it skips
  # (non-interactive shell, no answers given) and leaves no PERSONA.md behind.
  if [[ ! -f "$ZUG_DIR/PERSONA.md" ]]; then
    cp "$SERVER_DIR/templates/PERSONA.template.md" "$ZUG_DIR/PERSONA.md"
    success "Created $ZUG_DIR/PERSONA.md — edit this to customize your fingerprint"
  fi
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

# ── HTTP mode: configure all clients for remote fly.io server ────────────────
if [[ "$1" == "--configure-http" ]]; then
  HTTP_URL="$2"
  HTTP_TOKEN="$3"

  if [[ -z "$HTTP_URL" || -z "$HTTP_TOKEN" ]]; then
    echo "Usage: install.sh --configure-http <url> <token>"
    echo "Example: install.sh --configure-http https://zug-mcp.fly.dev test-token-abc"
    exit 1
  fi

  # Persist so future installs auto-use HTTP mode
  printf 'ZUG_URL=%s\nZUG_TOKEN=%s\n' "$HTTP_URL" "$HTTP_TOKEN" > "$ZUG_DIR/config"
  success "Saved HTTP config to $ZUG_DIR/config"

  info "Configuring clients for HTTP transport: $HTTP_URL"

  # Claude Code (~/.claude.json)
  CLAUDE_JSON="$HOME/.claude.json"
  if [[ -f "$CLAUDE_JSON" ]]; then
    patch_http_config "$CLAUDE_JSON" "$HTTP_URL" "$HTTP_TOKEN"
    success "Claude Code configured for HTTP ($CLAUDE_JSON)"
  else
    warn "~/.claude.json not found — skipping Claude Code config"
  fi

  # Claude desktop — uses mcp-remote proxy (Desktop only supports stdio, not HTTP)
  if [[ -n "$CLAUDE_DESKTOP" && -f "$CLAUDE_DESKTOP" ]]; then
    patch_http_config "$CLAUDE_DESKTOP" "$HTTP_URL" "$HTTP_TOKEN"
    success "Claude desktop configured via mcp-remote proxy ($CLAUDE_DESKTOP)"
  else
    warn "Claude desktop config not found — skipping"
  fi

  echo ""
  success "HTTP configuration complete!"
  echo ""
  echo "Restart Claude Code and Claude desktop to pick up the changes."
  echo ""
  echo "Note: Claude.ai web requires OAuth — raw token headers are not supported."
  echo ""
  exit 0
fi

# ── Auto-detect HTTP mode from saved config ───────────────────────────────────
ZUG_CONFIG="$ZUG_DIR/config"
if [[ -f "$ZUG_CONFIG" ]]; then
  source "$ZUG_CONFIG"
  if [[ -n "$ZUG_URL" && -n "$ZUG_TOKEN" ]]; then
    info "Found saved HTTP config — configuring for remote server ($ZUG_URL)"
    [[ -f "$HOME/.claude.json" ]] && patch_http_config "$HOME/.claude.json" "$ZUG_URL" "$ZUG_TOKEN" && success "Claude Code configured for HTTP"
    [[ -n "$CLAUDE_DESKTOP" && -f "$CLAUDE_DESKTOP" ]] && patch_http_config "$CLAUDE_DESKTOP" "$ZUG_URL" "$ZUG_TOKEN" && success "Claude desktop configured for HTTP"
    echo ""
    success "Zug installed successfully (HTTP mode)!"
    echo ""
    echo "Restart Claude Code and Claude desktop to pick up the changes."
    echo ""
    exit 0
  fi
fi

# ── Register with Claude Code (~/.claude.json) ────────────────────────────────
CLAUDE_JSON="$HOME/.claude.json"
if [[ -f "$CLAUDE_JSON" ]]; then
  info "Configuring Claude Code MCP (~/.claude.json)..."
  patch_mcp_config "$CLAUDE_JSON" "$SERVER_DIR"
  success "Claude Code MCP configured"
else
  warn "~/.claude.json not found — Claude Code may not be installed yet"
fi

# ── Register with Claude desktop ──────────────────────────────────────────────
if [[ -n "$CLAUDE_DESKTOP" && -f "$CLAUDE_DESKTOP" ]]; then
  info "Configuring Claude desktop..."
  patch_mcp_config "$CLAUDE_DESKTOP" "$SERVER_DIR"
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
