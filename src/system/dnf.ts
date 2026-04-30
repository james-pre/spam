import * as dnf5 from 'libdnf';
import type { PackageManager } from '../packages/index.js';

export default {
	name: 'dnf',

	load() {
		return new Promise((resolve, reject) => {
			try {
				dnf5.loadRepos();
				resolve();
			} catch (e) {
				reject(e);
			}
		});
	},

	query(...filters) {
		return new Promise((resolve, reject) => {
			try {
				const result = dnf5.query(...filters);
				resolve(result);
			} catch (e) {
				reject(e);
			}
		});
	},

	transaction(init) {
		return new Promise((resolve, reject) => {
			try {
				const result = dnf5.transaction(init);
				resolve(result);
			} catch (e) {
				reject(e);
			}
		});
	},
} satisfies PackageManager;
