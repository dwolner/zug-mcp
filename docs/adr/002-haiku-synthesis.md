# ADR-002: Haiku for synthesis, not a larger model

**Status:** Accepted  
**Date:** 2026-03-23  

## Context

Zug synthesizes observations into PERSONA.md and PLAYBOOK.md at session end. The synthesis prompt is complex (conservative update rules, XML output format, multi-file context). Options: Haiku, Sonnet, Opus.

## Decision

Use `claude-haiku-4-5-20251001` for synthesis. Synthesis runs in the background after the MCP response is returned.

## Rationale

- **Cost.** Synthesis runs after every session with meaningful observations. At Haiku pricing, this is negligible. Sonnet would be 3-5x more expensive per synthesis with no clear quality benefit for structured, conservative updates.
- **Speed.** Haiku is fast enough that background synthesis completes before the user's next session start in almost all cases.
- **Task fit.** The synthesis task is structured and constrained: update only what you have evidence for, return verbatim XML. This is a mechanical task, not one requiring deep reasoning.
- **Fallback.** If synthesis fails or produces no output, the raw appended observations remain in PERSONA.md. No data is lost.

## Consequences

- Synthesis quality is bounded by Haiku's capability. For very complex session patterns, Haiku may produce less nuanced integrations than Sonnet would. This is acceptable given the conservative prompt design.
- 30-second timeout and 2 retries (SDK default) on the API call. Transient failures are retried; hard failures fall back to append mode.
- Model constant is `HAIKU_MODEL` in `src/api-key.ts` — update there to switch models.
