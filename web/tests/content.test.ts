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
