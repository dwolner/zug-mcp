# Session Priming Comparison

Analysis of the three session priming strategies for `zug_get_context`, with real measurements and a scenario-based recommendation.

## Measured context sizes (2026-05-23)

| File | Lines | Bytes | Approx tokens |
|------|-------|-------|----------------|
| ACTIVE.md | 3 | 629 | ~157 |
| PERSONA.md | 113 | 12,356 | ~3,089 |
| PLAYBOOK.md | 75 | 4,957 | ~1,239 |

These grow over time. PERSONA.md in particular grows with every session that produces meaningful observations.

## Strategy comparison

### Strategy 1: Full context (`delta: false`, default)

Loads: ACTIVE.md + full PERSONA.md + full PLAYBOOK.md

**Approx tokens:** ~4,485 (and growing)

**What you get:** Complete cognitive fingerprint — every pattern, preference, and playbook principle ever recorded. Enough to calibrate a full behavioral frame on the first message.

**What you miss:** Nothing. This is the full picture.

### Strategy 2: Delta (`delta: true`)

Loads: ACTIVE.md + last session summary + observations since last session

**Approx tokens:** ~400–600 (stable — bounded by recent activity)

**What you get:** What's new. Enough to pick up where the last session left off without re-reading the whole fingerprint.

**What you miss:** Historical patterns not already internalized. If a pattern appears in the old PERSONA but not in ACTIVE.md, it won't surface.

### Strategy 3: Layered (hypothetical — not implemented)

First call: ACTIVE.md only (~157 tokens). Full context on demand.

**Why not implemented:** Delta already covers this use case at ~400–600 tokens with no extra tool call. The marginal save (~300 tokens) doesn't justify a second decision point. Skipped.

## Key structural finding: ACTIVE.md is effectively free after session 1

`syncRulesContext()` runs inside every `zug_get_context` call and writes ACTIVE.md + a 3-line persona excerpt to `~/.claude/rules/zug-context.md`. Claude Code loads that rules file at the **start of the next session** — so by session 2+, ACTIVE.md is already present in the rules context when `zug_get_context` is called.

Precise timing:
- Session N calls `zug_get_context` → `syncRulesContext()` writes zug-context.md
- Session N+1 starts → Claude Code loads zug-context.md from disk (ACTIVE already present)
- Session N+1 calls `zug_get_context` → ACTIVE is redundant in the response, but PERSONA and PLAYBOOK are not

This means (for established sessions):
- ACTIVE.md loading via `zug_get_context` is redundant — the rules file already provided it
- The real value of calling `zug_get_context` is loading PERSONA.md and PLAYBOOK.md
- Delta is therefore: "just the new stuff on top of what the rules file already injected"
- On a brand-new install (session 1), zug-context.md doesn't exist yet — full context is required

## Recommendation matrix

| Scenario | Mode | Rationale |
|----------|------|-----------|
| Cold session start | **Full** | Need complete cognitive fingerprint to calibrate behavioral frame. ACTIVE alone (in rules) isn't enough to surface nuanced patterns. |
| Post-compaction resume | **Delta** | ACTIVE already re-injected by SessionStart hook; delta gives just what's new since the last session end. |
| Mid-session reconnect | **Delta** | Conversation history provides most context; delta surfaces any observations saved since the last `zug_end_session`. |
| Meta-work on Zug itself | **Full** | When reasoning about Zug's own design, having the full fingerprint avoids blind spots. |

## Current default and `zug-rule.md` guidance

The `zug-rule.md` Session Start Gate says `Call zug_get_context` — this defaults to full context, which is correct for cold starts.

For post-compaction: the SessionStart hook fires `storybloq session resume-prompt` (Storybloq's compaction recovery), not a Zug-specific hook. After compaction, the AI re-reads the rules file (which has ACTIVE via `zug-context.md`) and typically calls `zug_get_context` again as part of re-establishing context — delta is appropriate here.

**Recommended:** add post-compaction guidance to `zug-rule.md` so that after compact+resume, the AI uses delta instead of re-loading the full 4,485-token fingerprint.

## Token cost over time

PERSONA.md grows ~10–20 lines per session with meaningful observations. At current growth rate (~2 lines/session), it will reach 200 lines (~5,000 tokens) within ~45 more sessions. Delta remains stable at ~400–600 tokens regardless of PERSONA size.

The case for defaulting cold starts to full context remains valid. The case for defaulting post-compaction to delta becomes stronger as PERSONA grows.
