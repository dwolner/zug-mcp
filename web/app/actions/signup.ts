'use server';

import { headers } from 'next/headers';
import { processSignup } from '../../lib/signup';
import type { SignupResult } from '../../lib/signup';

export type { SignupResult } from '../../lib/signup';

export async function submitSignup(formData: FormData): Promise<SignupResult> {
  const email = String(formData.get('email') ?? '');
  const honeypot = String(formData.get('company') ?? '');
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  return processSignup({ email, honeypot, ip });
}
