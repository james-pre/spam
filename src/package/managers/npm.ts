import type { TransactionInit, Transaction } from 'libdnf';
import type { Manager } from '../index.js';

export default {
	name: 'npm',
	color: 'red',
	async load() {},
	async query(...filters) {
		return [];
	},
	transaction(init: TransactionInit): Promise<Transaction> {
		throw new Error('Function not implemented.');
	},
} satisfies Manager;
