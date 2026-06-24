# Zug — Design & Brand Reference

> Source: design/brand handoff (one-page marketing site). **Inspiration, not locked** —
> nothing here is final. The design *direction* is settled; copy (esp. hero sidebar) is
> in progress. Drives ticket T-053 (landing page).
>
> Pricing: **$5/mo or $50/yr** (reconciled with ADR-005 — priced as an easy yes; churn
> beats margin for a compounding product).

## Product

Persistent cognitive memory layer for AI sessions. Builds a "cognitive fingerprint" of
*how you think* across sessions — not just what you said, but how you reason and what you
care about. Named for Hebrew זוּג ("pair"), inspired by *havruta* (learning with a
thinking partner). GitHub: https://github.com/dwolner/zug-mcp

## Positioning

- **Big idea:** Every AI session starts with amnesia. You re-explain yourself constantly.
  Zug fixes that — continuity of self across sessions, not just memory.
- **Core concept:** *"The fingerprint is earned, not configured."* Other tools ask you to
  fill out a profile; Zug observes you across sessions and synthesizes what it learns. No
  setup. It builds itself.
- **Tone:** Warm but direct. Not flowery. Half pragmatic productivity tool, half novel
  philosophy. The havruta concept is a subtle undercurrent — present for those who notice
  it, not required to get the pitch.
