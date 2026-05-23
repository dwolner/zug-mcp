import fs from "fs";
import path from "path";
import os from "os";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export function loadApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const zugDir = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
  const envFile = path.join(zugDir, ".env");
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}
