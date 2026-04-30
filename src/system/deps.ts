import { existsSync } from 'node:fs';
import type { Dependency } from '../dependency.js';
import { getDependencies as getNPMDeps } from '../npm/lock.js';
import dnf from './dnf.js';

export async function* getGlobalDependencies(): AsyncGenerator<Dependency> {
	if (existsSync('/usr/lib/package-lock.json')) yield* getNPMDeps('/usr/lib/package-lock.json');

	try {
		await dnf.load();

		for (const pkg of await dnf.query('installed'))
			yield { from: 'dnf', name: pkg.name, version: pkg.evr, isDirect: pkg.reason == 'User' };
	} catch {
		//  user probably doesn't have dnf
	}
}
