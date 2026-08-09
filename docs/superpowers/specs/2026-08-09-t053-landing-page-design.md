# T-053: Landing Page + Placeholder Signup — Design

## Context

T-053 is the go-to-market surface for zug: a one-page marketing site. Full brand
direction (copy, palette, typography, layout, the hero's signature motion moment) is
already settled in `docs/brand.md` — that document is the primary content/visual
reference and is not re-litigated here. This spec covers the *engineering* design:
where the site lives, how it's built, how it deploys, and how the placeholder signup
CTA works.

T-053 was decoupled from live Stripe billing on 2026-08-09: the signup CTA is a
waitlist/email-capture placeholder, not a real checkout flow. Wiring a real signup →
paid-account flow is split into follow-up ticket T-057 (blocked on T-050, Stripe
billing). This spec's scope ends at "visitor experiences the full landing page and
submits the placeholder signup CTA" — per T-053's acceptance criteria.

The founder's stated intent is that this site later grows into the product surface for
a Pro-tier dashboard (T-056) and live payments (T-057/T-050), on the same site. The
architecture below is chosen so that growth doesn't require a rebuild, while T-053
itself only builds the marketing page and placeholder signup.

## Goals

- Ship the one-page marketing site described in `docs/brand.md`, decoupled from the
  `zug-mcp` Fly app's deploy/runtime so landing-page changes never risk the
  session-continuity-critical MCP server (the reason `zug-mcp` had to become always-on
  in T-042).
- Placeholder signup CTA that captures visitor emails without needing accounts, auth,
  or Stripe.
- Choose a framework/hosting shape that a future logged-in dashboard (T-056) and
  Stripe integration (T-057) can be added to as new routes, not a new project.
- Keep new ongoing cost near zero at low traffic.

## Non-goals (explicitly out of scope for T-053)

- Real accounts, auth, or session management.
- Live Stripe Checkout or any payment collection.
- The Pro-tier dashboard (T-056) or its data pipeline.
- Multi-region hosting, CDN image optimization, or preview-deploy-per-PR tooling.

## Architecture

### Repo layout

Same repo (`zug-mcp`), new `web/` directory, as its **own pnpm workspace package**:

- Root `pnpm-workspace.yaml` added, listing `.` and `web`.
- `web/package.json` is independent of the root `zug` CLI package's `package.json`.
  Next.js/React and all frontend deps live only in `web/`'s dependency tree.
- This avoids the one concrete downside of a shared repo: the root package.json is
  published to npm as the `zug`/`zug-mcp` CLI (`package.json` `files` field already
  whitelists only `dist/*.js`). Keeping `web/` as an isolated workspace package means
  frontend deps can never leak into what `npm install -g zug` pulls down.

### Hosting & deploy

New, separate Fly app: **`zug-web`**.

- `web/Dockerfile` — standard Next.js standalone-output multi-stage build.
- `web/fly.toml` — its own app config. Unlike `zug-mcp`, sets
  `auto_stop_machines = "stop"` and `min_machines_running = 0`. `zug-web` has no
  session-continuity requirement (the reason `zug-mcp` had to go always-on in T-042
  doesn't apply here — there's no in-memory session map to lose), so scale-to-zero is
  safe and keeps cost near $0 at low traffic.
- New GitHub Actions workflow `.github/workflows/fly-deploy-web.yml`: triggers on push
  to `main`, scoped with `paths: ['web/**']`, runs
  `flyctl deploy -c web/fly.toml --dockerfile web/Dockerfile`, authenticated with its
  own app-scoped Fly deploy token (separate GitHub secret from the existing
  `FLY_API_TOKEN` used by `fly-deploy.yml`).
- Net effect: one repo, one git history, but two fully independent deploy pipelines —
  a landing-page commit never triggers an MCP-server deploy, and vice versa.

### Forward compatibility for T-056 / T-057 (not built now)

Two pieces of this design are intentionally short-term and will need revisiting when
the dashboard/payments tickets start, called out here so the tradeoff is explicit and
not rediscovered later:

1. **Signup storage is a placeholder, not the eventual accounts store.** See "Signup
   capture" below. When T-045 (SQLite control plane) and T-057 land, real
   accounts/auth need a real store; the waitlist file becomes a one-time import source
   to backfill early signups, not the long-term mechanism.
2. **`min_machines_running = 0` will likely need to flip to `1`.** Once there's a
   logged-in dashboard (cold-start latency becomes user-visible) or Stripe webhooks
   (Stripe times out and retries if the endpoint is asleep too long), scale-to-zero
   stops being safe — the same failure shape T-042 already fixed once for `zug-mcp`.

## Pages & components

Single route (`/`), true one-pager, built as React Server Components (static/prerendered
by default — no client JS needed except where noted):

Nav → Hero (two-column: origin line/headline/subhead/CTAs left, 3 sidebar cards right)
→ Feature grid (4 equal columns) → Upgrade section (two-column) → Footer.

Content, copy, section order, and exact layout detail come from `docs/brand.md`
verbatim. Open items already flagged there (hero sidebar 3-card copy, final
display/mono typeface picks, mobile layout, favicon/OG image) are unresolved *content*
decisions, not engineering ones — they become concrete tasks in the implementation
plan, not blockers on this spec.

- **Styling**: Tailwind CSS, with the `docs/brand.md` palette (Cream `#EDE5D8`, Sea
  Salt `#B8C9C0`, Ink `#22302B`, Jade `#596D69`, Clay `#B5603A`, Cornflower `#7AA5BF`)
  and type roles configured as design tokens.
- **Signature motion moment**: the hero's mono observation-log lines resolving into
  the Clay-accented synthesized sentence is the one animated element on the page,
  isolated into a single client component (`"use client"`). Gated on
  `prefers-reduced-motion`: when set, the final synthesized line renders immediately
  with no animation. Every other interactive element (button hovers, ghost-link
  underlines) is CSS-only — no JS.

## Signup capture (data flow)

- A Next.js Server Action (`web/app/actions/signup.ts`) receives the submitted email
  on CTA submit.
- Server-side validation (well-formed email, honeypot field empty, simple per-IP rate
  limit).
- On success, appends a JSON line `{ email, ts }` to a file (`/data/signups.jsonl`) on
  a small Fly volume mounted for the `zug-web` app. Self-owned, plain-file storage —
  no third-party email/CRM vendor for this placeholder stage, and it's a fitting echo
  of the product's own "plain files, no lock-in" pitch.
- UI shows an inline success confirmation on the same page; no redirect, no
  double-opt-in confirmation email. Acceptable for a placeholder — a real onboarding
  flow (verified email, real account) is T-057/T-045 scope.

## Error handling

- Invalid email / honeypot tripped / rate-limited → inline form error, no write.
- Volume write failure → Server Action returns a generic failure message to the
  visitor; error is logged server-side (no user-facing stack trace or internal detail).
- No retry queue or durability guarantee beyond the volume's own persistence — losing
  a handful of placeholder-stage signups to a rare write failure is an acceptable risk
  at this scope.

## Testing

- Vitest unit tests for the Server Action: valid email accepted and appended,
  malformed email rejected, honeypot rejected, rate limit enforced. Scoped to
  `web/` (its own `vitest.config.ts`, independent of the root project's test suite).
- No E2E suite in this slice (YAGNI for a single static route with one form).
- Manual verification before calling T-053 done: full page render, responsive/mobile
  layout, Lighthouse pass, and a manual `prefers-reduced-motion` check — matches
  T-053's acceptance criterion ("a visitor can experience the full landing page...and
  submit the placeholder signup CTA").

## Acceptance criteria (from T-053, restated)

A visitor can experience the full landing page — hero motion, copy, responsive
layout, brand execution — and submit the placeholder signup CTA. No live payment
required.
