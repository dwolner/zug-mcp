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
