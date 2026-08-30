/**
 * SCOPE: these call DashboardPage() and assert on whether it throws. They do NOT render the
 * returned tree, so they cover the production gate and the empty-data path and say nothing about
 * whether the child components render correctly. That was verified manually instead -- the page
 * was loaded in a browser against the real ~/.zug with no console errors. Do not read this file as
 * broader coverage than it is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound }));

import DashboardPage, { dynamic } from './page';

beforeEach(() => {
  notFound.mockClear();
  // Point at a directory with no Zug data so the render path stays cheap and deterministic.
  vi.stubEnv('ZUG_DATA_DIR', '/nonexistent-zug-dir-for-tests');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dashboard route gating', () => {
  // web/ deploys to Fly, where ~/.zug does not exist. This route must not be reachable there.
  it('404s in production so it can never ship with the landing page', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => DashboardPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('renders outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => DashboardPage()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('is force-dynamic so a refresh re-reads the data directory', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('missing data directory', () => {
  it('renders an empty state instead of throwing when there is no data', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => DashboardPage()).not.toThrow();
  });
});
