# Session Handover — ISS-042, ISS-043, T-044 (multi-tenancy foundation)

## Summary
Targeted session that cleared two low-severity sync/hook bugs, then landed T-044 — the long-pole multi-tenancy foundation (ADR-005 decision 1). Sequencing was deliberately changed at the user's direction: do the two issues FIRST, because ISS-043 lives in sync-server.ts — exactly the code T-044 rewrites — so fixing it in the simple single-tenant version avoids re-deriving it in churned code.

## Completed (3 commits on main)
- **ISS-042** (`48f1246`): Removed the dead pre-compact checkpoint print from `cmdCompact` (cli.ts). PreCompact stdout is never injected into the model (only SessionStart is), so the printed '# Zug Checkpoint' was misleading dead code. cmdCompact now does the durability push only + an honest one-line log. Updated usage text.
- **ISS-043** (`cd0aee2`): Sync cursor no longer advances to the server wall-clock `highWater`. Added `advanceCursor()` in sync.ts that moves pullSince/pushSince to max(current, latest obs+growth entry timestamp), never regressing — closing the clock-skew skip window where a back-dated entry <= an advanced cursor was permanently dropped. Updated 2 assertions + 3 regression tests. NOTE: the guide skipped this issue's finalize step (jumped straight to PICK_TICKET), so it was committed manually/atomically.
- **T-044** (`ee2c641`): Multi-tenant namespacing. Tenancy threaded via AsyncLocalStorage (not a userId param on ~50 storage fns) so storage signatures + all stdio/test call sites stay unchanged (no scope -> flat legacy path). New: tenancy.ts (runWithTenant, assertSafeUserId, toUserId, getUsersRoot, idempotent migrateLegacyData w/ .migrated marker), synthesis-queue.ts (per-user serial chains: same-user serialized, cross-user concurrent, error-isolated, self-evicting). Modified: storage.getPaths() reads ALS + containment check (now exported); sync-state.getSourceId() tenant-aware; server.ts + sync-server.ts route synthesis through the queue (sync-push now non-blocking); http.ts resolveUserId + both /mcp branches + /sync wrapped in runWithTenant + transports keyed by ${userId}:${sessionId} + async main() awaits migration before listen; fly.toml ZUG_USERS_ROOT/ZUG_DEFAULT_USER_ID (nested under existing mount, no volume remount).

## Process
- Plan reviewed 2 rounds (codex unavailable -> agent backend). Round 1 caught a real bug: getSourceId() leaked to the flat path because createLesson calls it inside a tenant scope. Fixed. Round 2 approved.
- Code review: approve, no blocking/important. 2 minors addressed (try/catch on /sync/pull; outer scope-entry guards on /mcp + /sync/push).
- Verification: typecheck clean, 194/194 tests pass (+15), build clean, end-to-end dist smoke confirms migration (no loss), two-tenant isolation, and path-traversal block.

## Why remaining targets couldn't be worked
None remain — ISS-043 was the only item the guide listed as still pending, and it was already resolved (committed `cd0aee2`). All 3 targets are done.

## Next steps / follow-ups
- T-044 unblocks T-045 (SQLite control plane + real account/credential->userId mapping; replaces provisional OAuth-clientId/default-token identity), T-046 (per-user synthesis cap — the queue's `shouldSynthesize` seam is in place), T-047 (export/erasure — each user is now a self-contained dir), T-051 (tier gate).
- DEPLOYMENT NOTE: T-044 changes fly.toml env and the on-disk layout. On first boot the server runs migrateLegacyData() which relocates /data/.zug flat content into /data/.zug/users/default/.zug. Tenants are nested under the EXISTING mount (no volume remount). The ADR's literal /data/users/<id>/.zug layout (requires a remount) is deliberately deferred.
- Uncommitted on main (left intentionally): docs/adr/005-multi-tenancy-accounts-billing.md, docs/brand.md, T-045..T-053 ticket files, and a pre-existing .story/.gitignore change — these are planning artifacts, not part of any single ticket.