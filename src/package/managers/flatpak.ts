import type { PackageManager } from '../manager.js';
import * as flatpak from '../../../native/flatpak.js';
import * as io from 'ioium/node';
import type { Package } from '../package.js';
import type { Transaction, TransactionInit, TransactionPackage, TransactionRunOptions } from '../transaction.js';
import type { TransactionDownloadOptions } from 'libdnf';

let installation: flatpak.Installation;

const refKindToReason = {
	[0]: 'app',
	[1]: 'runtime',
} as const satisfies Record<flatpak.RefKind, string>;

export type RefKindReason = (typeof refKindToReason)[flatpak.RefKind];

export interface PackageFlatpak extends Package {
	kind: flatpak.RefKind;
}

function installedRefToPackage(ref: flatpak.InstalledRef): PackageFlatpak {
	return {
		name: ref.name,
		version: ref.appdataVersion,
		license: ref.appdataLicense,
		url: ref.origin,
		description: ref.appdataSummary,
		dependencies: [],
		conflicts: [],
		installSize: BigInt(ref.installedSize),
		kind: ref.kind,
	};
}

export class FlatpakTransaction implements Transaction {
	protected tx = new flatpak.Transaction(installation);

	constructor(public readonly init: TransactionInit) {}

	get packages(): TransactionPackage[] {

	}
	
	get brokenDependencyPackages(): Package[] {

	}

	get conflictingPackages(): Package[] {

	}

	get isEmpty(): boolean {

	}

	download(options?: TransactionDownloadOptions): void | Promise<void> {
		
	}

	run(options?: TransactionRunOptions): void | Promise<void> {
		
	}

}

export default {
	name: 'flatpak',
	async load() {
		const installations = flatpak.getSystemInstallations();
		io.debug(`flatpak: loaded installations (${installations.map(i => i.getId()).join(', ')}), using ${installations[0].getId()}`);

		installation = installations[0];
	},
	async query(...filters): Promise<PackageFlatpak[]> {
		if (!installation) throw new Error('Flatpak manager not initialized');

		if (filters.includes('installed')) {
			const refs = installation.listInstalledRefs();

			return refs.map(installedRefToPackage);
		}

		throw new Error('Not-local queries still WIP for flatpak');
	},
	async transaction(init) {
		if (!installation) throw new Error('Flatpak manager not initialized');

		const tx = new FlatpakTransaction(init);

		throw new Error('Transactions still WIP for flatpak');
	},
} satisfies PackageManager;
