import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../../app/components/Footer';

describe('Footer', () => {
  it('renders the tagline and MIT License link', () => {
    render(<Footer />);
    expect(screen.getByText(/best thinking happens with a partner/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT License' })).toBeInTheDocument();
  });
});
