import { appendSignup as defaultAppendSignup } from './signups-store';
import { checkRateLimit as defaultCheckRateLimit } from './rate-limit';
import { content } from '../app/content';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export type SignupResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = content.upgrade.signup.errorMessage;

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

  const email = input.email.trim().toLowerCase();

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  if (!deps.checkRateLimit(input.ip)) {
    return { ok: false, error: 'Too many attempts — try again later.' };
  }

  try {
    await deps.appendSignup(email);
    return { ok: true };
  } catch (err) {
    console.error('[signup] failed to store signup:', err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
