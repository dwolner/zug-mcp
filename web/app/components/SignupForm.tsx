'use client';

import { useActionState } from 'react';
import { content } from '../content';
import type { SignupResult } from '../actions/signup';
import { submitSignup } from '../actions/signup';

const initialState: SignupResult | null = null;

export function SignupForm({
  action = submitSignup,
}: {
  action?: (formData: FormData) => Promise<SignupResult>;
}) {
  const [state, formAction, pending] = useActionState<SignupResult | null, FormData>(
    async (_prevState, formData) => action(formData),
    initialState
  );

  const { signup } = content.upgrade;

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="email"
        name="email"
        placeholder={signup.placeholder}
        className="border border-jade/40 bg-cream px-3 py-2 text-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-clay px-4 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-cream hover:bg-ink"
      >
        {signup.buttonLabel}
      </button>
      {state?.ok === true && (
        <p className="text-jade" role="status">
          {signup.successMessage}
        </p>
      )}
      {state?.ok === false && (
        <p className="text-clay" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
