import * as dnf5 from 'libdnf';
import type { PackageManager } from '../manager.js';
import type { QueryFilter } from '../query.js';
import type { Transaction, TransactionInit, TransactionPackage, TransactionRunOptions } from '../transaction.js';
import type { Package } from '../package.js';

function convertFilters(filters: QueryFilter[]): dnf5.PackageQueryFilter[] {
	return filters.map(f =>
		!Array.isArray(f)
			? f
			: f[0] == 'recent'
				? ({ type: 'recent', timestamp: f[1] } satisfies dnf5.PackageQueryFilterRecent)
				: f[0] == 'advisories'
					? ({
							type: 'advisories',
							advisories: f.filter(f => f !== 'advisories').map(([filter, cmp, value]) => ({ filter, cmp, value })),
						} satisfies dnf5.PackageQueryFilterAdvisories)
					: ({ type: f[0], cmp: f[1], value: f[2] } satisfies dnf5.PackageQueryFilterWithValue)
	);
}

function parsePackage(pkg: dnf5.Package): Package {
	return {
		...pkg,
		dependencies: pkg.requires,
	};
}

function parseTxPackage(txPkg: dnf5.TransactionPackage): TransactionPackage {
	return {
		...txPkg,
		package: parsePackage(txPkg.package),
		replaces: txPkg.replaces.map(parsePackage),
		replacedBy: txPkg.replacedBy.map(parsePackage),
	};
}

export class DnfTransaction implements Transaction {
	protected tx: dnf5.Transaction;

	constructor(public readonly init: TransactionInit) {
		const dnfInit: dnf5.TransactionInit = { allowErasing: init.allowErasing, operations: [] };

		for (const [type, values] of [
			['install', init.install],
			['remove', init.remove],
			['upgrade', init.upgrade],
			['downgrade', init.downgrade],
			['reinstall', init.reinstall],
		] as const) {
			if (!values?.length) continue;
			for (const spec of values) dnfInit.operations.push({ type, spec });
		}

		this.tx = new dnf5.Transaction(dnfInit);
	}

	get packages(): TransactionPackage[] {
		return this.tx.packages.map(parseTxPackage);
	}

	get brokenDependencyPackages(): Package[] {
		return this.tx.brokenDependencyPackages.map(parsePackage);
	}

	get conflictingPackages(): Package[] {
		return this.tx.conflictingPackages.map(parsePackage);
	}

	get isEmpty(): boolean {
		return this.tx.isEmpty;
	}

	async download(options?: dnf5.TransactionDownloadOptions): Promise<void> {
		this.tx.download(options);
	}

	run(options: TransactionRunOptions = {}): void {
		this.tx.run({
			...options,
			onInstallStart: (item, total) => options.onInstallStart?.(item && parseTxPackage(item), total),
			onInstallProgress: (item, amount, total) => options.onInstallProgress?.(item && parseTxPackage(item), amount, total),
			onInstallStop: (item, amount, total) => options.onInstallStop?.(item && parseTxPackage(item), amount, total),
			onUninstallStart: (item, total) => options.onUninstallStart?.(item && parseTxPackage(item), total),
			onUninstallProgress: (item, amount, total) => options.onUninstallProgress?.(item && parseTxPackage(item), amount, total),
			onUninstallStop: (item, amount, total) => options.onUninstallStop?.(item && parseTxPackage(item), amount, total),
			onUnpackError: item => options.onUnpackError?.(item && parseTxPackage(item)),
			onCpioError: item => options.onCpioError?.(item && parseTxPackage(item)),
			onScriptStart: (item, nevra, type) => options.onScriptStart?.(item && parseTxPackage(item), type),
			onScriptStop: (item, nevra, type, returnCode) => options.onScriptStop?.(item && parseTxPackage(item), type, returnCode),
			onScriptError: (item, nevra, type, returnCode) => options.onScriptError?.(item && parseTxPackage(item), type, returnCode),
			onElemProgress: (item, amount, total) => options.onElemProgress?.(item && parseTxPackage(item), amount, total),
		});
	}

	setDescription(description: string): void {
		this.tx.setDescription(description);
	}
}

export default {
	name: 'dnf',
	async load(options?: dnf5.LoadReposOptions) {
		dnf5.loadRepos(options);
	},
	async query(...filters) {
		return dnf5.query(...convertFilters(filters)).map(parsePackage);
	},
	async transaction(init) {
		return new DnfTransaction(init);
	},
} satisfies PackageManager;
