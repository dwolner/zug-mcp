# Architecture

## Overview

```
Claude (any surface)
  │
  │ MCP protocol
  ▼
Zug MCP Server (~/.zug/server/)
  │
  │ file I/O
  ▼
~/.zug/ (data directory)
  ├── PERSONA.md       ← cognitive fingerprint
  ├── PLAYBOOK.md      ← universal learning patterns
  ├── observations.jsonl
  └── sessions/
```

## Source Files

| File | Role |
|---|---|
| `src/storage.ts` | All file I/O. Reads/writes PERSONA, PLAYBOOK, observations, sessions. No business logic. |
| `src/server.ts` | MCP tool definitions. Calls storage, returns results. No transport concerns. |
| `src/stdio.ts` | Entry point for Claude Code / Claude desktop (stdio transport). |
| `src/http.ts` | *(Phase 3)* Entry point for Claude.ai web (HTTP/SSE transport). |

## Transport

Phase 1 uses stdio — Claude Code spawns the MCP server as a child process and communicates via stdin/stdout. This is the simplest possible setup and works entirely locally.

Phase 3 adds an HTTP server using the same `server.ts` logic. A Cloudflare tunnel exposes it to Claude.ai web. Both transports read/write the same `~/.zug/` data directory.

## Data Model

### observations.jsonl
One JSON object per line, append-only:
```json
{
  "timestamp": "2026-03-09T14:00:00Z",
  "type": "cognitive_pattern",
  "observation": "Resists ideas initially, then comes around after reflection",
  "session_id": "2026-03-09-learning-companion",
  "confidence": "high"
}
```

Types: `cognitive_pattern | preference | mistake | breakthrough | context`
Confidence: `low | medium | high` (low is never written to PERSONA.md)

### PERSONA.md
Human-readable markdown. Starts manually seeded, grows via session appends (Phase 1) or Haiku synthesis (Phase 2). Capped at ~600 lines with summarization.

### PLAYBOOK.md
Universal patterns — not about the user but about what works in learning sessions. Updated less frequently than PERSONA.md.

### sessions/YYYY-MM-DD-{id}.md
Full session log: summary + all observations from that session. Source of truth for reprocessing history if PERSONA.md gets corrupted.

## Adding a New Tool

1. Add a function to `storage.ts` if new file I/O is needed
2. Add a `server.tool()` call in `server.ts`
3. Update the Zug rule in `prompts/zug-rule.md` if Claude needs new instructions for when to call it

## Phase 2: Haiku Synthesis

When implemented, `zug_end_session` will:
1. Collect session observations from `observations.jsonl`
2. Read current PERSONA.md and PLAYBOOK.md
3. Call `claude-haiku-4-5-20251001` with a conservative synthesis prompt
4. Write updated files (add-only policy, trim if over threshold)
5. Fall back to the Phase 1 append behavior if the API call fails

The synthesis prompt must include: "Update only what you have direct evidence for from this session. Do not remove existing observations unless you have contradicting evidence. Be conservative."
