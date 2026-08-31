# Cognitive Fingerprint

*This file grows over time. Each session appends observations. Zug uses this to understand how you think, not just what you know.*

## How you construct arguments
- Thinks in systems and relationships between things, not isolated facts
- Moves from vision/concept down to implementation — top-down thinker
- Drawn to naming things precisely (e.g., immediately recognized "Zug" as the right product name)
- Starts from principles and prior patterns, then validates against specific cases
- Sets up systematic rules and guardrails upfront (extensive CLAUDE.md, domain-specific rules files, agent configurations) rather than deciding ad-hoc — preference for defining the system first, then letting it run
- Asks questions directly and gives corrective feedback efficiently; doesn't over-explain the why unless asked
- Demands verification against primary sources before accepting conclusions; doesn't accept "sounds right" — wants to see the data
- When troubleshooting, arrives at root-cause framing before reporting the problem — doesn't describe symptoms, describes diagnosis
- **Thinks meta about system architecture when it's blocking real work — can distinguish between advisory rules and executable gates, and recognizes when a system is relying on the former when it needs the latter** *(direct quote: "Immediately grasped the abstract gate vs. rule distinction and applied it to diagnose a specific failure mode in an active system"; session 2026-04-24)*
- Verifies system behavior by running end-to-end tests rather than reading code alone — tests the actual gate, not the description of the gate *(session 2026-05-23)*
- Distinguishes "done" from "live" and audits the gap explicitly — committing code is not the same as shipping it to production, and work is not complete until it's reachable by the running system *(session 2026-05-23)*
- Converts stated next-steps into immediate verification tasks — when told "check X," he checks X without delay or re-framing *(direct pattern: closes verification items first, treats stated steps as commitments to discharge)*

## What excites you
- Ideas that create emergent properties — 1+1=3 thinking
- Building things that help other people think and grow
- The intersection of technology and human development
- Concepts with deep roots (havruta as a frame for AI companionship)
- Platform-level engineering: SSR pipelines, web component systems, observability instrumentation, build tooling
- Infrastructure that other developers build on top of (karuna is an internal platform)
- Leverage problems — how to make a system scale without proportional effort

## How you engage with problems
- Asks "what does this enable?" before "how does this work?"
- Comfortable with ambiguity at the edges — defines the core clearly, leaves the rest open
- Iterates through conversation, not specification — thinks out loud
- Thinks architecturally about ecosystem design — evaluates options against reusability, maintenance burden, and adoption before choosing
- When multiple sequential fix attempts fail, pivots cleanly to asking "is this the right approach at all?" rather than continuing to iterate
- Debugging style: uses browser console snippets iteratively to test hypotheses before touching files; comfortable with back-and-forth loops for complex problems
- Accepts hard architectural constraints once confirmed; knows when to close an investigation vs. push further
- Investigates root causes methodically: hypothesis → local reproduction → inspect actual output → confirm/reject
- Often diagnoses issues before reporting them — frames problems in terms of root cause rather than symptoms

## How you handle being wrong
- Updates quickly and directly
- Correction style is matter-of-fact
- Has documented mistakes explicitly so they don't repeat
- Doesn't dwell — corrects the rule, moves on
- When a theory is wrong, doesn't just accept the correction — runs tests, looks at the evidence, confirms the real cause yourself

## Expectations for tools and autonomy
- Expects tools to follow their own stated rules without reminders
- Low tolerance for needing to babysit automation that's supposed to be autonomous
- Wants concise, direct responses — no filler, no preamble, no emojis
- Prefers leading with the answer, then explanation only if needed
- Gives explicit, correctable feedback and expects rules to be updated immediately when wrong
- **Expects Zug to auto-log observations silently throughout every session without being asked — if the system says it's "always on," it should actually be always on** *(raised explicitly twice across sessions; most recent: "Why are you not already auto logging them?")*
- Expects reporting on deployed state of work in the same breath as correctness — "done" and "live" are separate concerns and both should be stated

## What you're working on
- **Primary project: `karuna`** — ServiceNow internal SSR-first web component platform for AIUX applications. Stack: Lit web components, Fastify HTTP/2, Node.js 22, pnpm workspaces, Rollup, Tailwind CSS v4 + DaisyUI, Vitest, Playwright.
  - Critical CSS inlining (STRY63072114)
  - Activity stream filter usability (STRY63118599)
  - Custom layout SSR (`transpileSSRTree`)
  - Observability / structured logging pipeline
  - Local K8s cluster setup (Kind + Heimdall)

