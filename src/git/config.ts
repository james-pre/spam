import { homedir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import * as io from 'ioium/node';
import * as fs from 'node:fs';

export const defaultConfigPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'sourcectl.json');
if (!fs.existsSync(defaultConfigPath)) fs.writeFileSync(defaultConfigPath, '{ "dirs": [] }');

const Config = z.looseObject({
	dirs: z.string().array(),
});

export let config: z.infer<typeof Config>;

export function loadConfig(path: string) {
	try {
		config = io.readJSON(path, Config);
	} catch (e) {
		io.exit('Failed to load config: ' + e);
	}
}

export function saveConfig(path: string) {
	try {
		io.writeJSON(path, config);
	} catch (e) {
		io.exit('Failed to save config: ' + e);
	}
}
