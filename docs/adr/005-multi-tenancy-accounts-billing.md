# ADR-005: Multi-tenancy, durable accounts, and billing for the hosted paid tier

**Status:** Accepted
**Date:** 2026-06-24

## Context

ADR-004 designed the product/architecture funnel — free = local-only single source,
paid = canonical remote sync — and deferred the commercialization slices: **multi-tenant
accounts, billing, and free→paid migration**. This ADR decides those.

Today the canonical server is **hard single-tenant**. `getPaths()` in `storage.ts`
resolves one global `ZUG_DATA_DIR` (`/data/.zug`); `handleSyncPull(since)` and
`handleSyncPush(body)` take no user identity and read/write that one directory; OAuth
state is in-memory (ADR-003) and dies on every redeploy. Two paying customers today
would share one cognitive fingerprint. Nothing in the codebase has a user dimension.

Three product decisions taken before this ADR shape the design:

1. **Hosted SaaS** is the model (we run the canonical server; users pay for sync).
2. **Plaintext + anonymous IDs.** The server must read user data to synthesize
   server-side (ADR-004 §2), so end-to-end encryption is off the table — it is mutually
   exclusive with server synthesis and with the web client (no local files, no key).
   Instead we minimize PII: opaque account IDs, pseudonymous signup, no real-name
   requirement. This shrinks blast radius but does **not** exit "we hold personal data"
   — a cognitive fingerprint is inherently re-identifying free-text (employer, projects,
   verbatim quotes), so full GDPR obligations apply regardless of the anonymous ID.
3. **GDPR-ready from day one**, including EU data residency.

## Decision

1. **Per-user namespacing of content, still file-based.** Storage moves from one global
   `/data/.zug` to `/data/users/<userId>/.zug/…`. `getPaths()` gains a `userId`
   dimension threaded through `server.ts`, `sync-server.ts`, and `synthesize.ts`. The
   append-only-log + projection model (ADR-001, ADR-004) and the `merge.ts` /
   `synthesize.ts` engines are **unchanged** — they just run per user. This preserves
   ADR-001's portability and transparency for each tenant.

2. **Accounts, OAuth, and billing state move to SQLite on the volume.** This is the
   deliberate exception to ADR-001's "no database." Account ↔ source/device mapping,
   durable OAuth clients/tokens (replacing ADR-003's in-memory state, which cannot
   survive the always-on-but-redeployed server), and Stripe customer/subscription state
   are relational, security-load-bearing, and must survive restarts. Content stays in
   files; only the control plane is relational. SQLite keeps ops near-zero (no separate
   service, lives on the existing `/data` volume).

3. **Anonymous-by-design identity.** A user is an opaque `userId`. Signup requires no
   real name; a pseudonymous email or device-keyed credential is sufficient. Multiple
   sources (CLI, web, second laptop) map to one `userId` — this is what makes ADR-004's
   "same-me everywhere" real.

4. **Tier = the sync boundary (inherits ADR-004).** Free = local-only (entitlement check
   rejects `/sync/*`). Paid = canonical sync + server synthesis + web/multi-machine.
   Entitlement is a single check on the `/sync/*` and `/mcp` paths, driven by billing state.

5. **Billing: Stripe, $5/mo or $50/yr.** Priced as an easy yes, not for max margin: for a
   product whose value *compounds* (the fingerprint is worth more the longer you stay),
   churn destroys far more lifetime value than a higher monthly price captures — a low,
   sticky price below the $10 psychological line maximizes LTV ($5/mo × 3yr = $180 beats
   $8/mo cancelled at month 8 = $64). COGS does not constrain price (see Rationale). Annual
   is for churn/cash-up-front, not margin (the ~17% discount slightly outweighs the Stripe
   per-txn saving). Stripe Checkout + customer portal; a webhook flips entitlement on
   `checkout.session.completed` / `customer.subscription.updated|deleted`.

6. **Synthesis stays on Haiku (ADR-002 unchanged).** Synthesis is a structured,
   conservative, mechanical task; a larger model is diminishing returns. Paid value is
   the **network effect** (one unified fingerprint across every source), not a better
   synthesis model — affirming ADR-004 §5.

7. **Per-user synthesis cap as a runaway/abuse guard, not a cost lever.** A per-user
   daily synthesis budget set ~10–25× the heavy-user rate (heavy ≈ 2/day → cap ≈ 25–50/day)
   so humans never hit it. When exceeded, **degrade to ADR-002's append-only path** (keep
   recording, skip synthesis, resume next window) — never fail a session. This protects
   against a misbehaving client looping `zug_end_session`, independent of the per-IP
   rate limit in `rate-limit.ts` (which guards request rate, not the expensive operation).

8. **GDPR posture.** Anthropic is a **sub-processor** (user data is sent to its API for
   synthesis) — disclose it, sign the DPA, list it in the privacy policy. EU data
   residency for the Fly app + volume. Encryption at rest on the volume. Data-subject
   rights — export and erasure (on request and on cancellation) — are cheap because each
   user is a self-contained directory: zip it / delete it.

## Rationale

- **COGS does not constrain pricing.** Haiku 4.5 is $1/$5 per MTok; one synthesis is
  ~$0.025; even a heavy user (~60 sessions/mo) costs ~$1/mo to serve, and the always-on
  Fly machine is a flat ~$2–4/mo shared across all users. Margin is fat at any price ≥ $5
  (~80–85% gross at $5/mo). The metric that matters is churn, not margin — LTV compounds
  with retention. The real cost levers are the operational burden of hosting personal data
  (→ GDPR work, support) and Stripe per-transaction overhead — not AI spend.
- **The paywall maps onto the expensive, canonical part** (ADR-004): sync + always-on
  server + server synthesis. Free (local logs + BYOK/append synthesis) stays cheap and
  self-hostable, keeping the OSS funnel honest.
- **Files-for-content, SQLite-for-control-plane** keeps the migration small: the data
  model that already works (append-only logs, recomputable projections, idempotent merge)
  is untouched; only a thin tenancy key and a relational control plane are added.

## Consequences

- **First non-file state.** SQLite introduces schema/migration discipline the project has
  not needed. Scoped to accounts/auth/billing to keep ADR-001's benefits for content.
- **ADR-003 is superseded** for token storage — in-memory OAuth becomes durable.
- **Multi-tenancy is the long pole.** Threading `userId` everywhere and a per-user
  synthesis queue (one user's session-end cannot block another's) is the bulk of the work
  and gates billing, tiering, and migration.
- **Free→paid migration** bulk-uploads local history on first paid sync; `merge.ts`'s
  idempotent union already does the hard part, now per user.
- **Hosting personal data is not "passive."** Privacy/legal, support, billing disputes,
  and uptime become standing obligations — the recurring revenue comes with a real
  operational tail.

## Related

- ADR-001 (file-based storage) — content stays file-based; control plane is the exception.
- ADR-002 (Haiku synthesis) — algorithm and model unchanged; adds the per-user cap.
- ADR-003 (in-memory OAuth) — superseded; tokens become durable in SQLite.
- ADR-004 (local-first sync + tiering) — this ADR implements its deferred slices.
- T-042 (always-on Fly) — now correctly scoped to the paid/web canonical path.
