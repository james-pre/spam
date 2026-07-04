import * as io from 'ioium/node';
import * as flatpak from '../../../native/flatpak.js';
import type { PackageManager } from '../manager.js';
import type { Package } from '../package.js';
import { doQueryCmp, type QueryCmp } from '../query.js';
import type { Transaction, TransactionInit, TransactionPackage, TransactionRunOptions } from '../transaction.js';

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
		reason: refKindToReason[ref.kind],
	};
}

function remoteRefToPackage(ref: flatpak.RemoteRef): PackageFlatpak {
	return {
		name: ref.name,
		version: ref.branch,
		url: ref.remoteName,
		dependencies: [],
		conflicts: [],
		downloadSize: BigInt(ref.downloadSize),
		installSize: BigInt(ref.installedSize),
		kind: ref.kind,
		reason: refKindToReason[ref.kind],
	};
}

/** The package fields a valued query filter may target. */
const filterableFields = ['name', 'version', 'description', 'url', 'license'] as const;
type FilterableField = (typeof filterableFields)[number];

/**
 * Build a predicate from a valued query filter (e.g. `['name', 'icontains', 'gnome']`).
 * The value may be a list, in which case a match against any entry passes.
 */
function makePredicate([field, cmp, value]: [FilterableField, QueryCmp, string | string[]]): (pkg: PackageFlatpak) => boolean {
	const values = Array.isArray(value) ? value : [value];
	return pkg => values.some(v => doQueryCmp(pkg[field] ?? '', cmp, v));
}

/**
 * Resolve a spec to a full flatpak ref (e.g. `app/org.gnome.Calculator/x86_64/stable`).
 *
 * A spec may already be a full ref, or a short application id — in which case
 * the currently installed ref with that name is looked up.
 */
function resolveInstalledRef(spec: string): string {
	// Already a full ref (kind/name/arch/branch)
	if (spec.includes('/')) return spec;

	const match = installation.listInstalledRefs().find(ref => ref.name === spec);
	if (!match) throw new Error(`Flatpak package '${spec}' is not installed`);

	return match.formatRef();
}

/**
 * Parse an install spec into a `[remote, ref]` pair. The remote is either given
 * explicitly as `remote:ref` or, when omitted, resolved from the remotes that
 * advertise the ref.
 */
function parseInstallSpec(spec: string): [remote: string, ref: string] {
	const sep = spec.indexOf(':');
	if (sep !== -1) return [spec.slice(0, sep), spec.slice(sep + 1)];

	// No explicit remote: find one advertising a ref with this name.
	for (const remote of installation.listRemotes()) {
		if (remote.getDisabled()) continue;

		const match = installation.listRemoteRefsSync(remote.getName()).find(ref => ref.name === spec);
		if (match) return [remote.getName(), match.formatRef()];
	}

	throw new Error(`Could not find a remote providing flatpak '${spec}'; specify one as 'remote:${spec}'`);
}

/** Build a best-effort {@link TransactionPackage} from a resolved ref. */
function toTxPackage(ref: string, action: string, origin?: string): TransactionPackage {
	const [, name, , branch] = ref.split('/');
	const installed = installation.listInstalledRefs().find(r => r.formatRef() === ref);

	const pkg: Package = installed
		? installedRefToPackage(installed)
		: {
				name: name ?? ref,
				version: branch ?? '',
				url: origin,
				dependencies: [],
				conflicts: [],
				installSize: 0n,
			};

	return { package: pkg, action, reason: pkg.reason ?? 'user' };
}

export class FlatpakTransaction implements Transaction {
	protected tx = new flatpak.Transaction(installation);

	public readonly packages: TransactionPackage[] = [];

	constructor(public readonly init: TransactionInit) {
		if (init.allowErasing) this.tx.setForceUninstall(true);
		if (init.reinstall?.length) this.tx.setReinstall(true);

		for (const spec of init.install ?? []) {
			const [remote, ref] = parseInstallSpec(spec);
			this.tx.addInstall(remote, ref, []);
			this.packages.push(toTxPackage(ref, 'install', remote));
		}

		for (const spec of init.reinstall ?? []) {
			const [remote, ref] = parseInstallSpec(spec);
			this.tx.addInstall(remote, ref, []);
			this.packages.push(toTxPackage(ref, 'reinstall', remote));
		}

		// Flatpak has no notion of downgrade distinct from installing a specific commit;
		// treat downgrades as updates so a version/commit spec is honored.
		for (const spec of [...(init.upgrade ?? []), ...(init.downgrade ?? [])]) {
			const ref = resolveInstalledRef(spec);
			this.tx.addUpdate(ref, [], null);
			this.packages.push(toTxPackage(ref, 'upgrade'));
		}

		for (const spec of init.remove ?? []) {
			const ref = resolveInstalledRef(spec);
			this.tx.addUninstall(ref);
			this.packages.push(toTxPackage(ref, 'remove'));
		}
	}

	// Flatpak resolves and pulls dependencies automatically; it surfaces
	// unresolved dependencies as an error at run time rather than a list.
	readonly brokenDependencyPackages = [];
	readonly conflictingPackages = [];

	get isEmpty(): boolean {
		return this.tx.isEmpty();
	}

	/**
	 * Flatpak's binding has no phase separate from {@link run} for downloading,
	 * so this is a no-op; packages are pulled as part of {@link run}.
	 */
	download(): void {}

	run(options: TransactionRunOptions = {}): void {
		const total = BigInt(this.packages.length);
		options.onBeforeBegin?.(total);

		let success = false;
		try {
			success = this.tx.run();
		} finally {
			options.onAfterComplete?.(success);
		}
	}

	setDescription(description: string): void {
		this.tx.setParentWindow(description);
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

		const predicates: ((pkg: PackageFlatpak) => boolean)[] = [];
		let packages: PackageFlatpak[];

		for (const filter of filters) {
			if (Array.isArray(filter)) {
				const [field, cmp, value] = filter;
				if (!(filterableFields as readonly string[]).includes(field)) throw new Error(`Unsupported flatpak query field '${field}'`);
				predicates.push(makePredicate([field as FilterableField, cmp as QueryCmp, value as string | string[]]));
				continue;
			}

			switch (filter) {
				case 'installed':
					packages = installation.listInstalledRefs().map(installedRefToPackage);
					break;
				case 'upgradable':
					packages = installation.listInstalledRefsForUpdate().map(installedRefToPackage);
					break;
				case 'available':
					// set below
					break;
				default:
					throw new Error(`Unsupported flatpak query filter '${filter}'`);
			}
		}

		packages ??= installation
			.listRemotes()
			.filter(remote => !remote.getDisabled())
			.flatMap(remote => installation.listRemoteRefsSync(remote.getName()))
			.map(remoteRefToPackage);

		return packages.filter(pkg => predicates.every(p => p(pkg)));
	},
	async transaction(init) {
		if (!installation) throw new Error('Flatpak manager not initialized');

		return new FlatpakTransaction(init);
	},
} satisfies PackageManager;
