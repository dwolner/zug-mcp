import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignatureMoment } from '../../app/components/SignatureMoment';

function mockMatchMedia(reduceMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduceMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
}

describe('SignatureMoment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the synthesized line immediately when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(<SignatureMoment />);

    const wrapper = screen.getByTestId('signature-moment');
    expect(wrapper).toHaveAttribute('data-revealed', 'true');
    expect(
      screen.getByText('You diagnose before you report. Lead me to the cause.')
    ).toBeInTheDocument();
  });

  it('starts unrevealed (mono log only) when reduced motion is not preferred', () => {
    mockMatchMedia(false);
    render(<SignatureMoment />);

    const wrapper = screen.getByTestId('signature-moment');
    expect(wrapper).toHaveAttribute('data-revealed', 'false');
  });

  it('always renders both mono observation lines', () => {
    mockMatchMedia(false);
    render(<SignatureMoment />);

    expect(screen.getByText(/prefers root-cause framing/)).toBeInTheDocument();
    expect(screen.getByText(/tests the actual gate/)).toBeInTheDocument();
  });
});
