# Changelog

All notable changes to zug-mcp are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Synthesis broke again on 2026-09-20 — and this time the constant that would normally be raised had
nowhere left to go. The shape is what changed, not the number: one call re-emitting both documents
becomes one call per document, and the growth that outran the ceiling is now bounded by a compaction
pass that measures its own effect.

### Fixed
- **Synthesis truncated on every run (ISS-054).** `synthesize()` asked the model to re-emit PERSONA +
  PLAYBOOK verbatim in a single call, so required output tracked total corpus size rather than the
  size of the change. At 18,438 tokens against a 16,384 ceiling, every synthesis truncated, returned
  null, and wrote nothing — while still spending a full generation. Each document now gets its own
  call, so the ceiling applies per document instead of to their sum.
- **Compaction is now a control loop, not a sentence (ISS-054).** ISS-046's "summarize the oldest
  dated sections" instruction sat in every prompt from roughly July while the corpus grew 39 KB → 73 KB
  and synthesis kept succeeding — nothing ever measured whether it worked. A document over
  `COMPACTION_TRIGGER_TOKENS` now gets a dedicated compaction call, its result is checked against the
  trigger, and `outcome: compaction-failed` is recorded when it did not shrink. The pre-compaction
  text is appended to `PERSONA.archive.md` / `PLAYBOOK.archive.md` first, so nothing is lost.
- **Session evidence no longer leaks into the documents (ISS-054).** A live run returned the prompt's
  own `## Session Summary` heading as a PERSONA section. Inputs are now fenced and explicitly marked
  as not part of the document.
- **Reinforcement counts are data again (ISS-054).** The same run rewrote them upward — `[1x]` 17 → 1,
  `[2x]` 6 → 15 — manufacturing evidence of recurrence for patterns seen once. The counts come from
  `reinforcements.jsonl` and must now be copied exactly.

- **Synthesis inputs captured before the queue (ISS-055).** `handleSyncPush` and `handleEndSession`
  read PERSONA and PLAYBOOK before calling `enqueueSynthesis`, so a task queued behind another one
  carried a snapshot taken before that task rewrote the files. The queue serializes synthesis
  precisely to prevent PERSONA read-modify-write races; reading outside it defeated the point.
  Caught in production: a run reported "needed ~18438 tokens" four minutes after the files on disk
  were already 16k tokens smaller. A stale task that *succeeds* overwrites the newer document with
  one derived from pre-write state. Both call sites now read inside the task.
- **`zug backup` never worked against a Fly install (ISS-056).** It created the destination
  directory and then ran `fly sftp get`, which creates the destination itself and refuses to write
  into an existing path — so every run failed, and the empty directory it left behind made the next
  run fail identically. Only the parent is created now, same-day repeats get a `-HHMMSS` suffix, and
  a failed run cleans up after itself.

### Added
- **Partial synthesis is representable (ISS-054).** One document failing used to discard the other's
  work, because both came from the same call. `SynthesisResult.complete` distinguishes a full absorb
  from a half one, and `advanceSynthesisHighWater` / `archiveObservations` gate on it — a partial run
  re-feeds its observations rather than stranding them (ISS-050 through a new door).
- **`zug_status` watches bytes, not lines (ISS-054).** Line count is what hid this: PERSONA went
  31 → 224 lines (7x) while going 1,497 → 44,750 bytes (30x), because the model integrates into
  existing lines exactly as instructed. Status now reports token estimates for both documents and
  warns when either is over the compaction trigger.

## [1.3.1] — 2026-08-31

A first-run repair. 1.3.0 shipped a `zug onboard` that three surfaces promised and the CLI never
handled, so a fresh install dead-ended on its own instructions. Both that bug and the
`version-check.js` packaging failure in 1.3.0 were drift between hand-maintained documents — the
`files` allowlist, the CLI dispatch, and the README — so this release also adds the tests that
compare them to each other, and runs those tests on publish.

### Fixed
- **`zug onboard` is a real command (ISS-052).** `src/onboard.ts` has existed and worked since
  T-009, but the CLI dispatch never had an `onboard` case on any branch — while `zug setup`,
  `zug persona`, and the README all told users to run it. It is now dispatched (loaded on demand,
  so no other command pays for the Anthropic SDK) and `dist/onboard.js` is published.
