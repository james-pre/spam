import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { styleText } from 'node:util';
import * as z from 'zod';
import { config } from '../config.js';
import * as npm from '../npm/index.js';
import { packageManagerNames, type PackageManagerName } from '../package/manager.js';
import type { Package } from '../package/package.js';
import { prettyPath } from './paths.js';

export const tools = ['git'] as const;

export type Tool = (typeof tools)[number];

export const SourceRepository = z.object({
	path: z.string(),
	name: z.string().nullish(),
	scm: z.literal(tools),
	packageManagers: z.literal(packageManagerNames).array(),
});
export interface SourceRepository extends z.infer<typeof SourceRepository> {}

export function* resolveSourceRepos(args: string[], recursive: boolean = false): Generator<SourceRepository> {
	const resolved = args.map(a => [a, resolve(a)]);
	repo_iter: for (const repo of config.repos) {
		for (const [arg, path] of resolved) {
			if (repo.name == arg || (!relative(path, repo.path).startsWith('../') && (recursive || path === repo.path))) {
				yield repo;
				continue repo_iter;
			}
		}
	}
}

export function formatSourceRepo(repo: SourceRepository): string {
	return `Name             : ${repo.name || styleText('dim', '(unnamed)')}
			Path             : ${repo.path}
			Source Control   : ${repo.scm}
			Package Managers : ${repo.packageManagers.join(', ')}
			`.replaceAll('\t', '');
}

export function shortSourceRepoString(repo: SourceRepository): string[] {
	return [styleText(repo.scm == 'git' ? 'green' : 'red', repo.scm), prettyPath(repo.path)];
}

export function* getSourceRepoPackages(repo: SourceRepository): Generator<Package & { from: PackageManagerName }> {
	const result: Package[] = [];

	for (const pm of repo.packageManagers) {
		switch (pm) {
			case 'npm': {
				if (existsSync(join(repo.path, 'package-lock.json')))
					yield* npm.parseLockFile(join(repo.path, 'package-lock.json')).map(pkg => Object.assign(pkg, { from: 'npm' as const }));
				break;
			}
		}
	}

	return result;
}
