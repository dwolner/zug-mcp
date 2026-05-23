# ADR-001: File-based storage over a database

**Status:** Accepted  
**Date:** 2026-03-23  

## Context

Zug needs to persist cognitive fingerprint data (observations, PERSONA.md, PLAYBOOK.md, sessions) across Claude Code sessions. Options considered: SQLite, embedded key-value store (LevelDB), plain files.

## Decision

Use plain markdown and JSONL files under `~/.zug/`. No database.

## Rationale

- **Portability.** Files are readable, editable, and transferable without any tooling. A user can read, edit, or back up their PERSONA.md with any text editor.
- **Simplicity.** The access patterns are simple: append observations, read full files for synthesis. No complex queries. A database adds overhead without adding capability.
- **Graceful degradation.** If synthesis fails, the raw markdown files remain intact as the source of truth. Sessions can be reprocessed from `observations.jsonl` at any time.
- **Transparency.** The user can see exactly what Zug knows about them by reading their files.

## Consequences

- No atomic multi-file writes. `zug_end_session` writes session log then PERSONA sequentially — a crash between writes leaves inconsistent state. Accepted for single-user personal tool (ISS-019).
- Full JSONL scan for session-scoped observation queries. Acceptable at current scale (~300 lines); revisit past ~5k observations.
- No indexing. All filtering is in-memory after full file read.
