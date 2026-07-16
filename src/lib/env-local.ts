import fs from 'fs';
import path from 'path';

/**
 * Parses .env.local and returns its key/value pairs.
 * Used to bypass Turbopack's process.env caching bug in Route Handlers.
 */
export function parseEnvLocal(): Record<string, string> {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return {};
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      result[t.substring(0, i).trim()] = t.substring(i + 1).trim();
    }
    return result;
  } catch {
    return {};
  }
}