- **`install.sh` seeds a PERSONA.md again.** It invoked `src/onboard.ts` directly and keyed its
  template fallback off the exit code. Onboarding exits 0 when it skips, so a non-interactive
  install fell through both paths and left no PERSONA.md — while the final instructions told the
  user to edit it. The fallback now checks the outcome, not the exit code.
- Stale `pnpm onboard` hints in published output now say `zug onboard`.
- A missing `dist/onboard.js` reports `[zug] Onboarding error:` instead of an unhandled rejection.

### Added
- **Packaging invariants (`src/packaging.test.ts`).** Six executable checks over the seams that
  broke twice: every module reachable from a published entrypoint's import graph is in `files`;
  every `files` entry has a backing source; README, usage text, and dispatch agree in both
  directions; published code never tells a user to run a repo script; and a file invoked as a
  script actually self-executes.
- `prepublishOnly` now runs the test suite, not just the build — the invariants only bind if the
  release path runs them.

### Changed
- `zug onboard` no longer triggers the update-version check, which added up to 1.5s of dead air on
  a cold cache immediately after the interactive flow.

## [1.3.0] — 2026-08-31

The synthesis pipeline repair. Synthesis had been failing or silently dropping input since before
1.2.0; this release fixes the failure, the invisibility, and the data loss, and closes the
reinforcement loop that fed it.

### Fixed
- **Synthesis dropped observations permanently (ISS-050).** `handleSyncPush` both gated on and fed
  from `payload.observations` — a single push's delta — while the sync cursor advanced past
  everything it sent. Any observation belonging to a failed synthesis attempt was offered exactly
  once and then lost. Now a server-owned `lastSynthesizedAt` cursor in `synthesis-status.json`
  advances only after synthesis succeeds *and* its output is written. Recovery run: 66 observations
  spanning 2026-05-28 → 2026-08-31 were on the volume but absent from PERSONA; PERSONA went
  118 → 207 lines.
- **Synthesis timed out on every push (ISS-045).** A 30s client timeout against ~53s of actual
  generation. Synthesis now streams and the timeout clears measured generation time.
- **Output budget derived from measurement (ISS-046).** The `max_tokens` ceiling left 7.5%
  headroom, so the `PERSONA_LINE_LIMIT` guardrail could never engage. The dead line limit is gone.
- **Silent failure (ISS-047).** Synthesis outcome is now recorded and detectable instead of
  visible only in Fly logs, where `zug_status` and `zug_end_session` both reported success.
- **Status never reached synced clients (ISS-049).** `synthesisStatus` now rides the pull response,
  alongside a `synthesisBacklog()` count — shipping the outcome alone would have rebuilt the blind
  spot, since `outcome: ok` describes the last batch and says nothing about input never offered.
- **`dist/version-check.js` was missing from `files`.** `dist/cli.js` required it at load, so any
  publish from that revision shipped a binary that died with MODULE_NOT_FOUND on every command.
  Latent since T-054.
- The frozen-persona detector no longer assumes monotonic counts.

### Changed
- **`session_id` → `sessionId` in the MCP tool schemas.** A breaking rename for anything that pins
  those parameter names; schema-reading callers are unaffected.
- **Reinforcement matches canonical pattern keys and computes recurrence (ISS-048).** Matching
  moved to overlap coefficient at 0.50/3 rather than Jaccard 0.40/2 (T-060). Precision is 86%, so
  lesson promotion keeps its human-review gate.

### Added
- **Update notifier (T-054).** The CLI tells you when a newer `zug-mcp` is published.
- **Work/personal session context (T-059)** — context is stamped onto observations instead of
  being discarded.
- **Local diagnostic dashboard at `/dashboard` (T-058)** and the **zug-web landing page (T-053)**,
  deployed separately from the npm package.

## [1.2.0] — 2026-06-24

Multi-tenancy foundation (ADR-005 decision 1) plus a sharper observation loop. The canonical
server becomes multi-tenant — each authenticated user gets a fully isolated cognitive
fingerprint — and the learning gate stops going quiet as a fingerprint matures.

### Added
- **Per-user storage namespacing (T-044).** Content moves to `<usersRoot>/<userId>/.zug/…`.
  Tenancy is threaded via `AsyncLocalStorage`: `getPaths()` resolves to the active user's
  namespace, or the flat legacy path absent a scope (stdio/local unchanged). The append-only-log
  + projection + merge/synthesize engines are unchanged — they just run per user.
