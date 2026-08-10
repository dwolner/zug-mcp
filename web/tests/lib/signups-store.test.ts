import { describe, it, expect, afterEach } from 'vitest';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendSignup } from '../../lib/signups-store';

describe('appendSignup', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('creates parent directories and writes a JSON line', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zug-web-signups-'));
    const filePath = path.join(dir, 'nested', 'signups.jsonl');

    await appendSignup('person@example.com', filePath);

    const content = await readFile(filePath, 'utf8');
    const line = JSON.parse(content.trim());
    expect(line.email).toBe('person@example.com');
    expect(typeof line.ts).toBe('string');
  });

  it('appends multiple signups as separate lines', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zug-web-signups-'));
    const filePath = path.join(dir, 'signups.jsonl');

    await appendSignup('a@example.com', filePath);
    await appendSignup('b@example.com', filePath);

    const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).email).toBe('a@example.com');
    expect(JSON.parse(lines[1]).email).toBe('b@example.com');
  });
});
