import { describe, it, expect } from 'vitest';
import Icon, { size, contentType } from '../app/icon';

describe('app/icon.tsx', () => {
  it('exports a 32x32 png icon', () => {
    expect(size).toEqual({ width: 32, height: 32 });
    expect(contentType).toBe('image/png');
  });

  it('renders a valid image response', async () => {
    const response = await Icon();
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});
