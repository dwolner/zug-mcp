# Multi-lens Trigger Contract Design

**Date:** 2026-05-24  
**Status:** Phase 1 decided and implemented; Phase 2 open

## Context

`zug_reasoning_analysis` (T-016) runs 6 parallel Haiku analyses on a piece of the user's reasoning — conceptual clarity, assumption identification, logical consistency, knowledge gaps, analogical reasoning, and meta-cognitive awareness.

The core tension: firing on every message is too expensive (~$0.006/invocation × many messages). Firing only on explicit demand reduces the tool to "ask Claude, but structured." The right trigger fires at inflection points where structured analysis adds the most value.

## Phase 1 Decision (Implemented)

**Explicit tool invocation only.**

The user or Zug calls `zug_reasoning_analysis(text)` manually. This is correct for Phase 1 because:

- Avoids cost explosion while usage patterns are unknown
- The structured 6-lens format IS differentiated from open-ended Claude — it provides parallel, specialized, reproducible analysis
- Zug can recommend calling the tool in decision mode ("Want me to run a full reasoning analysis on this?") without auto-firing it
- Phase 2 auto-trigger can be layered on top once the right signal is validated

## Open Questions for Phase 2

### 1. Trigger Signal

Candidates ranked by signal quality:

| Signal | Cost/session | False positive rate | Notes |
|--------|-------------|---------------------|-------|
| Start of decision mode | Low (once) | Medium | Mode detection is fuzzy |
| User frames a binary choice ("should I X or Y") | Low | Low | Strong signal but misses complex decisions |
| N exchanges into decision mode | Low-medium | Low | Validates that the conversation is substantive |
| Zug detects reasoning quality drop | Very low | Very low | Requires Zug to already be analyzing — circular |
| Keyword patterns ("I'm trying to decide", "what do you think I should do") | Low | Medium | Easy to implement but gameable |

**Recommendation for Phase 2:** Trigger after 3+ exchanges in decision mode, at most once per session, with Zug offering it rather than auto-firing ("I've been tracking your reasoning — want a full analysis?").

### 2. Frequency Cap

- **Per session:** 1 auto-trigger max. Explicit tool invocations are uncapped.
- **Per topic:** Not enforced in Phase 2; user can restart.
- **Rationale:** $0.006 × 1/session = negligible. Multiple auto-triggers per session would feel intrusive.

### 3. Output Disposition

Options:
- **Inline** — returned directly in the conversation
- **Saved as observation** — appended to `observations.jsonl` for persona synthesis
- **Both**

**Recommendation:** Inline first, with an optional `save=true` parameter to also save key findings as observations. Cross-session learning from reasoning patterns is valuable but needs user consent.

### 4. Minimum Lens Set

All 6 lenses run in Phase 1. Phase 2 could allow a `lenses` parameter to select a subset, but this adds complexity without clear value yet. Keep all 6 as the default.

### 5. Cost Acceptance

- 6 lenses × ~200 output tokens × $4/M (Haiku output) ≈ $0.005–0.007 per invocation
- At 1 auto-trigger/session + occasional explicit calls: well under $0.10/session
- At 5 explicit calls/session: ~$0.03 — acceptable

No cost gate needed for Phase 2.

## Phase 2 Implementation Sketch

When ready, add auto-trigger support:

1. In the decision mode gate in `server.ts`, track exchange count
2. After 3 exchanges, set `shouldOfferAnalysis = true`
3. In `zug_get_context` or the next response, include a suggestion to run analysis
4. Clear `shouldOfferAnalysis` after offering once per session

Alternatively: add an `auto` parameter to `zug_reasoning_analysis` that triggers it from within a session-context response when the mode/exchange conditions are met.

## Remaining Open Question for User

The one design question that requires the user's input:

> **Should auto-trigger fire automatically (Zug decides) or as an offer (Zug suggests, user accepts)?**

The recommendation is "offer" — maintains user agency, avoids surprising 6 LLM calls mid-conversation. But if the user prefers fully autonomous Zug behavior, auto-trigger is valid. This should be decided before Phase 2 implementation begins.
