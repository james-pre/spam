import { styleText } from 'node:util';
import * as pkg from './package/index.js';

export interface Dependency {
	from: pkg.ManagerName;
	name: string;
	version: string;
	isDirect: boolean;
}

export function formatDep(dep: Dependency) {
	return `- ${styleText(pkg.managers[dep.from].color, dep.from)}/${dep.name} ${styleText('dim', dep.version ? 'v' + dep.version : '(unknown version)')} ${dep.isDirect ? '[direct]' : '[transitive]'}`;
}

export function formatDepSummary(deps: Iterable<Dependency>, packageManagers?: pkg.ManagerName[]) {
	return (
		(Object.entries(Object.groupBy(deps, dep => dep.from)) as [pkg.ManagerName, Dependency[]][])
			.filter(([from]) => !packageManagers || packageManagers.includes(from))
			.map(([from, dependencies]) => `${dependencies.length} ${styleText(pkg.managers[from].color, from)}`)
			.join(', ') || styleText('dim', '(no dependencies)')
	);
}
