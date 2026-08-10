import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureGrid } from '../../app/components/FeatureGrid';

describe('FeatureGrid', () => {
  it('renders all 4 feature titles', () => {
    render(<FeatureGrid />);
    expect(screen.getByText('Earned, not configured')).toBeInTheDocument();
    expect(screen.getByText('One identity, every agent')).toBeInTheDocument();
    expect(screen.getByText('Your data, always')).toBeInTheDocument();
    expect(screen.getByText('Compounds over time')).toBeInTheDocument();
  });
});
