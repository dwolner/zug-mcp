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
    expect(heading).toHaveTextContent('Every agent already knows how you work.');
    expect(screen.getByText('how you work.')).toHaveClass('text-accent');
  });

  it('renders both CTA links with correct hrefs', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: 'Install Free' })).toHaveAttribute(
      'href',
      expect.stringContaining('#readme')
    );
    expect(screen.getByRole('link', { name: 'View on GitHub →' })).toHaveAttribute(
      'href',
      'https://github.com/dwolner/zug-mcp'
    );
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
