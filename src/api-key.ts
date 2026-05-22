import fs from "fs";
import path from "path";
import os from "os";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const ENV_FILE = path.join(os.homedir(), ".zug", ".env");

export function loadApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}
