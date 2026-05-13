import type { Transaction, TransactionInit } from 'libdnf';
import type { InspectColor } from 'node:util';
import * as managers from './managers/index.js';
import type { Package } from './package.js';
import type { QueryFilter } from './query.js';

export type ManagerName = keyof typeof managers;

export const managerNames = Object.keys(managers) as ManagerName[];

export interface Manager {
	name: string;
	color: InspectColor;

	/** Load the repositories/registries/etc. */
	load(): Promise<void>;

	query(...filters: QueryFilter[]): Promise<Package[]>;

	transaction(init: TransactionInit): Promise<Transaction>;
}
