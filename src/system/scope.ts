import * as fs from 'node:fs';
import * as os from 'node:os';
import dnf from '../package/managers/dnf.js';
import flatpak from '../package/managers/flatpak.js';
import { Npm } from '../package/managers/npm.js';
import type { ScopeLike, UserScope } from '../scope.js';
import { isRoot } from './utils.js';

/**
 * @todo detect native bindings dynamically
 */
export function* packageManagers() {
	yield dnf;
	yield flatpak;
	if (fs.existsSync('/usr/lib/package-lock.json')) yield new Npm('/usr/lib');
}

export const system = {
	type: 'system',
	get name() {
		return os.homedir();
	},
	get writable() {
		return isRoot();
	},
	packageManagers,
	get contains(): UserScope[] {
		// @todo
		return [];
	},
} as const satisfies ScopeLike;
