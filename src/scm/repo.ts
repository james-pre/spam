import * as io from 'ioium/node';
import { basename, join, relative, resolve } from 'node:path';
import { styleText } from 'node:util';
import * as z from 'zod';
import { config } from '../config.js';
import * as npm from '../npm/index.js';
import { prettyPath } from './paths.js';
import type { Dependency } from '../dependency.js';
import semver from 'semver';
import { existsSync } from 'node:fs';

export const scmTools = ['git'] as const;

export type SCM = (typeof scmTools)[number];

export const scmPackageManagers = ['npm', 'yarn'] as const;

export type SCMPackageManager = (typeof scmPackageManagers)[number];

export const SourceRepository = z.object({
	path: z.string(),
	name: z.string().nullish(),
	scm: z.literal(scmTools),
	packageManagers: z.literal(scmPackageManagers).array(),
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

export function* getSourceRepoDependencies(repo: SourceRepository): Generator<Dependency> {
	const result: Dependency[] = [];

	for (const pm of repo.packageManagers) {
		switch (pm) {
			case 'npm': {
				if (existsSync(join(repo.path, 'package-lock.json'))) yield* npm.getDependencies(join(repo.path, 'package-lock.json'));
				break;
			}
		}
	}

	return result;
}
