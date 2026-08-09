# T-053 Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the zug marketing one-pager (per `docs/brand.md`) as a new `zug-web` Fly app, with a self-owned placeholder email-capture signup, fully decoupled from the `zug-mcp` server's deploy pipeline.

**Architecture:** `web/` is a new pnpm workspace package (isolated from the root `zug` CLI package) containing a Next.js 15 App Router site. It deploys as its own Fly app (`zug-web`, scale-to-zero) via a path-scoped GitHub Actions workflow independent of the existing `zug-mcp` deploy.

**Tech Stack:** Next.js 15 (App Router, React 19, TypeScript), Tailwind CSS 3, Vitest + Testing Library, `next/font/google` (Space Grotesk + JetBrains Mono), `next/og` for icon/OG image generation, Fly.io.

## Global Constraints

- `web/` is its own pnpm workspace package — no frontend dependency may be added to the root `package.json` (that package publishes to npm as the `zug` CLI).
- Palette (exact hex, from `docs/brand.md`): Cream `#EDE5D8`, Sea Salt `#B8C9C0`, Ink `#22302B`, Jade `#596D69`, Clay `#B5603A`, Cornflower `#7AA5BF`.
- Display/body font: Space Grotesk (Google Fonts, OFL, "characterful grotesk, not Inter, not serif" per brand.md). Utility/mono font: JetBrains Mono (Google Fonts, OFL).
- The hero signature motion (mono log → synthesized line) is the only animated element on the page and MUST be skipped (final state shown immediately) when `prefers-reduced-motion: reduce` is set. All other interactivity is CSS-only.
- Signup capture writes to a self-owned JSON-lines file (`SIGNUPS_FILE_PATH`, default `/data/signups.jsonl`) — no third-party email/CRM vendor.
- `zug-web`'s `fly.toml` sets `auto_stop_machines = "stop"`, `min_machines_running = 0`.
- `.github/workflows/fly-deploy-web.yml` triggers only on `paths: ['web/**']`, using its own Fly API token secret — must never trigger the existing `zug-mcp` deploy and vice versa.
- No accounts, auth, or live Stripe integration in this plan (T-045/T-057 scope).
- All web/ tests run via Vitest, scoped to `web/vitest.config.ts`, independent of the root project's test suite.

---

## File Structure

```
pnpm-workspace.yaml                          # new — declares . and web as workspace packages

web/
  package.json                               # new — isolated deps (Next, React, Tailwind, Vitest, RTL)
  tsconfig.json                               # new
  next.config.ts                              # new — output: 'standalone' for Docker
  postcss.config.js                           # new
  tailwind.config.ts                          # new — brand palette + font tokens
  vitest.config.ts                            # new
  vitest.setup.ts                             # new — jest-dom matchers
  Dockerfile                                  # new — multi-stage standalone build
  fly.toml                                    # new — zug-web app config

  app/
    layout.tsx                                # new — loads fonts, wraps globals.css
    globals.css                               # new — Tailwind directives + CSS vars
    page.tsx                                  # new — composes all sections
    icon.tsx                                  # new — generated favicon (next/og)
    opengraph-image.tsx                       # new — generated OG image (next/og)
    content.ts                                # new — single source of truth for all copy
    actions/
      signup.ts                               # new — "use server" signup action + processSignup()
    components/
      Nav.tsx                                 # new
      Footer.tsx                              # new
      FeatureGrid.tsx                         # new
      UpgradeSection.tsx                      # new — includes SignupForm
      Hero.tsx                                # new — includes SignatureMoment
      SignatureMoment.tsx                     # new — "use client", reduced-motion aware
      SignupForm.tsx                          # new — "use client"

  lib/
    rate-limit.ts                             # new — in-memory per-IP limiter
    signups-store.ts                          # new — appendSignup() JSONL writer

  tests/
    content.test.ts                           # new
    lib/
      rate-limit.test.ts                      # new
      signups-store.test.ts                   # new
    actions/
      signup.test.ts                          # new
    components/
      Nav.test.tsx                            # new
      Footer.test.tsx                         # new
      FeatureGrid.test.tsx                    # new
      UpgradeSection.test.tsx                 # new
      Hero.test.tsx                           # new
      SignatureMoment.test.tsx                # new
      SignupForm.test.tsx                     # new
    page.test.tsx                             # new
    icon.test.ts                              # new

.github/
  workflows/
    fly-deploy-web.yml                        # new — path-scoped deploy for zug-web
```

---

