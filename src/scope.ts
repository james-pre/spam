import type { PackageManager, PackageManagerName } from './package/manager.js';
import type { Tool as SCMTool } from './scm/repo.js';
import * as os from 'node:os';
import { isRoot, processHasUid } from './system/utils.js';
import * as fs from 'node:fs';
import dnf from './package/managers/dnf.js';
import flatpak from './package/managers/flatpak.js';
import { basename, join } from 'node:path';
import { Npm } from './package/managers/npm.js';
import type { Package } from './package/package.js';

/**
 * Spam keeps track of stuff in three kinds of scopes:
 * - system: Shared across users, system-wide, you get the idea. Think of stuff in `/usr/bin` and `/etc`.
 * - user: Globally available for a user. For example, `~/.config`.
 * - local: This is for things like git repositories
 *
 * What is there is keep track of?
 * - config
 * - cache
 * - packages
 * - sources
 */

export interface GetPackageOptions {
	onManagerFail?(from: PackageManagerName, error: Error): void;
}

export interface ScopeLike {
	readonly type: string;
	readonly name: string;
	readonly writable: boolean;

	readonly contains?: ScopeLike[];
	packageManagers(): IterableIterator<PackageManager> | PackageManager[];

	/**
	 * Local scopes should have source control.
	 * (they don't have to though)
	 */
	readonly sourceControl?: SCMTool;
}

export class LocalScope implements ScopeLike {
	readonly type = 'local';
	readonly name: string;
	protected readonly ownerName?: string;
	protected readonly ownerUid: number;
	protected readonly ownerGid: number;

	get writable() {
		return isRoot() || this.ownerName == os.userInfo().username || processHasUid(this.ownerUid) || processHasUid(this.ownerGid);
	}

	constructor(readonly path: string) {
		if (path.startsWith('/home/')) this.ownerName = path.split('/')[2];
		const stats = fs.statSync(path);
		this.ownerUid = stats.uid;
		this.ownerGid = stats.gid;

		this.name = basename(this.path);
	}

	packageManagers() {
		const pms: PackageManager[] = [];
		if (fs.existsSync(join(this.path, 'package.json'))) pms.push(new Npm(this.path));
		return pms;
	}

	get sourceControl() {
		if (fs.existsSync(join(this.path, '.git'))) return 'git';
	}
}

export class UserScope implements ScopeLike {
	readonly type = 'user';

	get writable() {
		return isRoot() || this.name == os.userInfo().username;
	}

	constructor(readonly name: string) {}

	packageManagers() {
		// @todo
		return [];
	}

	get contains(): LocalScope[] {
		// @todo
		return [];
	}
}

export async function* getPackages(scope: ScopeLike, opts: GetPackageOptions = {}) {
	for (const manager of scope.packageManagers()) {
		try {
			await manager.load({ write: false });

			for (const pkg of await manager.query('installed')) yield Object.assign(pkg, { from: manager.name } as const);
		} catch (err: any) {
			//  user probably doesn't have dnf
			opts.onManagerFail?.(manager.name, err);
		}
	}
}
