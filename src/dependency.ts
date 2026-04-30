import { styleText } from 'node:util';
import { pmColors, type PackageManagerName } from './packages/manager.js';

export interface Dependency {
	from: PackageManagerName;
	name: string;
	version: string;
	isDirect: boolean;
}

export function formatDep(dep: Dependency) {
	return `- ${styleText(pmColors[dep.from], dep.from)}/${dep.name} ${styleText('dim', dep.version ? 'v' + dep.version : '(unknown version)')} ${dep.isDirect ? '[direct]' : '[transitive]'}`;
}

export function formatDepSummary(deps: Iterable<Dependency>, packageManagers?: PackageManagerName[]) {
	return (Object.entries(Object.groupBy(deps, dep => dep.from)) as [PackageManagerName, Dependency[]][])
		.filter(([from]) => !packageManagers || packageManagers.includes(from))
		.map(([from, dependencies]) => `${dependencies.length} ${styleText(pmColors[from], from)}`)
		.join(', ');
}
