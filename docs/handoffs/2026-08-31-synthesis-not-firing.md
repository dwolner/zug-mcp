# Handoff — Zug: synthesis still not firing after deploy (2026-08-31)

## Start here

`git -C ~/.zug/server log --oneline -5` → HEAD should be `131f2ee`, branch `main`, clean, pushed.

**The one open task: ISS-050.** Synthesis has not run once, so `PERSONA.md` is still frozen at 118
lines ending `### 2026-05-23`, unchanged since ~2026-05-26. Everything else below is context.

## Read these two gotchas before touching anything

**1. The `zug_*` MCP tools are NOT the Fly server.** `~/.claude.json` has
`"zug" -> {"type":"stdio","command":"zug-mcp"}` — the globally installed npm package, **still
v1.2.0**, which has none of this work. Fly runs the new code; your MCP tools do not. So:
- `zug_status` / `zug_end_session` / `zug_save_observation` all run OLD local code.
- `autoReinforceSession`, `stampSessionContext`, and the `pattern` parameter run **client-side**,
  so they are inactive on this machine until npm publish + `zug update`, or a local `npm link`.
- Only server-side synthesis (triggered on sync push) is affected by the Fly deploy.
- Claude Desktop is different — it uses `mcp-remote` straight to Fly.

**2. Never run `next build` in `web/` while the dev server is up.** They share `.next` and the
running server 500s with `Cannot find module './3.js'`. Use `NEXT_DIST_DIR=.next-verify npx next
build`. Note that a scratch build rewrites `web/next-env.d.ts` — restore it with
`git checkout web/next-env.d.ts` afterwards.

## ISS-050 — the actual problem

Verified INSIDE the running Fly image (machine version 36):
- `SYNTHESIS_TIMEOUT_MS = 300_000` present in `/app/dist/synthesize.js`
- `recordSynthesisOutcome` appears 5× in that file
- `enqueueSynthesis` + the `obsAdded > 0` guard present in `/app/dist/sync-server.js`
- `ANTHROPIC_API_KEY` is SET in the process env
- A pushed observation reached the server (local and server `observations.jsonl` both 137 lines)
- Push at 15:56:26 was AFTER the 15:54:18 deploy

Yet: **no `synthesis-status.json` on either path** — not at
`/data/.zug/users/default/.zug/` (the tenant dir where observations.jsonl lives), nor at
`/data/.zug/` (the flat non-tenant fallback) — and no `[zug] synthesis task failed` in logs.

ISS-047 made EVERY exit path of `synthesize()` record an outcome (ok / timeout / truncated /
malformed / no-api-key / error). So the total absence of a status file means **`synthesize()` was
never invoked**, not that it was invoked and failed. The bug is upstream, in whatever decides to
enqueue.

**Leading hypothesis:** `addObservations(payload.observations)` returned 0 because an earlier push
already delivered those rows, so `obsAdded > 0` in `handleSyncPush` was false. If so the guard is
wrong: it ties synthesis to what THIS push added rather than to whether unsynthesized input exists.
A client that pushes twice in quick succession — the CLI and the session-end hook both do — would
deliver on the first push and never synthesize.

**Next step:** instrument `src/sync-server.ts` to log `obsAdded` and `meaningful.length`, deploy,
push a freshly-created observation, and read the logs to see which branch is taken. If the
hypothesis holds, gate on unsynthesized input (compare against the last recorded synthesis
timestamp) rather than on a single push's delta.

Useful commands:
```
fly logs -a zug-mcp --no-tail | grep -i synthesis
fly ssh console -a zug-mcp -C "sh -c 'cat /data/.zug/users/default/.zug/synthesis-status.json'"
fly ssh console -a zug-mcp -C "sh -c 'wc -l < /data/.zug/users/default/.zug/PERSONA.md'"
cd ~/.zug/server && npx tsx src/cli.ts push
```

## Do NOT redo these — they are done and verified

- **ISS-045** synthesis timed out: re-emitting the corpus costs ~3,790 tokens at ~72 tok/s = 52.9s
  against a 30s client timeout. Now streams, budget 300s. Proven against the real API: 118 lines in,
  126 out, 69.0s.
- **ISS-046** `max_tokens 4096` vs ~4,006 needed (90 tokens headroom), and `PERSONA_LINE_LIMIT=600`
  gated the trim ~5× past where the ceiling already broke it. Both now derived from the measurement,
  with an invariant test that worst-case generation fits the timeout.
- **ISS-047** failures were invisible: durable per-tenant `synthesis-status.json`, every exit path
  records, plus `getFrozenPersonaWarning()` watching persona OUTPUT rather than observation INPUT.
- **ISS-048** reinforcement fired 3× in 192 sessions. Root cause was worse than under-calling: at the
  production threshold all 131 real observations were mutually unique, so auto-calling the old
  matcher would have changed nothing. Fixed with short canonical `pattern` keys + `autoReinforceSession()`.
- **T-058** local dashboard at `/dashboard` (dev only — `notFound()` when NODE_ENV=production).
- **T-059** work/personal context: `stampSessionContext()` inherits session context onto observations.
  64% of history is unattributable and that is accepted; the fix is forward-only.
- **T-060** matcher now uses overlap coefficient 0.50 / sharedCount 3, not Jaccard 0.40/2.
  **Precision is 86%, not 100%** — about 1 merge in 7 is expected wrong, tolerable only because
  `getLessonCandidates` surfaces candidates for review rather than creating lessons directly.

## Also open

- **ISS-049** (medium) `synthesis-status.json` is written server-side but is NOT in the sync pull
  payload, so a synced client never receives it and the dashboard's "LAST SYNTHESIS" tile reads
  "never run" permanently. Fix: add it to `PullResponse` / `handleSyncPull` / `sync.ts` pull.
- **ISS-044** (medium) landing-page brand palette fails WCAG AA. Independently corroborated: those
  tokens also fail as a categorical chart palette (lightness band, chroma floor, contrast), which is
  why the dashboard uses its own validated 5-hue set in `web/lib/chart-palette.ts`. **Hue ORDER
  there is load-bearing** — the validator scores adjacent pairs.

## Caveats on this work

- **Every plan and code review this session was a self-review.** `codex` is not installed and the
  subagent lens path was not permitted, so there has been no independent review. Three real defects
  were caught anyway (greedy citation regex, categorical hue reuse, a RangeError on malformed
  timestamps) but a second opinion is still owed, especially before T-058's patterns feed T-056.
- **T-060's threshold is provisional.** Derived from hand-authored phrasings because there are zero
  real pattern keys in production. Re-derive once a few dozen accumulate — the dashboard's Recurrence
  slider runs that sweep interactively.
- Nothing is published to npm. `zug-mcp` is 1.2.0 both published and local.
