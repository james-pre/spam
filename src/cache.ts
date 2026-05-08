import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'spam');

mkdirSync(cacheDir, { recursive: true });
