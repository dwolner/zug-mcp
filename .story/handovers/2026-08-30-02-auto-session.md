# Handover — Zug synthesis pipeline repair + dashboard prototype

Branch `story/zug-pipeline-fixes`, 5 commits, all off `main`. **Nothing is deployed.**

## What started this

A question: "do we have a story for creating a dashboard?" (yes, T-056, blocked). The user wanted a local prototype instead, to find out what display of Zug's own data is worth building. Building it required looking at the data, and the data said the pipeline was broken.

## Root causes found

**PERSONA.md had not been synthesized since ~2026-05-26.** Three months. Fly logs showed `synthesis task failed for default: Request timed out.` on every push.

- **ISS-045** — synthesize() re-emits PERSONA+PLAYBOOK+ACTIVE verbatim: 3,790 output tokens at ~72 tok/s = **52.9s measured**, against a hardcoded `timeout: 30_000`. Could never complete. Fixed: streaming + `SYNTHESIS_TIMEOUT_MS = 300_000`.
- **ISS-046** — fixing the timeout exposed the next gate immediately: `max_tokens: 4096` against ~4,006 tokens of required output, 90 tokens of headroom. `PERSONA_LINE_LIMIT = 600` gated the trim instruction ~5x beyond where the ceiling already broke things, so the guardrail could never fire. Both were independent magic numbers. Fixed: derived from the measurement, with an invariant test asserting worst-case generation fits the timeout.
- **ISS-047** — the reason it ran undetected. Only signal was a console.error on a Fly machine; `zug_end_session` asserted "synthesis runs on the server" throughout, and `getStaleGrowthWarning` watched observation INPUT, which kept arriving. Fixed: durable per-tenant outcome file, every exit path records why, and `getFrozenPersonaWarning()` watches persona output.
- **ISS-048** — reinforcement fired 3 times in 192 sessions, all count 1, so no lesson could ever be promoted.

## The decision that mattered

ISS-048's original fix direction was "auto-call the existing matcher." **The dashboard disproved it before the ticket closed.** Run over the real 131 observations at the production threshold: 131 clusters, 0 recurrences. Firing on every observation would have produced the identical empty pipeline while appearing to work. The sweep also showed `sharedCount >= 2` is dead code against prose — jaccard always binds.

So ISS-048 was implemented as its opposite: match on a short canonical `pattern` key the agent supplies, not on observation prose (verified 5/5 true positives, 3/3 true negatives on short keys), PLUS the forcing function. That prototype earning its keep mid-session is the whole argument for T-058.

## Verification standard used

Every fix was proved against the real system, not mocks:
- ISS-045/046: real API + live corpus → 118-line persona in, **126 out**, 69.0s. First successful synthesis in three months.
- ISS-047: run against the real 201-snapshot growth.jsonl → old detector returns `null`, new one fires with correct figures.
- ISS-048: real `runEndSession` path, three sessions, three different phrasings → collapsed to one pattern at 3x, lesson-candidate block rendered.
- T-058: rendered in a browser, both screenshots inspected, no console errors.

## Corrections made against my own claims

1. "cannot ship with the landing page" — wrong. `next build` still emits `ƒ /dashboard`; the gate is a RUNTIME 404, not build-time exclusion. Sufficient (notFound runs before any read) but overstated; code comment and plan corrected.
2. Brand palette FAILS as a categorical chart palette (lightness band, chroma floor, contrast) — independently corroborates **ISS-044**. Replaced with a validated 5-hue set; hue ORDER is load-bearing since the validator scores adjacent pairs.

## Review caveat — read this

`codex` is not installed on this machine and no review tool is exposed, so **every plan and code review this session was a self-review by the author**. Three real defects were still caught and fixed (greedy citation regex swallowing body text, categorical hue reuse, RangeError on a malformed timestamp — each confirmed by execution). But a genuine second opinion is still owed, especially before the T-058 patterns get reused for T-056.

## Next

1. **Deploy to Fly.** All four server fixes are inert until then; PERSONA stays frozen. This was deliberately excluded from the autonomous session — pushing to a live server unattended is the user's call.
2. After deploying, check `zug_status` for the new warnings and confirm PERSONA moves off 118 lines.
3. `pnpm dev` in `web/`, open `/dashboard` — it is a dev-only route and 404s in any production build.
4. ISS-048 has no retroactive backfill: the 131 existing observations carry no pattern key. A backfill would need an LLM pass and its own ticket.
5. T-056 stays open and blocked by T-045. Feed the prototype's findings into its scope rather than closing it with this.
