import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignupForm } from '../../app/components/SignupForm';

describe('SignupForm', () => {
  it('shows the success message when the action resolves ok', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<SignupForm action={action} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    await waitFor(() =>
      expect(
        screen.getByText("You're on the list — we'll email you when Pro ships.")
      ).toBeInTheDocument()
    );
  });

  it('shows the returned error message when the action fails', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Enter a valid email address.' });
    render(<SignupForm action={action} />);

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    );
  });

  it('includes a hidden honeypot field named "company"', () => {
    const action = vi.fn();
    render(<SignupForm action={action} />);

    const honeypot = document.querySelector('input[name="company"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute('tabIndex', '-1');
    expect(honeypot).toHaveAttribute('autoComplete', 'off');
  });
});
