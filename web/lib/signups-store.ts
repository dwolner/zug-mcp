import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PATH = '/data/signups.jsonl';

export async function appendSignup(email: string, filePath?: string): Promise<void> {
  const resolvedPath = filePath ?? process.env.SIGNUPS_FILE_PATH ?? DEFAULT_PATH;
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  const line = JSON.stringify({ email, ts: new Date().toISOString() });
  await appendFile(resolvedPath, line + '\n', 'utf8');
}
