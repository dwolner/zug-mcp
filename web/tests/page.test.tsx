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
    expect(screen.getByText('Compounds over time')).toBeInTheDocument();
    expect(screen.getByText('$5 / month')).toBeInTheDocument();
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
  });
});