- **Narrative arc:** Recognition ("that feeling of re-explaining yourself to AI every
  time") → Relief ("Zug remembers how you think, not just what you said") → Investment
  ("your fingerprint is now infrastructure").
- **Audience:** Developers using Claude Code, Cursor, Windsurf. Developer-first, not exclusive.
- **Paid tier:** Zug Pro. The upgrade story is *protection of something valuable already
  built* — not a feature paywall.

## Approved copy

**Nav:** Docs · GitHub · Pricing

**Hero**
- Origin line: זוּג · Hebrew for "pair"
- Headline: **AI that remembers _how you think._** ("how you think." italic, terracotta)
- Subhead: The fingerprint is earned, not configured.
- CTAs: [ Install Free ] [ View on GitHub → ]

**Hero sidebar cards** (3 — labels/body still being workshopped, the weakest section):
Cognitive fingerprint · Cross-agent sync · Your data

**Feature grid (4 columns)**
- 01 — Earned, not configured: No profile to fill out. Zug watches how you work,
  synthesizes what it learns, and builds your fingerprint session by session.
- 02 — One identity, every agent: Claude, Cursor, Windsurf. Your fingerprint follows you
  across every tool you work in — automatically.
- 03 — Your data, always: Plain files. No database, no lock-in. Read it, back it up,
  delete it. It belongs to you.
- 04 — Compounds over time: Every session, Zug synthesizes new observations. The longer
  you use it, the less you have to explain yourself.

**Upgrade section**
- Eyebrow: Zug Pro
- Headline: Your fingerprint is now infrastructure.
- Body: After 50 sessions, what you've built is worth protecting. Pro makes it permanent,
  portable, and always with you.
- Price: **$5 / month** (or $50 / year)
- Pro features: Remote sync (fingerprint on every machine, always current) · claude.ai web
  support via OAuth · Server-side synthesis (runs on our infra, not yours) · Persistent
  cloud backup · Priority support

**Footer:** זוּג · Hebrew for "pair." Because the best thinking happens with a partner.
GitHub · Docs · MIT License

## Visual identity

**Direction:** Earthy & Type-Led. The warm/earthy family the founder actually loves
(orange/clay/terracotta), executed so it reads as a *deliberate choice* rather than the
AI default. Approachable but crafted; type carries the page, not decoration.

> The AI-slop tell is the specific triple **warm cream + single terracotta accent + serif
> display** — NOT warm colors per se. We keep the warmth and break the tell two ways:
> (1) drop the serif entirely for a characterful grotesk (the serif is the loudest part of
> the tell); (2) use a richer multi-hue earthy system — sea salt, jade, cornflower
> alongside the clay — so it reads as a considered natural palette, not cream-plus-one-
> terracotta. Distinctiveness comes from type execution + one signature moment.

**Palette** (founder-chosen earthy system; Ink derived to harmonize with Jade)

| Name | Hex | Role |
|---|---|---|
| Cream | `#EDE5D8` | Page background |
| Sea Salt | `#B8C9C0` | Paired surface / cards — the "pair" rendered as a second tone |
| Ink | `#22302B` | Primary text — a deep green-black (not pure black), high contrast on Cream |
| Jade | `#596D69` | Secondary text, deep sections, mono log lines, small links |
| Clay | `#B5603A` | Primary accent — emphasis phrase, CTA, the synthesized line |
| Cornflower | `#7AA5BF` | Secondary accent — large/decorative, surfaces |

> Contrast: Ink-on-Cream is body-safe. Clay is headline/CTA strength (Clay bg + Cream text
> for primary buttons). **Cornflower is low-contrast on Cream** — large/decorative only;
> use Jade for small links and small text, never Cornflower.

**Typography** — type carries the page (founder pull: type-led, no decoration).

| Role | Font | Notes |
|---|---|---|
| Display | A characterful grotesk — Söhne / Neue Haas Grotesk / GT America register. **Not a serif** (the AI tell), **not Inter** (generic). | Emphasis via weight + Clay color, optionally a grotesk italic |
| Body / UI | Clean grotesk (same or complementary family) | — |
| Utility / Mono | A characterful mono | Labels, origin line זוּג, and the hero observation log lines — honors "your data is plain files" |

The move: "AI that remembers " in the display grotesk, "how you think." in **Clay** (weight +
color, or grotesk italic). This replaces the original Lora serif-italic — the serif was the
AI-default tell. (Exact grotesk + mono faces still to pick — open item.)

**Signature** — the hero *demonstrates* "earned, not configured" instead of asserting it:
two or three raw session observations in mono (Jade) on a Sea Salt surface resolve, on
load/scroll, into one Clay-accented synthesized persona sentence in the display grotesk on
Cream. The havruta "pair" is also expressed structurally as the two tonal surfaces (Cream +
Sea Salt) side by side. This is the one orchestrated motion moment; everything else is quiet
hover states (reduced-motion respected) — satisfies "type-led, no decoration" + "subtle
micro-interactions" without the over-animated AI feel.

```
[2026·03] observed: prefers root-cause framing before solutions      ┐ mono / Jade
[2026·04] observed: tests the actual gate, not its description        ┘ on Sea Salt
              ↓  synthesized
You diagnose before you report. Lead me to the cause.                  ← grotesk, Clay accent, on Cream
```

**Buttons**
- Primary: bg `#B5603A` (Clay) or `#22302B` (Ink), text `#EDE5D8`, grotesk 600, ~11px,
  uppercase, wide letter-spacing (~0.16em); hover swaps Clay↔Ink.
- Ghost: grotesk ~11px, color Jade, border-bottom underline, no background.

## Layout

True one-pager. Clean, direct, pushes to links fast. No fluff.

Section order: Nav (wordmark left, links right) → Hero (two-column: headline/CTAs left,
sidebar cards right) → Feature grid (4 equal columns) → Upgrade (two-column: headline/price
left, feature list right) → Footer (origin line left, links right).

Hero detail: left = origin line → Lora headline → Syne subhead → CTAs; right = sidebar on
`#EDE7DA`, 3 cards (DM Mono label + Syne body); 1px `#DDD7CC` column divider; 1px `#DDD7CC`
separators between all major sections.

Secondary structural reference: jestsee.com — minimalist, content-first, substance-over-
flash; review live for its motion/micro-interactions.

## Open items

- Hero sidebar copy — 3 card labels/body are placeholders, need sharper language (start here)
- Typefaces — pick the display grotesk + utility mono (not serif, not Inter); wordmark sits within that system
- Mobile layout — not designed
- Favicon / OG image — not started
- Pricing — resolved: $5/mo or $50/yr
