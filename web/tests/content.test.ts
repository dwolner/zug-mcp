import { describe, it, expect } from 'vitest';
import { content } from '../app/content';

describe('content.ts', () => {
  it('has 3 nav links: Docs, GitHub, Pricing', () => {
    expect(content.nav.map((l) => l.label)).toEqual(['Docs', 'GitHub', 'Pricing']);
  });

  it('has the approved hero headline and subhead', () => {
    expect(content.hero.headlinePrefix).toBe('You explain yourself to the same AI ');
    expect(content.hero.headlineAccent).toBe('every single session.');
    expect(content.hero.subhead).toMatch(/Zug will watch how you work/);
  });

  it('marks exactly one agent layer as the one Zug writes through', () => {
    const zug = content.agentStack.layers.filter((l) => l.isZug);
    expect(zug).toHaveLength(1);
    expect(zug[0].name).toBe('Hooks');
  });

  it('gives the hook layer the only "no" in the judgment column', () => {
    const noes = content.agentStack.layers.filter((l) => l.judgment === 'no');
    expect(noes.map((l) => l.name)).toEqual(['Hooks']);
    // The graphic only argues if every other layer says yes.
    expect(content.agentStack.layers.filter((l) => l.judgment === 'yes')).toHaveLength(3);
  });

  it('states the install shape a cold reader needs before the CTA', () => {
    const labels = content.agentStack.spec.map((s) => s.label);
    expect(labels).toEqual(['Installs as', 'Works with', 'Lives in', 'Costs']);
  });

  it('does not presume prior usage in the Pro copy, which now sits near the top', () => {
    expect(content.upgrade.body).not.toMatch(/after \d+ sessions/i);
    expect(content.upgrade.body).toMatch(/free|does not expire|whole product/i);
  });

  it('scripts the hero session out of real hooks, commands and tool names', () => {
    const byKind = (k: string) => content.hero.session.filter((l) => l.kind === k);
    expect(byKind('hook').map((l) => l.text.split(/[\s:[]/)[0])).toEqual([
      'SessionStart',
      'PreCompact',
    ]);
    expect(byKind('call').map((l) => l.text)).toEqual([
      'zug_get_context()',
      'zug_save_observation()',
    ]);
    // Nothing invented: every command shown is one the CLI actually exposes.
    const commands = content.hero.session
      .filter((l) => l.kind === 'hook' || l.kind === 'command')
      .flatMap((l) => l.text.match(/zug \w+/g) ?? []);
    expect(commands).toEqual(['zug pull', 'zug compact']);
  });

  it('carries no hero sidebar cards — they restated features 01-03 verbatim', () => {
    expect('sidebarCards' in content.hero).toBe(false);
  });

  it('has a 4-step flow, each with a sample of real data', () => {
    expect(content.howItWorks.steps.map((s) => s.title)).toEqual([
      'Observe',
      'Record',
      'Synthesize',
      'Inject',
      'Repeat',
    ]);
    for (const step of content.howItWorks.steps) {
      expect(step.number).toMatch(/^0[1-5]$/);
      expect(step.sample.length).toBeGreaterThan(0);
      for (const line of step.sample) expect(line.length).toBeGreaterThan(0);
    }
  });

  it('keeps the page free of em dashes, which do not survive the house voice', () => {
    const walk = (v: unknown): string[] =>
      typeof v === 'string'
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(walk)
          : v && typeof v === 'object'
            ? Object.values(v).flatMap(walk)
            : [];
    expect(walk(content).filter((s) => s.includes('—'))).toEqual([]);
  });

  it('fans out to more than one agent', () => {
    expect(content.superpower.fanout.children.length).toBeGreaterThan(1);
    expect(content.superpower.fanout.root.length).toBeGreaterThan(0);
  });

  it('has exactly 4 feature grid items', () => {
    expect(content.features).toHaveLength(4);
    expect(content.features[0].title).toContain('Earned, not configured');
    // Terse by design: the flow and compound-effect sections demonstrate these,
    // so the grid summarises rather than re-explaining.
    for (const f of content.features) {
      expect(f.body.length).toBeLessThan(80);
    }
  });

  it('injects only ACTIVE.md — every other tier stays on disk', () => {
    const tiers = content.howItWorks.funnel.tiers;
    const injected = tiers[tiers.length - 1];
    expect(injected.label).toBe('Injected');
    expect(injected.files.map((f) => f.name)).toEqual(['ACTIVE.md']);
    // The point of the graphic: the injected tier is the smallest one.
    expect(injected.files.length).toBeLessThan(tiers[0].files.length);
  });

  it('contrasts a cold agent against one carrying the persona', () => {
    const { without, withZug } = content.workContext;
    expect(without.join(' ')).toMatch(/grep/);
    expect(withZug.join(' ')).not.toMatch(/grep/);
    expect(withZug.length).toBeLessThan(without.length);
  });

  it('positions recaps against git and tickets, not instead of them', () => {
    const names = content.recaps.sources.map((s) => s.name);
    expect(names).toContain('Git history');
    expect(names).toContain('Ticketing system');
    expect(names[names.length - 1]).toBe('Zug recaps');
    // The third column is what each source does NOT give you. The Zug row must
    // not list the reasoning there — that is the thing it is claimed to supply.
    const zug = content.recaps.sources[content.recaps.sources.length - 1];
    expect(zug.answers).toMatch(/reasoning/);
    expect(zug.misses).not.toMatch(/reasoning/);
  });

  it('shows the approved pricing copy', () => {
    expect(content.upgrade.priceMonthly).toBe('$5 / month');
    expect(content.upgrade.priceYearly).toBe('$50 / year');
    expect(content.upgrade.proFeatures).toHaveLength(5);
  });
});
