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
      'AI that remembers how you think.'
    );
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
  });

  it('renders the flow section and the compound-effect section', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'You do none of this.' })).toBeInTheDocument();
    expect(screen.getByText('Observe')).toBeInTheDocument();
    expect(screen.getByText('Inject')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Every agent you spawn already knows you.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /One fingerprint feeding/ })).toBeInTheDocument();
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
