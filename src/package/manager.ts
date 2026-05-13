import type { Package, PackageQueryFilter, Transaction, TransactionInit } from 'libdnf';
import type { InspectColor } from 'node:util';

export const packageManagers = ['dnf', 'npm', 'yarn'] as const;

export type PackageManagerName = (typeof packageManagers)[number];

export const pmColors = {
	dnf: 'blue',
	npm: 'red',
	yarn: 'red',
} satisfies Record<PackageManagerName, InspectColor>;

export interface PackageManager {
	name: string;

	/** Load the repositories/registries/etc. */
	load(): Promise<void>;

	query(...filters: PackageQueryFilter[]): Promise<Package[]>;

	transaction(init: TransactionInit): Promise<Transaction>;
}
