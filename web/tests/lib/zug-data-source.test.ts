/**
 * Source selection for the dashboard (T-058 -> T-056).
 *
 * The behaviour under test is the TRIGGER CONDITION documented in lib/zug-data.ts: remote mode is
 * entered only when BOTH ZUG_URL and ZUG_TOKEN are set, and it never falls back to the local mirror
 * on failure. The no-fallback half is the one that matters -- a silent failover would render stale
 * local data under a "live server" header, which is exactly the class of invisible failure ISS-047
 * was filed for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSnapshot, parseActivePatterns, sessionContextsFromFiles } from '@/lib/zug-data';

const PULL_BODY = {
  observations: [],
  growth: [],
  reinforcements: [],
  lessons: [{}, {}],
  sessions: [{ filename: '2026-08-31-a.md', content: '# Session a\nDate: x\nContext: zug\n' }],
  persona: '## How you construct arguments\n- thinks in systems\n',
  active: 'pattern one\n\npattern two\n',
  synthesisStatus: { outcome: 'ok', timestamp: '2026-08-31T19:46:38.070Z' },
};

beforeEach(() => {
  vi.stubEnv('ZUG_DATA_DIR', '/nonexistent-zug-dir-for-tests');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('loadSnapshot source selection', () => {
  it('reads the local mirror when neither remote var is set', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const snap = await loadSnapshot();
    expect(snap.source.kind).toBe('local');
    expect(snap.source.label).toBe('/nonexistent-zug-dir-for-tests');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['url only', { ZUG_URL: 'https://zug-mcp.fly.dev' }],
    ['token only', { ZUG_TOKEN: 'secret' }],
  ])('stays local with %s — a half-configured remote is not a remote', async (_label, env) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const snap = await loadSnapshot();
    expect(snap.source.kind).toBe('local');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the server when both vars are set, and sends the token as a header', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(PULL_BODY), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('ZUG_URL', 'https://zug-mcp.fly.dev/');
    vi.stubEnv('ZUG_TOKEN', 'secret');

    const snap = await loadSnapshot();

    expect(snap.source).toEqual({ kind: 'remote', label: 'https://zug-mcp.fly.dev' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    // Trailing slash trimmed, so the path never doubles up.
    expect(url).toBe('https://zug-mcp.fly.dev/sync/pull?since=1970-01-01T00%3A00%3A00.000Z');
    expect((init.headers as Record<string, string>)['X-Zug-Token']).toBe('secret');
    // The token must not be smuggled into the URL, where it would land in logs.
    expect(url).not.toContain('secret');

    expect(snap.lessonCount).toBe(2);
    expect(snap.sessionFilenames).toEqual(['2026-08-31-a.md']);
    expect(snap.sessionContexts).toEqual({ a: 'zug' });
    expect(snap.activePatterns).toEqual(['pattern one', 'pattern two']);
    expect(snap.personaSections[0].heading).toBe('How you construct arguments');
    expect(snap.synthesisStatus?.outcome).toBe('ok');
  });

  it('throws rather than falling back to the mirror when the server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    vi.stubEnv('ZUG_URL', 'https://zug-mcp.fly.dev');
    vi.stubEnv('ZUG_TOKEN', 'secret');
    await expect(loadSnapshot()).rejects.toThrow('HTTP 500');
  });

  it('throws rather than falling back when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    vi.stubEnv('ZUG_URL', 'https://zug-mcp.fly.dev');
    vi.stubEnv('ZUG_TOKEN', 'secret');
    await expect(loadSnapshot()).rejects.toThrow('ECONNREFUSED');
  });
});

describe('remote payload parsers', () => {
  it('parseActivePatterns drops blanks and leading bullets', () => {
    expect(parseActivePatterns('- one\n\n  two  \n')).toEqual(['one', 'two']);
  });

  it('sessionContextsFromFiles skips files with no Context line', () => {
    expect(
      sessionContextsFromFiles([
        { filename: 'a.md', content: '# Session a\nContext: work\n' },
        { filename: 'b.md', content: '# Session b\nno context here\n' },
      ]),
    ).toEqual({ a: 'work' });
  });
});