- **commons-test-js-utils monorepo** — SDLC annotation reporters for Jest, Playwright, Vitest, Node.js test runner, and Karma. Responsible for ensuring annotations flow correctly from test code through to the Maven sdlc-maven-plugin. Infrastructure other teams depend on.

- **Tooling investments:** Claude Code automation, Argus PR review rules, cost-optimized agent pipelines (haiku/sonnet/opus tiering)

- **Zug: a havruta-style AI learning companion** with persistent memory, multi-environment sync, and graceful degradation for new features

- **House tracker:** Real estate analysis system with trend charts, price/score tracking by neighborhood, unified email digests, server-side quality filters

- **Augur: Artist growth platform** — Spotify + Facebook Ads SaaS for indie artists with AI-driven campaign optimization and label discovery pipeline. North star: cost per Spotify follower. Dataset as moat. Artist tagline: "Less noise. More signal." Growth strategy: "Perform well and get discovered." Stack: Next.js, Neon, Drizzle, Cloudflare R2, middleware auth. Prototype in build phase; Notion integration for agent findings live; overnight autonomous agent research (Spotify API, Meta Ads API) via agent.sh launcher with caffeinate.

- Cosmic Insight: a code analysis agent for yoyo-evolve
- Daily software engineering work in TypeScript/Node.js
- **Personal finance workbench** — Uses Claude Code sessions for document retention, account management, and financial ops alongside code projects. Monarch MCP tooling is live infrastructure for personal-finance tasks.

## Technical context and preferences
- **Employer / team:** ServiceNow, AIUX team. Works in monorepo (`karuna`) that is SSR-first platform serving internal ServiceNow apps. Strict SDLC compliance — every test must link to a work item via `annotation()` from `@servicenow/vitest-sdlc-reporter`.
- **Tech stack preference:** TypeScript, functional/declarative style (no classes), pnpm exclusively, Prettier (tabs, single quotes, semicolons, 100-char line width), ES modules/ES2022 target, Vitest (unit, co-located), Playwright (E2E with Page Object Model)
- **Code practices:** Structured logging via `@servicenow/aiux-observability`, never `console.*` in backend. Tests must include regression protection analysis.
- **Git workflow:** Branch naming `scratch/{TICKET_NUMBER}-{what-it-does-short}-{name}`, commit messages `{TICKET_NUMBER}: {short-message}` (imperative), PRs with `STRY########:`, `DEF#######:`, `MAINT:`, or `chore:` prefix, linear history (rebase only)
- **Stack fluency:** Works across full stack fluently — Maven plugin Java internals, Node.js test runner behavior, esbuild CJS transforms, CI pipeline log analysis, Playwright reporter architecture. Comfortable reasoning about system interactions at boundaries (JUnit XML ↔ Maven plugin ↔ annotations file).
- **Documentation preference:** Wants docs that explain the "why" — not just what code does but why it has to be that way. Wants future readers to understand the constraints, not just follow the recipe.

## Early signals (from first session)
- Moves quickly from concept to "how do I use this today?" — high action orientation
- Cares about portability and generality — doesn't want things that only work in one place
- Thinks about others early ("make it generic enough for other users")

## Collaboration style
- Delegates implementation handoff to other teams rather than forcing changes himself
- Knows where ownership boundary ends and where the consuming team's begins
- Asks for concise next steps to relay rather than doing everything personally

### 2026-03-23
- [cognitive_pattern] Builds infrastructure with deployment and portability as first-class concerns — immediately asks "can others install this?" and "how do I run this on my other machines?" before the tool is even fully proven. Distribution thinking is baked into how he designs. *(2026-03-23)*
- [preference] Prefers building features incrementally with graceful degradation — Phase 2 synthesis falls back to Phase 1 append, merge works without API key for observations/sessions. Never wants a new feature to break the existing path. *(2026-03-23)*
- [context] Runs multiple Claude environments (at least two accounts/machines) and wants unified data across them. Multi-environment is a real constraint, not theoretical. *(2026-03-23)*

### 2026-03-24
- [preference/high] Prefers opinionated server-side defaults over UI configurability — when filtering outcomes to reduce noise, meant baked-in quality floors (score >= 50, SFH only) not wiring up filter controls. The system should be smart about what matters rather than exposing knobs. *(2026-03-24)*
- [cognitive_pattern/high] Diagnoses before reporting — arrives at root-cause analysis before asking for help. Frames problems in terms of the underlying issue (two separate email paths, consolidation opportunity) rather than symptoms (20+ listings). *(2026-03-24)*
- [preference/high] Consolidation instinct — when presented with parallel systems doing similar things, immediately reaches for a single unified surface. Prefers one clean path over multiple specialized ones. *(2026-03-24)*

