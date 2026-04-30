import * as io from 'ioium/node';
import { basename } from 'node:path';
import semver from 'semver';
import * as z from 'zod';
import type { Dependency } from '../dependency.js';

export const PackageLockEntry = z
	.object({
		name: z.string(),
		version: z.string(),
		license: z.string(),
		resolved: z.string(),
		integrity: z.string(),
		dev: z.boolean(),
		dependencies: z.record(z.string(), z.string()),
		devDependencies: z.record(z.string(), z.string()),
		peerDependencies: z.record(z.string(), z.string()),
		optionalDependencies: z.record(z.string(), z.string()),
		bin: z.record(z.string(), z.string()),
		engines: z.record(z.string(), z.string()),
		funding: z.unknown(),
	})
	.partial();
export interface PackageLockEntry extends z.infer<typeof PackageLockEntry> {}

export const PackageLock = z.object({
	name: z.string(),
	version: z.string().nullish(),
	lockfileVersion: z.literal([2, 3]),
	requires: z.boolean().optional(),
	packages: z.record(z.string(), PackageLockEntry),
});
export interface PackageLock extends z.infer<typeof PackageLock> {}

export function* getDependencies(lockFilePath: string): Generator<Dependency> {
	let lock: PackageLock;
	try {
		lock = io.readJSON(lockFilePath, PackageLock);
	} catch (e) {
		throw new Error(`Could not parse ${lockFilePath}: ${io.errorText(e)}`);
	}

	const direct = lock.packages[''].dependencies || {};

	for (const [relPath, pkg] of Object.entries(lock.packages)) {
		const name = pkg.name || (relPath.includes('node_modules/') ? relPath.split('node_modules/').at(-1)! : basename(relPath));
		yield {
			from: 'npm',
			name,
			version: pkg.version || '*',
			isDirect: name in direct && semver.satisfies(pkg.version || '*', direct[name] || '*'),
		};
	}
}
