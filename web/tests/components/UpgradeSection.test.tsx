import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpgradeSection } from '../../app/components/UpgradeSection';

vi.mock('../../app/actions/signup', () => ({
  submitSignup: vi.fn(),
}));

describe('UpgradeSection', () => {
  it('has id="pricing" so the Nav anchor resolves', () => {
    const { container } = render(<UpgradeSection />);
    expect(container.querySelector('#pricing')).not.toBeNull();
  });

  it('shows the price and all 5 Pro features', () => {
    render(<UpgradeSection />);
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText('$50 / year')).toBeInTheDocument();
    expect(screen.getByText(/Cloud backup/)).toBeInTheDocument();
    // The dashboard is the sweetener that makes Pro a product, not a tip jar.
    expect(screen.getByText(/dashboard showing what Zug has worked out/)).toBeInTheDocument();
  });

  it('includes the signup form CTA', () => {
    render(<UpgradeSection />);
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeInTheDocument();
  });
});
