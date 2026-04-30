import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { SourceRepository } from './scm/repo.js';

export const defaultConfigPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'spam.json');

const Config = z.looseObject({
	repos: SourceRepository.array().default([]),
});

if (!fs.existsSync(defaultConfigPath)) io.writeJSON(defaultConfigPath, Config.parse({}));

export let config: z.infer<typeof Config>;

export function loadConfig(path: string) {
	try {
		config = io.readJSON(path, Config);
	} catch (e) {
		io.exit('Failed to load config: ' + io.errorText(e));
	}
}

export function saveConfig(path: string) {
	try {
		io.writeJSON(path, config);
	} catch (e) {
		io.exit('Failed to save config: ' + io.errorText(e));
	}
}
