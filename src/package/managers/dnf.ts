import * as dnf5 from 'libdnf';
import type { Manager, QueryFilter } from '../index.js';

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

export default {
	name: 'dnf',
	color: 'blue',
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
				const result = dnf5.query(...convertFilters(filters));
				resolve(
					result.map(pkg => ({
						...pkg,
						dependencies: pkg.requires,
					}))
				);
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
} satisfies Manager;
