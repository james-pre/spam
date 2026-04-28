import { warn } from 'ioium/node';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../config.js';

export function prettyPath(path: string) {
	if (path.startsWith(homedir())) {
		return '~' + path.slice(homedir().length);
	}
	return path;
}

interface ResolveContext {
	seen: Set<string>;
}

export function* resolveRecursive(ctx: ResolveContext, path: string): Generator<string> {
	const stats = fs.lstatSync(path);
	if (!stats.isDirectory()) return;
	ctx.seen.add(path);
	if (!stats.isDirectory()) return;
	const entries = fs.readdirSync(path);
	if (entries.includes('.git')) yield path;
	for (const entry of entries) {
		if (entry == '.git') continue;
		yield* resolveRecursive(ctx, join(path, entry));
	}
}

export function* resolvePaths(args: string[], recursive: boolean = false): Generator<string> {
	const ctx: ResolveContext = { seen: new Set() };
	for (const path of args.flatMap(p => fs.globSync(p))) {
		const stats = fs.statSync(path);
		if (!stats.isDirectory()) {
			warn('Not a directory:', path);
			continue;
		}
		if (!recursive) yield path;
		else yield* resolveRecursive(ctx, resolve(path));
	}
}
