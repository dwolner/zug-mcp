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

  it('renders the headline split into prefix and clay-accented span', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('AI that remembers how you think.');
    expect(screen.getByText('how you think.')).toHaveClass('text-clay');
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

  it('renders all 3 sidebar cards', () => {
    render(<Hero />);
    expect(screen.getByText('Cognitive fingerprint')).toBeInTheDocument();
    expect(screen.getByText('Cross-agent sync')).toBeInTheDocument();
    expect(screen.getByText('Your data')).toBeInTheDocument();
  });
});
