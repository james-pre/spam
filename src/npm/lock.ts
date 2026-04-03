import * as z from 'zod';

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
	version: z.string(),
	lockfileVersion: z.literal(3),
	requires: z.boolean().optional(),
	packages: z.record(z.string(), PackageLockEntry),
});
export interface PackageLock extends z.infer<typeof PackageLock> {}
