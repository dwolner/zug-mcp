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