- **Per-user synthesis queue.** Synthesis serializes per user (no PERSONA read-modify-write
  races) while running concurrently across users, so one user's session-end can't block another's.
  This is also the seam for the future per-user abuse cap.
- **Identity + isolation at the HTTP boundary.** Each `/mcp` and `/sync` request runs in a tenant
  scope (OAuth `client_id`, or a shared default for the legacy token); transports are keyed by
  `${userId}:${sessionId}`.
- **Idempotent migration** of existing single-user data into the default namespace on first boot,
  guarded by a `.migrated` marker. New `fly.toml` env: `ZUG_USERS_ROOT`, `ZUG_DEFAULT_USER_ID`.

### Changed
- **Observation Gate rewritten** (the `zug setup` rule) from a one-shot novelty filter into a
  router: new/contradicting → save; evolution/exception/nuance/second-order → save (now treated as
  higher-value as the PERSONA matures); **clean recurrence → `zug_reinforce_observation`** instead
  of being silently dropped. A robust PERSONA shifts *what* is captured, it doesn't make Zug go quiet.
- `zug compact` (PreCompact hook) no longer prints a dead "checkpoint" — PreCompact stdout is never
  injected into the model, so it now performs the durability push only (ISS-042).

### Fixed
- **Sync cursor clock-skew skip window (ISS-043).** The observation/growth cursor now advances to
  the max entry timestamp actually seen rather than the server's wall-clock `highWater`, so a
  back-dated entry under client/server clock skew can no longer be permanently skipped.

## [1.1.0] — 2026-05-28

Local-first single-user sync (ADR-004, slice 1). fs-capable clients become local-first
with background sync to a canonical remote, so a server outage degrades to "sync paused"
rather than total failure, and a single cognitive fingerprint is shared across machines.

### Added
- Three sync modes resolved automatically by `getSyncMode()`: `canonical` (the deployed
  server), `synced` (an fs client with `ZUG_URL` + `ZUG_TOKEN`), and `local-only` (the
  unchanged default).
- `GET /sync/pull` and `POST /sync/push` endpoints, behind the same auth + rate-limit as `/mcp`.
- CLI verbs `zug sync`, `zug pull`, `zug push`, and `zug resume` (compaction reload).
- Sync hooks registered by `zug setup`: `SessionStart` → pull (and reload on compaction),
  `SessionEnd` → push, `PreCompact` → durability push.
- Per-install `~/.zug/source-id` and source-safe lesson IDs (`L-<tag>-<seq>`) so cross-machine
  merges are collision-free by construction.
- `ZUG_CANONICAL` and `ZUG_SYNC_URL` configuration; sync config readable from `~/.zug/config`.

### Changed
- Synced setups synthesize PERSONA/PLAYBOOK/ACTIVE **server-side** over the merged log;
  projections are pulled only, never pushed, so there is exactly one authoritative fingerprint.
- The Fly server is now always-on and canonical (`ZUG_CANONICAL=1`, `auto_stop_machines = 'off'`,
  `min_machines_running = 1`).
- `ZUG_TOKEN` is now the shared bearer credential between the canonical server and its synced
  CLI clients (must match on both), not just a legacy non-OAuth token.

### Fixed
- Graceful degradation: an unreachable server now pauses sync and lets the session continue
  locally, reconciling on the next successful sync — the root cause of the 2026-05-27
  "Session not found" outage class.

## [1.0.0] – [1.0.4] — 2026-05-26

Initial public release: OSS distribution and first-run hardening.

### Added
- Published to npm as `zug-mcp` (MIT), with `zug` and `zug-mcp` binaries.
- `zug setup` auto-detects installed agents (Claude Code, Cursor, Windsurf) and writes MCP config.
- CLI: `zug status`, `zug tail`, `zug persona`, `zug onboard`, `zug update`, `zug archive`, `zug backup`.
- `PERSONA.md` seeded from an embedded template on first setup; idempotent Claude Code hook registration.

### Fixed
- First-run gaps: MCP entries now always include `type: 'stdio'`; missing-`ANTHROPIC_API_KEY`
  warnings; observation pruning after synthesis and >90-day session archiving (archive stays local).

## Earlier

Pre-npm development (Phases 1–6): local stdio transport, Haiku synthesis, HTTP transport,
polish, session fidelity, and advanced persistence. See [ROADMAP.md](./ROADMAP.md) for the
full phase history.
