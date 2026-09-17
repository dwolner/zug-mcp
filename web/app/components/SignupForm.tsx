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
      <label htmlFor="signup-email" className="sr-only">
        Email address
      </label>
      <input
        id="signup-email"
        type="email"
        name="email"
        required
        placeholder={signup.placeholder}
        className="rounded-sm border border-line bg-ground px-4 py-3 font-display text-[15px] text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-accent px-6 py-3 font-display text-[15px] font-semibold text-ground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {signup.buttonLabel}
      </button>
      {state?.ok === true && (
        <p className="font-display text-[15px] text-accent" role="status">
          {signup.successMessage}
        </p>
      )}
      {state?.ok === false && (
        <p className="font-display text-[15px] text-[#E3796C]" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
