# Zug OSS Distribution — Design Spec

**Date:** 2026-05-24  
**Phase:** 1 of 3  
**Status:** Approved — ready for implementation planning

---

## Overview

Make Zug installable by anyone in under 2 minutes. The goal is a single npm package that registers Zug's MCP server with Claude Code, Cursor, and Windsurf automatically, with no manual config editing required. All data stays on the user's machine. MIT licensed. No artificial feature restrictions.

This is Phase 1 of a three-phase product arc:
- **Phase 1 (this spec):** OSS distribution — local, installable, agent-agnostic
- **Phase 2:** Zug Cloud — hosted sync, Clerk auth, cross-device memory
- **Phase 3:** Premium dashboard — growth visualizations, cross-session search, team workspaces

---

## Positioning

**Headline:** The memory and reflection layer for people who work with AI.  
**Subhead:** Observations. Patterns. Lessons. Growth — across every session, every agent.

**Target user:** AI power users already running Claude Code, Cursor, or Windsurf. Comfortable with terminals and config files. No GUI installer needed.

**Business model:** OSS core is genuinely free, complete, and self-hostable — no artificial caps. The paid tier (Phase 2+) adds connectivity: cross-device sync, hosted endpoint, and features that only make sense with a network layer. Users who self-host get everything; paying users get convenience and premium capabilities.

---

## Package

| Property | Value |
|----------|-------|
| npm package name | `zug-mcp` |
| CLI command | `zug` |
| MCP server binary | `zug-mcp` |
| License | MIT |
| Repository | Public GitHub, single branch — no community/enterprise split |
| Hosted infra | Separate private repo (Phase 2) |

The package ships two binaries:
- **`zug-mcp`** — the MCP server that agents connect to (stdio transport for local use)
- **`zug`** — the setup and management CLI

The data directory (`~/.zug/`) is never part of the package. It is created on first run and belongs entirely to the user. The Anthropic API key is stored in `~/.zug/.env` and never touched by npm.

---

## Install Experience

```
npm install -g zug-mcp
zug setup
```

Two steps. That's the entire install.

### `zug setup` behavior

Auto-detect mode (default):
1. Scans for Claude Code (`~/.claude/`), Cursor (`~/.cursor/`), Windsurf (`~/.codeium/windsurf/`)
2. Checks for `ANTHROPIC_API_KEY` in environment or `~/.zug/.env`
3. Shows what was found, asks once before writing anything
4. Writes only what it found — never writes config for an agent that isn't installed
5. Creates `~/.zug/` data directory if it doesn't exist

Explicit mode (scriptable, idempotent):
```bash
zug setup --claude-code          # Claude Code only
zug setup --cursor               # Cursor only
zug setup --windsurf             # Windsurf only
zug setup --all                  # All supported agents
zug setup --claude-code --cursor # Combine flags freely
```

Rules:
- Never overwrites existing MCP config — merges `mcpServers` entry only
- Idempotent — safe to run multiple times
- Explicit flags take precedence over auto-detection
- API key prompt is optional — skippable, tools degrade gracefully without it

---

## Agent Configuration

### Claude Code — first-class

`zug setup` writes two things:

**`~/.claude.json`** — adds the MCP server entry:
```json
{
  "mcpServers": {
    "zug": {
      "command": "zug-mcp",
      "args": []
    }
  }
}
```

**`~/.claude/rules/zug.md`** — writes the Zug behavioral rules file. This is the "always on" layer: it instructs Claude Code to call `zug_get_context` at session start, save observations when patterns appear, and call `zug_end_session` at wind-down. This file is what makes Zug autonomous in Claude Code.

### Cursor and Windsurf — MCP config only

**Cursor** → `~/.cursor/mcp.json`  
**Windsurf** → `~/.codeium/windsurf/mcp_config.json`

Both receive the same MCP server entry. Neither has a writable global rules directory equivalent to Claude Code's `~/.claude/rules/`, so the rules file approach does not apply.

### Two-tier autonomy model

Zug uses a two-tier approach for agent autonomy:

**Tier 1 — Claude Code:** Rules file guarantees autonomous behavior. Zug calls tools at the right moments without user prompting. This is the gold-standard experience.

