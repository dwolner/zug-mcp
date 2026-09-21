import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '../app/page';

vi.mock('../app/actions/signup', () => ({
  submitSignup: vi.fn(),
}));

describe('Home page composition', () => {
  it('renders nav, hero heading, all 4 feature titles, pricing, and footer', () => {
    render(<Home />);

    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Every agent already knows how you work.'
    );
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
  });

  it('answers what Zug is, then what it costs, before any of the mechanics', () => {
    render(<Home />);

    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(order.slice(0, 3)).toEqual([
      'You already wrote an operating system for your agent.',
      'Your persona is now infrastructure.',
      'You do none of this.',
    ]);
  });

  it('tells a cold reader what they are installing', () => {
    render(<Home />);

    expect(screen.getByText('An MCP server and two hooks')).toBeInTheDocument();
    expect(screen.getByText('Claude Code, Cursor, Windsurf')).toBeInTheDocument();
    // The hook row is the one that does not route through the model's judgment.
    expect(screen.getByRole('rowheader', { name: 'Hooks' })).toBeInTheDocument();
  });

  it('renders the flow section and the compound-effect section', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'You do none of this.' })).toBeInTheDocument();
    expect(screen.getByText('Observe')).toBeInTheDocument();
    expect(screen.getByText('Inject')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The tax you stop paying.' })
    ).toBeInTheDocument();
    // Two variants share the caption: the svg at md+, the stacked boxes below it.
    expect(screen.getAllByRole('img', { name: /One persona feeding/ })).toHaveLength(2);
  });

  it('keeps the signature moment on the page, inside the Synthesize step', () => {
    render(<Home />);
    expect(screen.getByTestId('signature-moment')).toBeInTheDocument();
  });

  it('names the real Zug artifacts in the context funnel', () => {
    render(<Home />);
    for (const file of ['observations.jsonl', 'PERSONA.md', 'PLAYBOOK.md', 'ACTIVE.md']) {
      expect(screen.getAllByText(file).length).toBeGreaterThan(0);
    }
  });

  it('renders the work-context and recap sections', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: 'It knows the shape of what you work on.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proof of what you actually did.' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Zug recaps' })).toBeInTheDocument();
  });

  it('no longer renders the feature grid — every item is demonstrated above it', () => {
    render(<Home />);
    expect(screen.queryByText('Compounds over time')).not.toBeInTheDocument();
  });
});
