# ADR-004: Local-first resilience + canonical remote sync, with tiered synthesis

**Status:** Accepted
**Date:** 2026-05-28

## Context

Zug is a multi-source product: Claude Code CLI, the desktop app, claude.ai **web**, and multiple machines. The core promise is **one unified persona that treats the user the same everywhere and tracks every session across sources**. Sync is the intended **paid** feature.

Today every client calls the remote MCP server (Fly, HTTP transport — ADR phase-3) for every read/write. On 2026-05-27 a multi-hour session returned `Session not found` on *every* `zug_get_context` / `zug_end_session` call: the Fly machine scales to zero (`auto_stop_machines = stop`, `min_machines_running = 0` — see T-042) and on restart loses its in-memory MCP session. Net effect: no fingerprint loaded, no session log written — Zug delivered zero continuity, which is its entire purpose.

Two hard constraints shape the design:
- **Web and the desktop app cannot access local files**, so a purely-local architecture cannot deliver the cross-source promise. A reachable canonical remote must exist.
- The 2026-05-27 outage was fatal only because the CLI had **no local fallback** — a server blip became total failure instead of graceful degradation.

## Decision

1. **The remote is canonical.** It holds the authoritative merged event log and the derived persona, and is the only surface all clients can reach. Keep it, and keep it always-on for the paid/web path (T-042).
2. **Synthesis runs server-side for synced (paid) users.** Running synthesis once over the merged log, in one place, is what *guarantees* a single unified persona; per-client local synthesis would drift into N divergent fingerprints. (Extends ADR-002.)
3. **fs-capable clients (CLI, desktop) are local-first with background sync.** The local append-only JSONL log is the hot read/write path; sync to the canonical remote happens in the background. A server outage degrades to "sync paused" (keep recording locally, reconcile on reconnect), never "Zug dead." Web is remote-only by necessity.
4. **Tiering = the sync boundary.** Free = local-only (single source). Paid = canonical remote sync (cross-source unified persona, web/desktop access, server synthesis). On upgrade, the user's local history syncs up and comes with them.
5. **Free-tier synthesis runs locally with the user's own Anthropic key (BYOK) — an OSS feature, not paywalled.** We will not lock users out of local synthesis they could trivially self-build. Paid value is the network effect (same-me-everywhere), not the synthesis algorithm. Paid uses Zug's key server-side, cost folded into the subscription. If a free user has no key, fall back to append-only mode (ADR-002 fallback) — still functional, just unsynthesized.

## Rationale

- **Conflict-free by construction.** The source of truth is append-only logs (`observations`/`reinforcements`/`lessons`/`growth` `.jsonl`). `merge.ts` already does idempotent union (dedup by `timestamp|observation`, sort by timestamp). `persona`/`playbook`/`active` are a *recomputable projection* — never synced directly; regenerate from the merged log. This sidesteps distributed conflict resolution entirely.
- **Reliability.** Local-first removes the server from the hot path for fs clients, so the 2026-05-27 failure class cannot recur there.
- **Product/architecture alignment.** The paywall (sync) maps exactly onto the expensive, canonical part (always-on remote + server synthesis). The free part (local logs + BYOK synth) is cheap and self-hostable → a clean, honest OSS funnel.

## Consequences

- **Two code paths on fs clients:** local (stdio + local files) hot path + a background sync client to the remote API. Web stays thin/remote-only.
- **Sync protocol needed:** per-source cursor/watermark → push new local log entries, pull remote, merge (reuse `merge.ts`), then *paid*: pull the server-synthesized persona; *free*: run BYOK synthesis locally. Must be idempotent and resumable.
- **Always-on remote (T-042) is now correctly scoped** to the paid/web path — keep it, and pair it with graceful local degradation so an fs-client outage is invisible.
- **Web offline writes are impossible** (no local store). Acceptable — web is inherently online.
- **Free→paid migration:** bulk-upload local history on first sync; server merges + synthesizes the canonical persona.
- **Identity/auth becomes load-bearing:** paid sync needs a durable account model tying sources to one user. Revisit ADR-003 (in-memory OAuth) — in-memory state won't survive the always-on-but-occasionally-redeployed server. **Follow-up.**

## Related

- T-042 (keep Fly machine always-on) — now a deliberate part of this architecture, not a band-aid.
- ADR-002 (Haiku synthesis) — synthesis algorithm unchanged; this ADR decides *where* it runs by tier.
- ADR-003 (in-memory OAuth) — likely needs to become durable; flagged above.
