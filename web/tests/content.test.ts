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

  it('carries no hero sidebar cards — they restated features 01-03 verbatim', () => {
    expect('sidebarCards' in content.hero).toBe(false);
  });

  it('has a 4-step flow, each with a sample of real data', () => {
    expect(content.howItWorks.steps.map((s) => s.title)).toEqual([
      'Observe',
      'Record',
      'Synthesize',
      'Inject',
    ]);
    for (const step of content.howItWorks.steps) {
      expect(step.number).toMatch(/^0[1-4]$/);
      expect(step.sample.length).toBeGreaterThan(0);
      for (const line of step.sample) expect(line.length).toBeGreaterThan(0);
    }
  });

  it('pairs the without/with comparison line for line', () => {
    const { without, withZug } = content.superpower;
    expect(without.lines).toHaveLength(withZug.lines.length);
    expect(without.lines.filter((l) => l.startsWith('Subagent'))).toHaveLength(2);
    expect(withZug.lines.filter((l) => l.includes('inherits'))).toHaveLength(2);
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

  it('contrasts a cold agent against one carrying the fingerprint', () => {
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
