/**
 * Spam keeps track of stuff in three kinds of locations:
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

import type * as pkg from './package/manager.js';
import type * as scm from './scm/repo.js';

export type Type = 'system' | 'user' | 'local';

export interface Location {
	type: Type;

	/**
	 * The name of the location
	 */
	name: string;

	/**
	 * What package managers are supported at this location
	 */
	packageManagers: pkg.Manager[];

	/**
	 * Local locations should have source control.
	 * (they don't have to though)
	 */
	sourceManager?: scm.Tool;
}

export function detect() {}

export function resolve() {}

export interface UserLocation extends Location {
	type: 'user';
	username: string;
}

export function user() {}
