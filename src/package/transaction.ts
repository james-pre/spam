import type { TransactionDownloadOptions } from 'libdnf';
import type { Package } from './package.js';

export interface TransactionInit {
	allowErasing?: boolean;
	install?: string[];
	downgrade?: string[];
	reinstall?: string[];
	remove?: string[];
	upgrade?: string[];
}

export interface TransactionPackage {
	package: Package;
	action: string;
	state?: string;
	reason: string;
	replaces?: Package[];
	replacedBy?: Package[];
}

export type TransactionPackageCallback = (item: TransactionPackage) => void;
export type TransactionTotalCallback = (total: bigint) => void;
export type TransactionAmountTotalCallback = (amount: bigint, total: bigint) => void;
export type TransactionPackageTotalCallback = (item: TransactionPackage, total: bigint) => void;

export type TransactionPackageAmountTotalCallback = (item: TransactionPackage, amount: bigint, total: bigint) => void;

export type TransactionScriptStopCallback = (item: TransactionPackage | null, type: string, returnCode: bigint) => void;

export interface TransactionRunOptions {
	onBeforeBegin?: TransactionTotalCallback;
	onAfterComplete?: (success: boolean) => void;

	onInstallStart?: TransactionPackageTotalCallback;
	onInstallProgress?: TransactionPackageAmountTotalCallback;
	onInstallStop?: TransactionPackageAmountTotalCallback;

	onTransactionStart?: TransactionTotalCallback;
	onTransactionProgress?: TransactionAmountTotalCallback;
	onTransactionStop?: TransactionTotalCallback;

	onUninstallStart?: TransactionPackageTotalCallback;
	onUninstallProgress?: TransactionPackageAmountTotalCallback;
	onUninstallStop?: TransactionPackageAmountTotalCallback;

	onUnpackError?: TransactionPackageCallback;
	onCpioError?: TransactionPackageCallback;

	onScriptStart?(item: TransactionPackage | null, type: string): void;
	onScriptStop?: TransactionScriptStopCallback;
	onScriptError?: TransactionScriptStopCallback;

	onElemProgress?: TransactionPackageAmountTotalCallback;

	onVerifyStart?: TransactionTotalCallback;
	onVerifyProgress?: TransactionAmountTotalCallback;
	onVerifyStop?: TransactionTotalCallback;
}

export interface Transaction {
	readonly packages: TransactionPackage[];
	readonly brokenDependencyPackages: Package[];
	readonly conflictingPackages: Package[];
	readonly isEmpty: boolean;

	/**
	 * Download the needed packages
	 */
	download(options?: TransactionDownloadOptions): void | Promise<void>;

	/**
	 * Run the transaction
	 */
	run(options?: TransactionRunOptions): void | Promise<void>;

	/**
	 * Set the description to be used in the transaction history
	 */
	setDescription?(description: string): void;
}
