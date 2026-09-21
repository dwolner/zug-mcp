import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignatureMoment } from '../../app/components/SignatureMoment';

describe('SignatureMoment', () => {
  it('shows the synthesized line without waiting for a reveal', () => {
    render(<SignatureMoment />);
    expect(
      screen.getByText('You diagnose before you report. Lead me to the cause.')
    ).toBeInTheDocument();
  });

  it('renders both raw observation lines above it', () => {
    render(<SignatureMoment />);
    expect(screen.getByText(/prefers root-cause framing/)).toBeInTheDocument();
    expect(screen.getByText(/tests the actual gate/)).toBeInTheDocument();
  });

  it('no longer animates: brand.md allows one motion moment and the hero owns it', () => {
    render(<SignatureMoment />);
    const line = screen.getByTestId('synthesized-line');
    expect(line).not.toHaveClass('transition-opacity');
    expect(line).not.toHaveClass('opacity-0');
    expect(screen.getByTestId('signature-moment')).not.toHaveAttribute('data-revealed');
  });
});
