import * as z from 'zod';
import { config } from '../config.js';
import { relative, resolve } from 'node:path';
import { prettyPath } from './paths.js';
import { styleText } from 'node:util';

export const supportSCM = ['git'] as const;

export type SCM = (typeof supportSCM)[number];

export const supportedPackageManagers = ['npm', 'yarn'] as const;

export type PackageManager = (typeof supportedPackageManagers)[number];

export const Repository = z.object({
	path: z.string(),
	name: z.string().nullish(),
	scm: z.literal(supportSCM),
	packages: z.literal(supportedPackageManagers).array(),
});
export interface Repository extends z.infer<typeof Repository> {}

export function* resolveRepos(args: string[], recursive: boolean = false): Generator<Repository> {
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

export function formatRepo(repo: Repository): string {
	return `Name             : ${repo.name || styleText('dim', '(unnamed)')}
			Path             : ${repo.path}
			Source Control   : ${repo.scm}
			Package Managers : ${repo.packages.join(', ')}
			`.replaceAll('\t', '');
}
