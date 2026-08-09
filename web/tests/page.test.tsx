import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '../app/page';

describe('Home page scaffold', () => {
  it('renders without crashing', () => {
    render(<Home />);
    expect(screen.getByText('zug')).toBeInTheDocument();
  });
});
