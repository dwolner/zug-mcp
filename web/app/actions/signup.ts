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
