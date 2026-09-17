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

**Direction:** Dark Instrument. Superseded the original "Earthy & Type-Led" cream
direction on 2026-09-16 (founder call, after seeing the palette side by side against the
cream build). Same hue family — the accent is Jade pushed up in lightness and saturation —
but rendered as a near-black instrument panel rather than a warm paper page. Reads as
simple, monochrome and easy to read; the product is a memory layer for people who live in
terminals, and the ground now matches that world.

> The retired cream direction is kept below in **Superseded** for the reasoning, which
> still holds: the AI-slop tell was *warm cream + single terracotta accent + serif display*.
> The dark system avoids it by a different route — a single accent hue doing semantic work
> on a neutral with a deliberate blue-green bias, not decoration.

**Palette** (dark instrument system; accent is Jade lifted to hold on a near-black ground)

| Name | Hex | Role |
|---|---|---|
| Ground | `#0E1518` | Page background — a blue-black, never pure black |
| Surface | `#141D21` | Raised cards, the hero sidebar |
| Sunk | `#111A1D` | Recessed bands — pricing, the signature block |
| Ink | `#E9EFEF` | Primary text — headings and anything load-bearing |
| Muted | `#94A4A9` | Body copy and running text |
| Faint | `#6D7E83` | Captions, mono labels, footer |
| Line | `#243237` | Hairlines, card borders |
| Accent | `#5FBFB2` | The one bright thing — emphasis phrase, CTA, synthesized line |

> Contrast: Ink on Ground is ~15:1. Muted on Ground is body-safe. **Faint is for 10–12px
> utility only** — never running text. Accent carries CTA (Accent bg + Ground text) and the
> single emphasis phrase per screen; it is the only chromatic colour on the page.

**Typography** — type carries the page (founder pull: type-led, no decoration).

| Role | Font | Notes |
|---|---|---|
| Display | **Instrument Sans** | Headings, nav, buttons, labels. Semibold with `-0.03em` tracking at display sizes. Resolves the old "characterful grotesk, not Inter, not Space Grotesk" open item |
| Body | **Newsreader** | Running text at 16.5–19px. A serif body against a grotesk display is the pair that carries the page — the serif is safe here because it is *not* paired with cream + terracotta |
| Utility / Mono | **JetBrains Mono** | Observation log lines, file paths, numbered eyebrows, the origin line. Mono means *data* — never nav or footer chrome |
| Hebrew | **Noto Sans Hebrew** | The mark זוג only. Set ~1.35× the adjacent Latin px — Hebrew has no ascenders and sits optically small. Written **without niqqud**: the shuruk dot reads as dirt below ~20px |

The move: "AI that remembers " in Instrument Sans Semibold, "how you think." in **Accent**.
The English wordmark **ZUG** carries the nav (tracked `0.2em`); Hebrew appears exactly twice,
in the hero origin line and the footer.
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

## Superseded — Earthy & Type-Led (retired 2026-09-16)

The original cream direction, kept for the reasoning rather than the values. Replaced by
**Dark Instrument** above after the founder saw the two palettes side by side.

| Name | Hex | Role |
|---|---|---|
| Cream | `#EDE5D8` | Page background |
| Sea Salt | `#B8C9C0` | Paired surface / cards |
| Ink | `#22302B` | Primary text — a deep green-black |
| Jade | `#596D69` | Secondary text, deep sections, mono log lines |
| Clay | `#B5603A` | Primary accent |
| Cornflower | `#7AA5BF` | Secondary accent — large/decorative only |

Display was Space Grotesk, body the same, mono JetBrains Mono.

**What still holds from it.** The AI-slop tell is the specific triple *warm cream + single
terracotta accent + serif display* — not warm colours per se, and not serifs per se. The
new direction keeps the same defence by a different route. Two findings from the audit that
killed this version in practice, both independent of palette: nothing on the page had a
max-width, and body copy was set in the secondary tone (Jade) rather than Ink, so the whole
page whispered. Those were layout and hierarchy failures wearing a colour problem's clothes.

**What was wrong with it as a system.** Six colours with two accents, one of which
(Cornflower) its own spec restricted to "large/decorative only" — a colour that existed to
look designed. The replacement carries one accent doing semantic work.