### 2026-03-25
- [cognitive_pattern/high] Names products through phonetic + semantic resonance, then validates candidates on spelling recognizability, meaning alignment, and visual/typographic properties. "Augur" from Forsythia intuition → evaluated candidates → locked on double-U symmetry as closing argument. Naming is precise work, not intuitive happenstance. *(2026-03-25)*
- [cognitive_pattern] Product thinking is top-down and architecture-first — defines artist SFH (cost per Spotify follower), identifies dataset as competitive moat, then layers B2B label discovery pipeline as revenue model. Vision → metrics → market structure, not feature ideation. *(2026-03-25)*
- [preference] Creates brief-form deliverables early and captures thinking systematically (artist-growth-platform-brief.md, meeting prep questions). Moves from conversation to documented position before next phase. Reduces repeated framing later. *(2026-03-25)*

### 2026-03-26
- [preference/high] Prefers autonomous agents that write findings to Notion overnight without supervision — the whole point of the Spotify API explorer was to wake up to completed research, not to do it interactively. Gets frustrated when tooling requires babysitting that was supposed to be autonomous. *(2026-03-26)*
- [cognitive_pattern] Runs live API research during build sessions — hits actual Spotify endpoints to discover tier-gating, feature deprecations, and current API status rather than assuming documentation is current. Corrects findings when data contradicts assumptions (test credentials from existing app with grandfathered access). *(2026-03-26)*
- [cognitive_pattern] Sets up agent infrastructure with pre-approved permissions for autonomous overnight execution (agent.sh launcher with caffeinate + bash approval) so research can run without human supervision and write results to Notion. Automation setup is part of the build, not an afterthought. *(2026-03-26)*

### 2026-04-23
- [cognitive_pattern] When reviewing PRs, pushes back immediately and concisely when analysis is wrong — corrected two points in the PR review (DEF0829328) in a single message with minimal words. Doesn't re-explain, just states the correction and expects it to land. *(2026-04-23)*

### 2026-04-24
- [cognitive_pattern/high] Immediately grasps abstract system distinctions (gate vs. rule) and applies them to diagnose specific failure modes in tools they use — identified that PERSONA patterns were being applied generically rather than holistically shaping sessions, recognized the root cause as "Just use it" rule with no forcing function, and framed the problem precisely before any solution was proposed. Can think meta about system architecture when it's blocking real work. *(2026-04-24)*

### 2026-05-23
- [cognitive_pattern] Verifies system behavior by running end-to-end tests rather than reading code alone — called zug_save_observation then immediately ran zug tail to confirm the observation appeared in the file. Tests the actual gate, not the description of the gate. *(2026-05-23)*
- [cognitive_pattern/high] Distinguishes "done" from "live" and audits the gap explicitly — after a long session of commits asked "did we push and publish the real fixes?", naming push and publish as separate acts from the work itself. Committing is not shipping to him, and he expects the distinction to be tracked rather than blurred by a summary that says the work is complete. The question caught a real gap: nine commits sat on an unpushed local branch and the production server was running two-week-old code. *(2026-05-23)*

### 2026-05-24
- [context/medium] Uses Claude Code sessions for personal financial operations, not just code — asked for a document-retention checklist before closing a U.S. Bank account while working in the monarch-mcp-server repo. Treats the Monarch MCP tooling as a live personal-finance workbench, so financial-ops questions can arrive in any session regardless of the repo context. *(2026-05-24)*

### [Current Session]
- [cognitive_pattern/medium] Closes out follow-up items rather than letting them accumulate — when I ended the prior session with five "next steps" and flagged the first post-fix poll as the thing to check, his first message the next day was just "check now." Terse, no re-framing — he treats a stated verification step as a commitment to be discharged, not a backlog entry. Implication: when you write next-steps, write them as things you are prepared to execute on demand, and expect to be asked for the highest-value one first. *(current session)*

## Reinforced patterns (observed across multiple sessions — treat these as load-bearing)
- [3x] When he tests a command you mention (e.g. `zug tail`), expect immediate verification and adjust your behavior if the output is wrong — test the actual system, not the description of it.
- [2x] Frames problems by root cause / underlying mechanism first before accepting or proposing a fix — asks "why is this happening" not just "make it stop"
- [2x] Expects tools to follow their own stated rules without reminders — low tolerance for needing to babysit automation that's supposed to be autonomous
- [1x] Demands verification against primary sources before accepting conclusions — asked whether the proposed workflow was actually derived from the article's stated steps rather than accepting the design as presented, forcing an explicit fidelity mapping and disclosure of deviations.
