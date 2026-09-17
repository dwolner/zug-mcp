import { describe, it, expect } from 'vitest';
import tailwindConfig from '../tailwind.config';

describe('tailwind brand tokens', () => {
  const colors = (tailwindConfig.theme?.extend as any).colors;

  it('matches docs/brand.md palette exactly', () => {
    expect(colors.ground).toBe('#0E1518');
    expect(colors.surface).toBe('#141D21');
    expect(colors.sunk).toBe('#111A1D');
    expect(colors.ink).toBe('#E9EFEF');
    expect(colors.muted).toBe('#94A4A9');
    expect(colors.faint).toBe('#6D7E83');
    expect(colors.line).toBe('#243237');
    expect(colors.accent).toBe('#5FBFB2');
  });

  it('carries no leftover tokens from the retired cream palette', () => {
    for (const retired of ['cream', 'seasalt', 'jade', 'clay', 'cornflower']) {
      expect(colors[retired]).toBeUndefined();
    }
  });
});