### Task 1: Workspace + Next.js app scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/vitest.config.ts`
- Create: `web/vitest.setup.ts`
- Create: `web/app/layout.tsx`
- Create: `web/app/globals.css`
- Create: `web/app/page.tsx`
- Test: `web/tests/page.test.ts` (temporary smoke test, superseded by Task 12's fuller version)

**Interfaces:**
- Produces: a working `web/` package buildable with `pnpm --filter web build` and testable with `pnpm --filter web test`.

- [ ] **Step 1: Create the pnpm workspace file**

`pnpm-workspace.yaml`:
```yaml
packages:
  - '.'
  - 'web'
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "zug-web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 5: Create `web/vitest.config.ts` and `web/vitest.setup.ts`**

`web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

`web/vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create minimal `app/layout.tsx`, `app/globals.css`, `app/page.tsx`**

`web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`web/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'zug — AI that remembers how you think.',
  description: 'The fingerprint is earned, not configured.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx`:
```tsx
export default function Home() {
  return <main>zug</main>;
}
```

- [ ] **Step 7: Write the smoke test**

`web/tests/page.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '../app/page';

describe('Home page scaffold', () => {
  it('renders without crashing', () => {
    render(<Home />);
    expect(screen.getByText('zug')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Install deps and run the test to verify it fails, then passes**

Run: `pnpm install`
Run: `pnpm --filter zug-web test`
Expected: PASS (this is a scaffold step, not TDD-first — the test exists to prove the harness works)

- [ ] **Step 9: Verify the build succeeds**

Run: `pnpm --filter zug-web build`
Expected: build completes with exit code 0

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml web/
git commit -m "feat(web): scaffold zug-web Next.js workspace package"
```

---

### Task 2: Design tokens (Tailwind + brand palette + fonts)

**Files:**
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.js`
- Modify: `web/app/layout.tsx` (load fonts)
- Modify: `web/app/globals.css` (CSS variables)
- Test: `web/tests/tailwind-config.test.ts`

**Interfaces:**
- Produces: Tailwind color tokens `cream`, `seasalt`, `ink`, `jade`, `clay`, `cornflower`; font families `font-display`, `font-mono` available to every later component task.

- [ ] **Step 1: Write the failing test**

`web/tests/tailwind-config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import tailwindConfig from '../tailwind.config';

describe('tailwind brand tokens', () => {
  const colors = (tailwindConfig.theme?.extend as any).colors;

  it('matches docs/brand.md palette exactly', () => {
    expect(colors.cream).toBe('#EDE5D8');
    expect(colors.seasalt).toBe('#B8C9C0');
    expect(colors.ink).toBe('#22302B');
    expect(colors.jade).toBe('#596D69');
    expect(colors.clay).toBe('#B5603A');
    expect(colors.cornflower).toBe('#7AA5BF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test tailwind-config`
Expected: FAIL — `../tailwind.config` does not exist

- [ ] **Step 3: Create `web/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#EDE5D8',
        seasalt: '#B8C9C0',
        ink: '#22302B',
        jade: '#596D69',
        clay: '#B5603A',
        cornflower: '#7AA5BF',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter zug-web test tailwind-config`
Expected: PASS

- [ ] **Step 6: Wire up fonts and CSS variables**

`web/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'zug — AI that remembers how you think.',
  description: 'The fingerprint is earned, not configured.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="bg-cream text-ink font-sans">{children}</body>
    </html>
  );
}
```

`web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: var(--font-display), sans-serif;
}
```

- [ ] **Step 7: Rebuild to confirm no regressions**

Run: `pnpm --filter zug-web build`
Expected: build completes with exit code 0

- [ ] **Step 8: Commit**

```bash
git add web/tailwind.config.ts web/postcss.config.js web/app/layout.tsx web/app/globals.css web/tests/tailwind-config.test.ts
git commit -m "feat(web): brand palette and font tokens"
```

---

### Task 3: Content constants module

**Files:**
- Create: `web/app/content.ts`
- Test: `web/tests/content.test.ts`

**Interfaces:**
- Produces: `content` object with shape:
  ```typescript
  {
    nav: { label: string; href: string }[];
    hero: {
      originLine: string;
      headlinePrefix: string;
      headlineAccent: string;
      subhead: string;
      ctas: { label: string; href: string }[];
      sidebarCards: { label: string; body: string }[];
    };
    features: { number: string; title: string; body: string }[];
    upgrade: {
      eyebrow: string;
      headline: string;
      body: string;
      priceMonthly: string;
      priceYearly: string;
      proFeatures: string[];
      signup: { placeholder: string; buttonLabel: string; successMessage: string; errorMessage: string };
    };
    footer: { tagline: string; links: { label: string; href: string }[] };
  }
  ```
  Every later component task (4, 5, 6, 8, 9, 10, 11) consumes this shape.

- [ ] **Step 1: Write the failing test**

`web/tests/content.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { content } from '../app/content';

describe('content.ts', () => {
  it('has 3 nav links: Docs, GitHub, Pricing', () => {
    expect(content.nav.map((l) => l.label)).toEqual(['Docs', 'GitHub', 'Pricing']);
  });

  it('has the approved hero headline and subhead', () => {
    expect(content.hero.headlinePrefix).toBe('AI that remembers ');
    expect(content.hero.headlineAccent).toBe('how you think.');
    expect(content.hero.subhead).toBe('The fingerprint is earned, not configured.');
  });

  it('has exactly 3 hero sidebar cards with non-empty body copy', () => {
    expect(content.hero.sidebarCards).toHaveLength(3);
    expect(content.hero.sidebarCards.map((c) => c.label)).toEqual([
      'Cognitive fingerprint',
      'Cross-agent sync',
      'Your data',
    ]);
    for (const card of content.hero.sidebarCards) {
      expect(card.body.length).toBeGreaterThan(0);
    }
  });

  it('has exactly 4 feature grid items', () => {
    expect(content.features).toHaveLength(4);
    expect(content.features[0].title).toContain('Earned, not configured');
  });

  it('shows the approved pricing copy', () => {
    expect(content.upgrade.priceMonthly).toBe('$5 / month');
    expect(content.upgrade.priceYearly).toBe('$50 / year');
    expect(content.upgrade.proFeatures).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test content`
Expected: FAIL — `../app/content` does not exist

- [ ] **Step 3: Write `web/app/content.ts`**

```typescript
export interface NavLink {
  label: string;
  href: string;
}

export interface Content {
  nav: NavLink[];
  hero: {
    originLine: string;
    headlinePrefix: string;
    headlineAccent: string;
    subhead: string;
    ctas: NavLink[];
    sidebarCards: { label: string; body: string }[];
  };
  features: { number: string; title: string; body: string }[];
  upgrade: {
    eyebrow: string;
    headline: string;
    body: string;
    priceMonthly: string;
    priceYearly: string;
    proFeatures: string[];
    signup: {
      placeholder: string;
      buttonLabel: string;
      successMessage: string;
      errorMessage: string;
    };
  };
  footer: { tagline: string; links: NavLink[] };
}

const REPO_URL = 'https://github.com/dwolner/zug-mcp';

export const content: Content = {
  nav: [
    { label: 'Docs', href: `${REPO_URL}#readme` },
    { label: 'GitHub', href: REPO_URL },
    { label: 'Pricing', href: '#pricing' },
  ],
  hero: {
    originLine: 'זוּג · Hebrew for "pair"',
    headlinePrefix: 'AI that remembers ',
    headlineAccent: 'how you think.',
    subhead: 'The fingerprint is earned, not configured.',
    ctas: [
      { label: 'Install Free', href: `${REPO_URL}#readme` },
      { label: 'View on GitHub →', href: REPO_URL },
    ],
    sidebarCards: [
      {
        label: 'Cognitive fingerprint',
        body: 'Not a profile you fill out. A pattern Zug learns by watching how you actually work.',
      },
      {
        label: 'Cross-agent sync',
        body: 'Claude, Cursor, Windsurf — your fingerprint follows you into every session, every tool.',
      },
      {
        label: 'Your data',
        body: 'Plain files on disk. No database, no lock-in. Yours to read, back up, or delete.',
      },
    ],
  },
  features: [
    {
      number: '01',
      title: 'Earned, not configured',
      body: 'No profile to fill out. Zug watches how you work, synthesizes what it learns, and builds your fingerprint session by session.',
    },
    {
      number: '02',
      title: 'One identity, every agent',
      body: 'Claude, Cursor, Windsurf. Your fingerprint follows you across every tool you work in — automatically.',
    },
    {
      number: '03',
      title: 'Your data, always',
      body: 'Plain files. No database, no lock-in. Read it, back it up, delete it. It belongs to you.',
    },
    {
      number: '04',
      title: 'Compounds over time',
      body: 'Every session, Zug synthesizes new observations. The longer you use it, the less you have to explain yourself.',
    },
  ],
  upgrade: {
    eyebrow: 'Zug Pro',
    headline: 'Your fingerprint is now infrastructure.',
    body: "After 50 sessions, what you've built is worth protecting. Pro makes it permanent, portable, and always with you.",
    priceMonthly: '$5 / month',
    priceYearly: '$50 / year',
    proFeatures: [
      'Remote sync (fingerprint on every machine, always current)',
      'claude.ai web support via OAuth',
      'Server-side synthesis (runs on our infra, not yours)',
      'Persistent cloud backup',
      'Priority support',
    ],
    signup: {
      placeholder: 'you@example.com',
      buttonLabel: 'Join the waitlist',
      successMessage: "You're on the list — we'll email you when Pro ships.",
      errorMessage: 'Something went wrong — try again in a moment.',
    },
  },
  footer: {
    tagline: 'זוּג · Hebrew for "pair." Because the best thinking happens with a partner.',
    links: [
      { label: 'GitHub', href: REPO_URL },
      { label: 'Docs', href: `${REPO_URL}#readme` },
      { label: 'MIT License', href: `${REPO_URL}/blob/main/LICENSE` },
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test content`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/content.ts web/tests/content.test.ts
git commit -m "feat(web): single-source content module for landing page copy"
```

---

### Task 4: Rate limiter + signups store (lib layer)

**Files:**
- Create: `web/lib/rate-limit.ts`
- Create: `web/lib/signups-store.ts`
- Test: `web/tests/lib/rate-limit.test.ts`
- Test: `web/tests/lib/signups-store.test.ts`

**Interfaces:**
- Produces:
  - `checkRateLimit(key: string): boolean` — returns `true` if the request is allowed, `false` if rate-limited. Max 5 requests per key per 10-minute window, in-memory.
  - `appendSignup(email: string, filePath?: string): Promise<void>` — appends `{email, ts}\n` to a JSONL file, creating parent directories if needed. Defaults `filePath` to `process.env.SIGNUPS_FILE_PATH ?? '/data/signups.jsonl'`.
- Consumed by: Task 5 (`processSignup`).

- [ ] **Step 1: Write the failing rate-limit test**

`web/tests/lib/rate-limit.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, __resetRateLimitStateForTests } from '../../lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetRateLimitStateForTests();
  });

  it('allows the first 5 requests for a key', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('1.2.3.4')).toBe(true);
    }
  });

  it('blocks the 6th request within the window', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(false);
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('5.6.7.8')).toBe(true);
  });

  it('allows requests again after the window elapses', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(false);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(checkRateLimit('1.2.3.4')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test rate-limit`
Expected: FAIL — `../../lib/rate-limit` does not exist

- [ ] **Step 3: Write `web/lib/rate-limit.ts`**

```typescript
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

let hits = new Map<string, number[]>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    hits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}

export function __resetRateLimitStateForTests(): void {
  hits = new Map();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test rate-limit`
Expected: PASS

- [ ] **Step 5: Write the failing signups-store test**

`web/tests/lib/signups-store.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendSignup } from '../../lib/signups-store';

describe('appendSignup', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('creates parent directories and writes a JSON line', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zug-web-signups-'));
    const filePath = path.join(dir, 'nested', 'signups.jsonl');

    await appendSignup('person@example.com', filePath);

    const content = await readFile(filePath, 'utf8');
    const line = JSON.parse(content.trim());
    expect(line.email).toBe('person@example.com');
    expect(typeof line.ts).toBe('string');
  });

  it('appends multiple signups as separate lines', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zug-web-signups-'));
    const filePath = path.join(dir, 'signups.jsonl');

    await appendSignup('a@example.com', filePath);
    await appendSignup('b@example.com', filePath);

    const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).email).toBe('a@example.com');
    expect(JSON.parse(lines[1]).email).toBe('b@example.com');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter zug-web test signups-store`
Expected: FAIL — `../../lib/signups-store` does not exist

- [ ] **Step 7: Write `web/lib/signups-store.ts`**

```typescript
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PATH = '/data/signups.jsonl';

export async function appendSignup(email: string, filePath?: string): Promise<void> {
  const resolvedPath = filePath ?? process.env.SIGNUPS_FILE_PATH ?? DEFAULT_PATH;
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  const line = JSON.stringify({ email, ts: new Date().toISOString() });
  await appendFile(resolvedPath, line + '\n', 'utf8');
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter zug-web test signups-store`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add web/lib/rate-limit.ts web/lib/signups-store.ts web/tests/lib/
git commit -m "feat(web): rate limiter and JSONL signups store"
```

---

### Task 5: Signup Server Action

**Files:**
- Create: `web/app/actions/signup.ts`
- Test: `web/tests/actions/signup.test.ts`

**Interfaces:**
- Consumes: `checkRateLimit` and `appendSignup` from Task 4 (`web/lib/rate-limit.ts`, `web/lib/signups-store.ts`).
- Produces:
  - `processSignup(input: { email: string; honeypot: string; ip: string }, deps?: { appendSignup: typeof appendSignup; checkRateLimit: typeof checkRateLimit }): Promise<{ ok: true } | { ok: false; error: string }>` — pure orchestration logic, framework-free, dependency-injectable for testing.
  - `submitSignup(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>` — `"use server"` wrapper that extracts `email`/`honeypot` from `formData` and IP from `headers()`, then delegates to `processSignup`.
- Consumed by: Task 6 (`SignupForm.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/actions/signup.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSignup } from '../../app/actions/signup';

describe('processSignup', () => {
  let appendSignup: ReturnType<typeof vi.fn>;
  let checkRateLimit: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appendSignup = vi.fn().mockResolvedValue(undefined);
    checkRateLimit = vi.fn().mockReturnValue(true);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('accepts a valid email and appends it', async () => {
    const result = await processSignup(
      { email: 'person@example.com', honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result).toEqual({ ok: true });
    expect(appendSignup).toHaveBeenCalledWith('person@example.com');
  });

  it('rejects a malformed email without writing', async () => {
    const result = await processSignup(
      { email: 'not-an-email', honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result.ok).toBe(false);
    expect(appendSignup).not.toHaveBeenCalled();
  });

  it('rejects when the honeypot field is filled, without writing', async () => {
    const result = await processSignup(
      { email: 'person@example.com', honeypot: 'i-am-a-bot', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result.ok).toBe(false);
    expect(appendSignup).not.toHaveBeenCalled();
  });

  it('rejects when rate-limited, without writing', async () => {
    checkRateLimit.mockReturnValue(false);

    const result = await processSignup(
      { email: 'person@example.com', honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result.ok).toBe(false);
    expect(appendSignup).not.toHaveBeenCalled();
  });

  it('returns a generic error and logs when the store write fails', async () => {
    appendSignup.mockRejectedValue(new Error('disk full'));

    const result = await processSignup(
      { email: 'person@example.com', honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain('disk full');
    }
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test actions/signup`
Expected: FAIL — `../../app/actions/signup` does not exist

- [ ] **Step 3: Write `web/app/actions/signup.ts`**

```typescript
'use server';

import { headers } from 'next/headers';
import { appendSignup as defaultAppendSignup } from '../../lib/signups-store';
import { checkRateLimit as defaultCheckRateLimit } from '../../lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = 'Something went wrong — try again in a moment.';

export async function processSignup(
  input: { email: string; honeypot: string; ip: string },
  deps: {
    appendSignup: typeof defaultAppendSignup;
    checkRateLimit: typeof defaultCheckRateLimit;
  } = { appendSignup: defaultAppendSignup, checkRateLimit: defaultCheckRateLimit }
): Promise<SignupResult> {
  if (input.honeypot.trim() !== '') {
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!EMAIL_RE.test(input.email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  if (!deps.checkRateLimit(input.ip)) {
    return { ok: false, error: 'Too many attempts — try again later.' };
  }

  try {
    await deps.appendSignup(input.email);
    return { ok: true };
  } catch (err) {
    console.error('[signup] failed to store signup:', err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function submitSignup(formData: FormData): Promise<SignupResult> {
  const email = String(formData.get('email') ?? '');
  const honeypot = String(formData.get('company') ?? '');
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  return processSignup({ email, honeypot, ip });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test actions/signup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/actions/signup.ts web/tests/actions/
git commit -m "feat(web): signup server action with validation, honeypot, rate limit"
```

---

### Task 6: Signup form component

**Files:**
- Create: `web/app/components/SignupForm.tsx`
- Test: `web/tests/components/SignupForm.test.tsx`

**Interfaces:**
- Consumes: `content.upgrade.signup` (Task 3), `SignupResult` type and `submitSignup` (Task 5, as default `action` prop).
- Produces: `<SignupForm action={submitSignup} />` — `action` prop is injectable for testing; defaults to the real server action.
- Consumed by: Task 9 (`UpgradeSection.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/components/SignupForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignupForm } from '../../app/components/SignupForm';

describe('SignupForm', () => {
  it('shows the success message when the action resolves ok', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<SignupForm action={action} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    await waitFor(() =>
      expect(
        screen.getByText("You're on the list — we'll email you when Pro ships.")
      ).toBeInTheDocument()
    );
  });

  it('shows the returned error message when the action fails', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Enter a valid email address.' });
    render(<SignupForm action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    );
  });

  it('includes a hidden honeypot field named "company"', () => {
    const action = vi.fn();
    render(<SignupForm action={action} />);

    const honeypot = document.querySelector('input[name="company"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute('tabIndex', '-1');
    expect(honeypot).toHaveAttribute('autoComplete', 'off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test components/SignupForm`
Expected: FAIL — `../../app/components/SignupForm` does not exist

- [ ] **Step 3: Write `web/app/components/SignupForm.tsx`**

```tsx
'use client';

import { useActionState } from 'react';
import { content } from '../content';
import type { SignupResult } from '../actions/signup';
import { submitSignup } from '../actions/signup';

const initialState: SignupResult | null = null;

export function SignupForm({
  action = submitSignup,
}: {
  action?: (formData: FormData) => Promise<SignupResult>;
}) {
  const [state, formAction, pending] = useActionState<SignupResult | null, FormData>(
    async (_prevState, formData) => action(formData),
    initialState
  );

  const { signup } = content.upgrade;

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="email"
        name="email"
        required
        placeholder={signup.placeholder}
        className="border border-jade/40 bg-cream px-3 py-2 text-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-clay px-4 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-cream hover:bg-ink"
      >
        {signup.buttonLabel}
      </button>
      {state?.ok === true && (
        <p className="text-jade" role="status">
          {signup.successMessage}
        </p>
      )}
      {state?.ok === false && (
        <p className="text-clay" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test components/SignupForm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/components/SignupForm.tsx web/tests/components/SignupForm.test.tsx
git commit -m "feat(web): signup form component with success/error states"
```

---

### Task 7: Nav + Footer components

**Files:**
- Create: `web/app/components/Nav.tsx`
- Create: `web/app/components/Footer.tsx`
- Test: `web/tests/components/Nav.test.tsx`
- Test: `web/tests/components/Footer.test.tsx`

**Interfaces:**
- Consumes: `content.nav`, `content.footer` (Task 3).
- Produces: `<Nav />`, `<Footer />`.
- Consumed by: Task 12 (`page.tsx`).

- [ ] **Step 1: Write the failing tests**

`web/tests/components/Nav.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Nav } from '../../app/components/Nav';

describe('Nav', () => {
  it('renders Docs, GitHub, and Pricing links', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '#pricing');
  });
});
```

`web/tests/components/Footer.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../../app/components/Footer';

describe('Footer', () => {
  it('renders the tagline and MIT License link', () => {
    render(<Footer />);
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT License' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter zug-web test components/Nav components/Footer`
Expected: FAIL — components do not exist

- [ ] **Step 3: Write `web/app/components/Nav.tsx`**

```tsx
import { content } from '../content';

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b border-jade/20 px-6 py-4">
      <span className="font-mono text-sm text-jade">זוּג</span>
      <ul className="flex gap-6">
        {content.nav.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-jade hover:text-clay">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Write `web/app/components/Footer.tsx`**

```tsx
import { content } from '../content';

export function Footer() {
  return (
    <footer className="flex flex-col items-start justify-between gap-4 border-t border-jade/20 px-6 py-8 sm:flex-row sm:items-center">
      <p className="font-mono text-sm text-jade">{content.footer.tagline}</p>
      <ul className="flex gap-6">
        {content.footer.links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-jade hover:text-clay">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter zug-web test components/Nav components/Footer`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/app/components/Nav.tsx web/app/components/Footer.tsx web/tests/components/Nav.test.tsx web/tests/components/Footer.test.tsx
git commit -m "feat(web): Nav and Footer components"
```

---

### Task 8: Feature grid component

**Files:**
- Create: `web/app/components/FeatureGrid.tsx`
- Test: `web/tests/components/FeatureGrid.test.tsx`

**Interfaces:**
- Consumes: `content.features` (Task 3).
- Produces: `<FeatureGrid />`.
- Consumed by: Task 12 (`page.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/components/FeatureGrid.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureGrid } from '../../app/components/FeatureGrid';

describe('FeatureGrid', () => {
  it('renders all 4 feature titles', () => {
    render(<FeatureGrid />);
    expect(screen.getByText('Earned, not configured')).toBeInTheDocument();
    expect(screen.getByText('One identity, every agent')).toBeInTheDocument();
    expect(screen.getByText('Your data, always')).toBeInTheDocument();
    expect(screen.getByText('Compounds over time')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test components/FeatureGrid`
Expected: FAIL

- [ ] **Step 3: Write `web/app/components/FeatureGrid.tsx`**

```tsx
import { content } from '../content';

export function FeatureGrid() {
  return (
    <section className="grid grid-cols-1 gap-8 border-t border-jade/20 px-6 py-16 sm:grid-cols-2 md:grid-cols-4">
      {content.features.map((feature) => (
        <div key={feature.number}>
          <span className="font-mono text-xs text-jade">{feature.number}</span>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">{feature.title}</h3>
          <p className="mt-2 text-sm text-jade">{feature.body}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test components/FeatureGrid`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/components/FeatureGrid.tsx web/tests/components/FeatureGrid.test.tsx
git commit -m "feat(web): feature grid component"
```

---

### Task 9: Upgrade section component (wires in SignupForm)

**Files:**
- Create: `web/app/components/UpgradeSection.tsx`
- Test: `web/tests/components/UpgradeSection.test.tsx`

**Interfaces:**
- Consumes: `content.upgrade` (Task 3), `SignupForm` (Task 6).
- Produces: `<UpgradeSection />` with `id="pricing"` (matches Task 7's Nav `#pricing` anchor).
- Consumed by: Task 12 (`page.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/components/UpgradeSection.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpgradeSection } from '../../app/components/UpgradeSection';

vi.mock('../../app/actions/signup', () => ({
  submitSignup: vi.fn(),
}));

describe('UpgradeSection', () => {
  it('has id="pricing" so the Nav anchor resolves', () => {
    const { container } = render(<UpgradeSection />);
    expect(container.querySelector('#pricing')).not.toBeNull();
  });

  it('shows the price and all 5 Pro features', () => {
    render(<UpgradeSection />);
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText('$50 / year')).toBeInTheDocument();
    expect(screen.getByText(/Priority support/)).toBeInTheDocument();
  });

  it('includes the signup form CTA', () => {
    render(<UpgradeSection />);
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test components/UpgradeSection`
Expected: FAIL

- [ ] **Step 3: Write `web/app/components/UpgradeSection.tsx`**

```tsx
import { content } from '../content';
import { SignupForm } from './SignupForm';

export function UpgradeSection() {
  const { upgrade } = content;

  return (
    <section id="pricing" className="grid grid-cols-1 gap-8 border-t border-jade/20 bg-seasalt px-6 py-16 md:grid-cols-2">
      <div>
        <span className="font-mono text-xs uppercase tracking-widest text-jade">{upgrade.eyebrow}</span>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink">{upgrade.headline}</h2>
        <p className="mt-4 text-jade">{upgrade.body}</p>
        <p className="mt-6 font-display text-2xl text-clay">
          {upgrade.priceMonthly} <span className="text-jade">or</span> {upgrade.priceYearly}
        </p>
        <div className="mt-6">
          <SignupForm />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {upgrade.proFeatures.map((feature) => (
          <li key={feature} className="text-sm text-ink">
            {feature}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test components/UpgradeSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/components/UpgradeSection.tsx web/tests/components/UpgradeSection.test.tsx
git commit -m "feat(web): upgrade section with pricing and waitlist signup"
```

---

### Task 10: Signature motion component (reduced-motion aware)

**Files:**
- Create: `web/app/components/SignatureMoment.tsx`
- Test: `web/tests/components/SignatureMoment.test.tsx`

**Interfaces:**
- Produces: `<SignatureMoment />` — a client component with an internal `revealed` state. Renders 2 mono observation lines plus the synthesized sentence, toggling a `data-revealed` attribute.
- Consumed by: Task 11 (`Hero.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/components/SignatureMoment.test.tsx`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignatureMoment } from '../../app/components/SignatureMoment';

function mockMatchMedia(reduceMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduceMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
}

describe('SignatureMoment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the synthesized line immediately when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(<SignatureMoment />);

    const wrapper = screen.getByTestId('signature-moment');
    expect(wrapper).toHaveAttribute('data-revealed', 'true');
    expect(
      screen.getByText('You diagnose before you report. Lead me to the cause.')
    ).toBeInTheDocument();
  });

  it('starts unrevealed (mono log only) when reduced motion is not preferred', () => {
    mockMatchMedia(false);
    render(<SignatureMoment />);

    const wrapper = screen.getByTestId('signature-moment');
    expect(wrapper).toHaveAttribute('data-revealed', 'false');
  });

  it('always renders both mono observation lines', () => {
    mockMatchMedia(false);
    render(<SignatureMoment />);

    expect(screen.getByText(/prefers root-cause framing/)).toBeInTheDocument();
    expect(screen.getByText(/tests the actual gate/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test components/SignatureMoment`
Expected: FAIL

- [ ] **Step 3: Write `web/app/components/SignatureMoment.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';

const OBSERVATIONS = [
  '[2026·03] observed: prefers root-cause framing before solutions',
  '[2026·04] observed: tests the actual gate, not its description',
];

const SYNTHESIZED_LINE = 'You diagnose before you report. Lead me to the cause.';

export function SignatureMoment() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (query.matches) {
      setRevealed(true);
      return;
    }

    const timer = setTimeout(() => setRevealed(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-testid="signature-moment" data-revealed={revealed} className="bg-seasalt p-4">
      <div className="font-mono text-xs text-jade">
        {OBSERVATIONS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p
        className={`mt-3 font-display text-lg transition-opacity duration-500 ${
          revealed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-clay">{SYNTHESIZED_LINE}</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test components/SignatureMoment`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/components/SignatureMoment.tsx web/tests/components/SignatureMoment.test.tsx
git commit -m "feat(web): signature motion moment with reduced-motion support"
```

---

### Task 11: Hero section + sidebar cards

**Files:**
- Create: `web/app/components/Hero.tsx`
- Test: `web/tests/components/Hero.test.tsx`

**Interfaces:**
- Consumes: `content.hero` (Task 3), `SignatureMoment` (Task 10).
- Produces: `<Hero />`.
- Consumed by: Task 12 (`page.tsx`).

- [ ] **Step 1: Write the failing test**

`web/tests/components/Hero.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../../app/components/Hero';

describe('Hero', () => {
  it('renders the headline split into prefix and clay-accented span', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('AI that remembers how you think.');
    expect(screen.getByText('how you think.')).toHaveClass('text-clay');
  });

  it('renders both CTA links with correct hrefs', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: 'Install Free' })).toHaveAttribute(
      'href',
      expect.stringContaining('#readme')
    );
    expect(screen.getByRole('link', { name: 'View on GitHub →' })).toHaveAttribute(
      'href',
      'https://github.com/dwolner/zug-mcp'
    );
  });

  it('renders all 3 sidebar cards', () => {
    render(<Hero />);
    expect(screen.getByText('Cognitive fingerprint')).toBeInTheDocument();
    expect(screen.getByText('Cross-agent sync')).toBeInTheDocument();
    expect(screen.getByText('Your data')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test components/Hero`
Expected: FAIL

- [ ] **Step 3: Write `web/app/components/Hero.tsx`**

```tsx
import { content } from '../content';
import { SignatureMoment } from './SignatureMoment';

export function Hero() {
  const { hero } = content;

  return (
    <section className="grid grid-cols-1 gap-12 px-6 py-20 md:grid-cols-2">
      <div>
        <p className="font-mono text-sm text-jade">{hero.originLine}</p>
        <h1 className="mt-4 font-display text-4xl font-semibold text-ink sm:text-5xl">
          {hero.headlinePrefix}
          <span className="text-clay">{hero.headlineAccent}</span>
        </h1>
        <p className="mt-4 text-lg text-jade">{hero.subhead}</p>
        <div className="mt-8 flex gap-4">
          {hero.ctas.map((cta, i) => (
            <a
              key={cta.label}
              href={cta.href}
              className={
                i === 0
                  ? 'bg-clay px-4 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-cream hover:bg-ink'
                  : 'border-b border-jade font-display text-[11px] uppercase tracking-[0.16em] text-jade'
              }
            >
              {cta.label}
            </a>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4 border-l border-jade/20 pl-6">
        {hero.sidebarCards.map((card) => (
          <div key={card.label} className="bg-seasalt p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-jade">{card.label}</p>
            <p className="mt-2 font-display text-sm text-ink">{card.body}</p>
          </div>
        ))}
        <SignatureMoment />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test components/Hero`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/app/components/Hero.tsx web/tests/components/Hero.test.tsx
git commit -m "feat(web): hero section with sidebar cards and signature moment"
```

---

### Task 12: Compose full page

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/tests/page.test.ts` → rename/replace with `web/tests/page.test.tsx`

**Interfaces:**
- Consumes: `Nav` (7), `Hero` (11), `FeatureGrid` (8), `UpgradeSection` (9), `Footer` (7).
- Produces: the composed `<Home />` page — the first fully assembled landing page.

- [ ] **Step 1: Delete the Task 1 scaffold test and write the full page test**

Run: `rm web/tests/page.test.ts`

`web/tests/page.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '../app/page';

vi.mock('../app/actions/signup', () => ({
  submitSignup: vi.fn(),
}));

describe('Home page composition', () => {
  it('renders nav, hero heading, all 4 feature titles, pricing, and footer', () => {
    render(<Home />);

    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'AI that remembers how you think.'
    );
    expect(screen.getByText('Compounds over time')).toBeInTheDocument();
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test page.test`
Expected: FAIL — `page.tsx` still renders the Task 1 placeholder

- [ ] **Step 3: Update `web/app/page.tsx`**

```tsx
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { FeatureGrid } from './components/FeatureGrid';
import { UpgradeSection } from './components/UpgradeSection';
import { Footer } from './components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <FeatureGrid />
      <UpgradeSection />
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test page.test`
Expected: PASS

- [ ] **Step 5: Run the full test suite and the build**

Run: `pnpm --filter zug-web test`
Expected: all tests PASS
Run: `pnpm --filter zug-web build`
Expected: build completes with exit code 0

- [ ] **Step 6: Commit**

```bash
git add web/app/page.tsx web/tests/page.test.tsx
git rm web/tests/page.test.ts
git commit -m "feat(web): compose full landing page from all sections"
```

---

### Task 13: Mobile responsive pass

**Files:**
- Modify: `web/app/components/Hero.tsx`
- Modify: `web/app/components/FeatureGrid.tsx`
- Modify: `web/app/components/UpgradeSection.tsx`
- Modify: `web/app/components/Nav.tsx`

**Interfaces:**
- No interface changes — this task only adjusts Tailwind responsive classes on existing components from Tasks 7, 8, 9, 11.

Note: per the design spec, responsive layout correctness is verified manually (jsdom has no real layout engine), not via automated test. The deliverable for this task is the class changes below plus the manual check in Step 2.

- [ ] **Step 1: Confirm/adjust mobile-first responsive classes**

`Hero.tsx` already uses `grid-cols-1 md:grid-cols-2` (mobile: stacked, ≥768px: two columns) — no change needed, confirm it's present from Task 11.

`FeatureGrid.tsx` already uses `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` — confirm present from Task 8.

`UpgradeSection.tsx` already uses `grid-cols-1 md:grid-cols-2` — confirm present from Task 9.

In `Nav.tsx`, adjust the link list to wrap on narrow viewports:

```tsx
<ul className="flex flex-wrap gap-4 sm:gap-6">
```

- [ ] **Step 2: Manual verification**

Run: `pnpm --filter zug-web dev`
Open `http://localhost:3000` in a browser, use devtools responsive mode to check 375px (mobile), 768px (tablet), 1280px (desktop) widths. Confirm: Nav links wrap without overlap, Hero stacks to one column below 768px, sidebar cards sit below the headline/CTAs, feature grid goes 1 → 2 → 4 columns, Upgrade section stacks to one column below 768px.

- [ ] **Step 3: Run the test suite to confirm no regressions**

Run: `pnpm --filter zug-web test`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add web/app/components/Nav.tsx
git commit -m "feat(web): mobile-responsive nav wrapping"
```

---

### Task 14: Favicon + OG image

**Files:**
- Create: `web/app/icon.tsx`
- Create: `web/app/opengraph-image.tsx`
- Test: `web/tests/icon.test.ts`

**Interfaces:**
- Produces: Next.js App Router auto-detected `icon.tsx` (favicon) and `opengraph-image.tsx` (social preview image), both using `next/og`'s `ImageResponse`.

- [ ] **Step 1: Write the failing test**

`web/tests/icon.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import Icon, { size, contentType } from '../app/icon';

describe('app/icon.tsx', () => {
  it('exports a 32x32 png icon', () => {
    expect(size).toEqual({ width: 32, height: 32 });
    expect(contentType).toBe('image/png');
  });

  it('renders a valid image response', async () => {
    const response = await Icon();
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter zug-web test icon.test`
Expected: FAIL — `../app/icon` does not exist

- [ ] **Step 3: Write `web/app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#B5603A',
          borderRadius: '6px',
        }}
      >
        <span style={{ color: '#EDE5D8', fontSize: 20, fontWeight: 700 }}>Z</span>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter zug-web test icon.test`
Expected: PASS

- [ ] **Step 5: Write `web/app/opengraph-image.tsx`** (no dedicated unit test — Step 6 covers it via the build)

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#EDE5D8',
        }}
      >
        <span style={{ fontSize: 24, color: '#596D69', fontFamily: 'monospace' }}>
          זוּג · Hebrew for &quot;pair&quot;
        </span>
        <span style={{ fontSize: 64, fontWeight: 600, color: '#22302B', marginTop: 24 }}>
          AI that remembers <span style={{ color: '#B5603A' }}>how you think.</span>
        </span>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 6: Verify the build picks up both generated images**

Run: `pnpm --filter zug-web build`
Expected: build completes with exit code 0, output includes `icon` and `opengraph-image` routes

- [ ] **Step 7: Commit**

```bash
git add web/app/icon.tsx web/app/opengraph-image.tsx web/tests/icon.test.ts
git commit -m "feat(web): generated favicon and OG image"
```

---

### Task 15: Deploy infrastructure (Dockerfile, fly.toml, CI workflow)

**Files:**
- Create: `web/Dockerfile`
- Create: `web/fly.toml`
- Create: `.github/workflows/fly-deploy-web.yml`

**Interfaces:**
- No code interfaces — this task produces the deployable artifact and its CI trigger.

- [ ] **Step 1: Write `web/Dockerfile`**

```dockerfile
FROM node:20-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --filter zug-web...

FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/web/node_modules ./web/node_modules
COPY . .
RUN pnpm --filter zug-web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/web/.next/standalone ./
COPY --from=build /repo/web/.next/static ./web/.next/static
COPY --from=build /repo/web/public ./web/public
EXPOSE 3000
CMD ["node", "web/server.js"]
```

- [ ] **Step 2: Write `web/fly.toml`**

```toml
app = "zug-web"
primary_region = "iad"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "zug_web_data"
  destination = "/data"

[env]
  SIGNUPS_FILE_PATH = "/data/signups.jsonl"
```

- [ ] **Step 3: Write `.github/workflows/fly-deploy-web.yml`**

```yaml
name: Fly Deploy (web)
on:
  push:
    branches:
      - main
    paths:
      - 'web/**'
  workflow_dispatch:
jobs:
  deploy:
    name: Deploy zug-web
    runs-on: ubuntu-latest
    concurrency: deploy-web-group
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy -c web/fly.toml --dockerfile web/Dockerfile --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_WEB }}
```

- [ ] **Step 4: Verify the Docker build succeeds locally**

Run: `docker build -f web/Dockerfile -t zug-web-test .`
Expected: build completes with exit code 0

- [ ] **Step 5: Commit**

```bash
git add web/Dockerfile web/fly.toml .github/workflows/fly-deploy-web.yml
git commit -m "feat(web): Dockerfile, fly.toml, and path-scoped deploy workflow for zug-web"
```

- [ ] **Step 6: Manual follow-up (cannot be done from this repo — requires Fly/GitHub account access)**

Document, don't execute, these account-level steps for the user:
1. `fly apps create zug-web`
2. `fly volumes create zug_web_data --app zug-web --region iad --size 1`
3. Create a Fly deploy token scoped to `zug-web` and add it as the `FLY_API_TOKEN_WEB` secret in GitHub repo settings.
4. Point DNS for the chosen marketing domain at the `zug-web` Fly app (per Fly's custom domain docs) — domain choice itself was not decided in this plan and needs a decision from the user.

---

### Task 16: Manual verification checklist (final)

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter zug-web test`
Expected: all tests PASS

- [ ] **Step 2: Run typecheck and build**

Run: `pnpm --filter zug-web typecheck`
Expected: no errors
Run: `pnpm --filter zug-web build`
Expected: build completes with exit code 0

- [ ] **Step 3: Manual browser check**

Run: `pnpm --filter zug-web dev`, open `http://localhost:3000`:
- Confirm the signature moment (mono log → Clay synthesized line) animates once on load.
- In devtools, enable "prefers-reduced-motion: reduce" emulation, reload, confirm the synthesized line appears immediately with no animation.
- Submit the waitlist form with a valid email; confirm the success message appears and (in dev, with `SIGNUPS_FILE_PATH` pointed at a local temp file) a JSON line was appended.
- Submit again immediately 5+ times; confirm the 6th attempt shows the rate-limit error.
- Resize to 375px, 768px, 1280px; confirm the responsive behavior from Task 13.

- [ ] **Step 4: Run a Lighthouse pass**

In Chrome devtools → Lighthouse → run Accessibility + Performance audits against the dev build (or a local `pnpm --filter zug-web start` production build). Address any accessibility violations before considering T-053 done (contrast, alt text, focus states) — no numeric score threshold is required by the spec, but zero accessibility errors is the bar.

- [ ] **Step 5: Update the ticket**

Run (via Storybloq MCP or CLI): update T-053 status to `complete` once all above checks pass.

---

## Self-Review Notes

- **Spec coverage:** Repo/workspace layout (Task 1), Fly hosting + path-scoped CI (Task 15), pages/components per brand.md (Tasks 3, 7, 8, 9, 11), signature motion + reduced-motion (Task 10), signup data flow + error handling (Tasks 4, 5, 6), testing (all tasks + Task 16), forward-compat notes are documented in the design spec itself (not re-implemented here, correctly — T-056/T-057 are separate tickets).
- **Placeholder scan:** no TBD/TODO markers; brand.md's open items (sidebar copy, typefaces, mobile layout, favicon/OG) are resolved with concrete content/code in Tasks 3, 2, 13, 14 respectively.
- **Type consistency:** `SignupResult` type defined in Task 5 is reused verbatim in Task 6's `SignupForm` prop type. `content.upgrade.signup` shape defined in Task 3 matches exactly what Task 6 destructures. `appendSignup`/`checkRateLimit` signatures from Task 4 match the `deps` parameter type in Task 5's `processSignup`.
