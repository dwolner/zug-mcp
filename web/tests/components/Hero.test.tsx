import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from '../../app/components/Hero';

function mockMatchMedia(reduceMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduceMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as any;
}

describe('Hero', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('renders the headline split into prefix and accent-coloured span', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('You explain yourself to the same AI every single session.');
    expect(screen.getByText('every single session.')).toHaveClass('text-accent');
  });

  it('offers the install command to copy, and GitHub as the only link', () => {
    render(<Hero />);
    // The old "Install Free" button pointed at the same README as the GitHub
    // link, so the two CTAs did the same thing.
    expect(screen.queryByRole('link', { name: 'Install Free' })).not.toBeInTheDocument();
    expect(screen.getByText('npm install -g zug-mcp && zug setup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy install command' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View on GitHub →' })).toHaveAttribute(
      'href',
      'https://github.com/dwolner/zug-mcp'
    );
  });

  it('renders the session terminal beside the headline', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-terminal')).toBeInTheDocument();
    // The claim the page spends four sections on: the hook fired unprompted.
    expect(screen.getByText(/SessionStart/)).toBeInTheDocument();
    expect(screen.getByText(/zug_get_context/)).toBeInTheDocument();
    expect(screen.getByText(/PreCompact/)).toBeInTheDocument();
  });

  it('staggers the session lines rather than animating them forever', () => {
    const { container } = render(<Hero />);
    const lines = container.querySelectorAll('.zug-line');
    expect(lines.length).toBeGreaterThan(5);
    // Each line has its own delay; the last one is the end of the sequence.
    const last = lines[lines.length - 1] as HTMLElement;
    expect(last.style.animationDelay).not.toBe('');
  });

  it('is a single column — the sidebar cards moved out to dedicated sections', () => {
    render(<Hero />);
    expect(screen.queryByText('Cognitive fingerprint')).not.toBeInTheDocument();
    expect(screen.queryByText('Cross-agent sync')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signature-moment')).not.toBeInTheDocument();
  });

  it('shows the Hebrew mark without niqqud, beside the English gloss', () => {
    render(<Hero />);
    expect(screen.getByText('זוג')).toBeInTheDocument();
    expect(screen.getByText('Hebrew for "pair"')).toBeInTheDocument();
  });
});
