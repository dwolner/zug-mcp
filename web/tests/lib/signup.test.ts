import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSignup } from '../../lib/signup';

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

  it('normalizes email whitespace and casing before storing', async () => {
    const result = await processSignup(
      { email: '  Person@Example.COM  ', honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result).toEqual({ ok: true });
    expect(appendSignup).toHaveBeenCalledWith('person@example.com');
  });

  it('rejects an email over 254 characters without writing', async () => {
    const longEmail = `${'a'.repeat(250)}@b.co`;
    expect(longEmail.length).toBeGreaterThan(254);

    const result = await processSignup(
      { email: longEmail, honeypot: '', ip: '1.2.3.4' },
      { appendSignup, checkRateLimit }
    );

    expect(result).toEqual({ ok: false, error: 'Enter a valid email address.' });
    expect(appendSignup).not.toHaveBeenCalled();
  });
});
