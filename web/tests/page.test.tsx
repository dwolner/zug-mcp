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
      'You explain yourself to the same AI every single session.'
    );
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
  });

  it('answers what Zug is, then what it costs, before any of the mechanics', () => {
    render(<Home />);

    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());

    // Four sections, in this order. Was seven; the last three made the same
    // argument and are now beats inside one.
    expect(order).toEqual([
      'You configured the agent. Zug gets to know you.',
      'You have more than one computer.',
      'Install it once, then forget it exists.',
      'Sessions usually start from zero, by design.',
    ]);
  });

  it('tells a cold reader what they are installing', () => {
    render(<Home />);

    // Hooks are Claude Code only (src/setup.ts:251-267), but any MCP client
    // works without them: Devin CLI is used daily that way. The spec has to say
    // both things, since naming three clients undersells it and hiding the hook
    // gap oversells it.
    expect(screen.getByText(/three hooks on Claude Code/)).toBeInTheDocument();
    expect(screen.getByText(/Anything that speaks MCP/)).toBeInTheDocument();
    // The hook row is the one that does not route through the model's judgment.
    expect(screen.getByRole('rowheader', { name: 'Hooks' })).toBeInTheDocument();
  });

  it('renders the flow section and the compound-effect section', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { name: 'Install it once, then forget it exists.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Observe')).toBeInTheDocument();
    expect(screen.getByText('Inject')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sessions usually start from zero, by design.' })
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
    // Both are beats inside the compound section now, not sections of their own.
    expect(
      screen.getByRole('heading', { level: 3, name: 'It learns your system, not just your style.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Every session builds on the last one.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Zug recaps' })).toBeInTheDocument();
  });

  it('no longer renders the feature grid — every item is demonstrated above it', () => {
    render(<Home />);
    expect(screen.queryByText('Compounds over time')).not.toBeInTheDocument();
  });
});
