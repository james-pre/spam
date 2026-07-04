import type { Transaction, TransactionInit } from './transaction.js';
import type { InspectColor } from 'node:util';
import type { Package } from './package.js';
import type { QueryFilter } from './query.js';

export const packageManagerNames = ['dnf', 'flatpak', 'npm', 'yarn'] as const;

export type PackageManagerName = (typeof packageManagerNames)[number];

export const packageManagerColors = {
	dnf: 'blue',
	flatpak: 'cyanBright',
	npm: 'red',
	yarn: 'red',
} satisfies Record<PackageManagerName, InspectColor>;

export interface PackageManagerLoadOptions {
	write?: boolean;
}

export interface PackageManager {
	readonly name: PackageManagerName;

	/** Load the repositories/registries/etc. */
	load(options?: PackageManagerLoadOptions): Promise<void>;

	query(...filters: QueryFilter[]): Promise<Package[]>;

	transaction(init: TransactionInit): Promise<Transaction>;
}