**Tier 2 — All other MCP agents:** The MCP server is initialized with a top-level `instructions` field (part of the MCP spec's server initialize response). Any well-behaved MCP client includes these instructions in its context, which guides the agent to call Zug tools appropriately. Behavior depends on how well each client follows the MCP spec.

The README is honest about this difference: Claude Code is first-class; other agents get the tools and guidance, but the experience varies.

### Phase 2 upgrade hook

`zug setup --cloud [token]` swaps the local binary for a hosted URL across all configured agents in one command:

```json
{
  "mcpServers": {
    "zug": {
      "url": "https://zug.ai/mcp/[token]"
    }
  }
}
```

This is the subscriber activation flow — one command, all agents updated simultaneously.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `zug setup [flags]` | Detect and configure agents. Writes MCP config + `rules/zug.md` for Claude Code. |
| `zug status` | Show which agents are configured, data dir size, session count, last session date. |
| `zug update` | Runs `npm install -g zug-mcp@latest`. Leaves agent configs intact. |
| `zug setup --cloud [token]` | *(Phase 2)* Swap local binary for hosted URL across all configured agents. |

---

## What Ships

All 16 current MCP tools ship in the OSS package. No features are gated.

**Memory**
- `zug_get_context` — load persona, patterns, lessons, and open threads at session start
- `zug_save_observation` — record a notable observation about the user's thinking or patterns
- `zug_end_session` — write session log, run synthesis, append growth snapshot
- `zug_get_recent_sessions` — retrieve recent session summaries
- `zug_status` — stats: session count, observation count, persona size, last session

**Learning**
- `zug_create_lesson` — promote a pattern to a named, tracked lesson
- `zug_lesson_digest` — formatted list of active lessons ranked by reinforcement
- `zug_lesson_update` — edit or deprecate a lesson
- `zug_reinforce_lesson` — increment reinforcement count when a lesson's pattern recurs
- `zug_open_thread` — surface a question or tension to carry across turns
- `zug_close_thread` — resolve or defer an open thread
- `zug_get_open_thread` — retrieve the current unresolved thread
- `zug_growth_summary` — trend digest: observation rate, top patterns, persona growth

**Patterns**
- `zug_reinforce_pattern` — increment count on a reinforced behavioral pattern
- `zug_get_top_patterns` — ranked list of most-reinforced patterns

**Analysis**
- `zug_reasoning_analysis` — 6-lens parallel Haiku analysis (requires Anthropic API key)

The `zug_reasoning_analysis` tool requires an Anthropic API key to make parallel Haiku calls. Setup detects `ANTHROPIC_API_KEY` in the environment; if absent, the tool returns a clear "no API key configured" message rather than failing silently.

---

## GitHub Repository

- **License:** MIT
- **Structure:** Single public repo, no community/enterprise branch split
- **README:** Opens with the positioning headline (Option C), install one-liner, what it does, agent support table (honest about two-tier autonomy), contributing guide link
- **CONTRIBUTING.md:** How to run tests (`pnpm test`), how to run locally (`pnpm dev`), PR guidelines
- **Issue templates:** Bug report, feature request
- **`.gitignore`:** Includes `.superpowers/`, `dist/`, `node_modules/`, `.env`

---

## Out of Scope (Phase 1)

The following are explicitly excluded from this phase:

- Multi-device sync or cross-device memory
- Web dashboard or growth visualization UI
- User accounts, billing, or subscription management
- Team or shared memory workspaces
- GUI installer (deferred — can be added later if a less technical audience needs it)
- Additional agent integrations beyond Claude Code, Cursor, Windsurf (Codex, Continue, Zed, etc.)

---

## Open Questions (Phase 2 design, not blocking Phase 1)

1. **Clerk auth flow:** How does `zug setup --cloud [token]` get the token to the user? Options: email link after signup, CLI OAuth flow, copy-paste from dashboard.
2. **Sync conflict resolution:** If local and cloud data diverge (offline edits on multiple devices), what wins? Last-write-wins vs. merge strategy.
3. **Phase 2 trigger for `zug_reasoning_analysis`:** User confirmed offer-based (Zug suggests, user accepts) after 3+ decision-mode exchanges, at most once per session. See `docs/superpowers/plans/2026-05-24-multi-lens-trigger-contract.md`.
