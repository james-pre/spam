import type { TransactionInit, Transaction } from 'libdnf';
import type { PackageManager } from '../manager.js';
import type { QueryFilter } from '../query.js';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { parseLockFile } from '../../npm/package-json.js';

export class Npm implements PackageManager {
	readonly name = 'npm';

	constructor(readonly prefix: string) {}

	protected get lockFilePath() {
		return join(this.prefix, 'package-lock.json');
	}

	async load() {
		if (!fs.existsSync(this.lockFilePath)) throw new Error('Missing package-lock.json');
	}

	async query(...filters: QueryFilter[]) {
		const lock = Array.from(parseLockFile(this.lockFilePath));

		for (const filter of filters)
			switch (filter) {
				case 'installed':
					return lock;
				default:
					throw new Error('Unsupported filter: ' + JSON.stringify(filter));
			}

		return [];
	}

	transaction(init: TransactionInit): Promise<Transaction> {
		throw new Error('Function not implemented.');
	}
}
