import * as dnf5 from 'libdnf';
import type { PackageManager } from '../manager.js';
import type { QueryFilter } from '../query.js';

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
	async load(options?: dnf5.LoadReposOptions) {
		dnf5.loadRepos(options);
	},
	async query(...filters) {
		return dnf5.query(...convertFilters(filters)).map(pkg => ({
			...pkg,
			dependencies: pkg.requires,
		}));
	},
	async transaction(init) {
		return new dnf5.Transaction(init);
	},
} satisfies PackageManager;
