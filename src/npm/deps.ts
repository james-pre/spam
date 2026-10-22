import { matchesGlob } from 'node:path';
import type { PackageLock } from './package-json.js';

export interface CreateGraphOptions {
	includeVersions?: boolean;
	devDependencies?: boolean;
	rootOnly?: boolean;
}

const graphHeader = `digraph {
	fontname="monospace";
	rankdir=LR;
	bgcolor="#111111";
	overlap=false;
	splines=true;
	node [shape=box, style=rounded, fontname="monospace", color="#ccf", fontcolor="#ccf"];
	edge [splines=true, color="#999", concentrate=true];
`;

export function* createGraph(lock: PackageLock, options: CreateGraphOptions): Generator<string> {
	yield graphHeader;

	const added = new Set<string>();

	function resolve(from: string, dep: string): string | undefined {
		for (let dir = from; ;) {
			const path = (dir ? dir + '/' : '') + 'node_modules/' + dep;
			const data = lock.packages[path];

			if (data) return data.link && data.resolved ? data.resolved : path;

			const i = dir.lastIndexOf('node_modules/');
			if (i == -1) {
				if (!dir) return;
				dir = '';
			} else dir = dir.slice(0, Math.max(i - 1, 0));
		}
	}

	function display_name(path: string) {
		const data = lock.packages[path];
		const i = path.lastIndexOf('node_modules/');
		const name = data?.name || (!path ? lock.name : path.slice(i == -1 ? path.lastIndexOf('/') + 1 : i + 'node_modules/'.length));
		const version = data?.version || (path ? '' : lock.version);
		return JSON.stringify(options.includeVersions && version ? `${name}@${version}` : name);
	}

	function* add_dependencies(
		from: string,
		display: string,
		dependencies: Record<string, string> | string[] = {},
		attributes = ''
	): Generator<string> {
		const deps = [];
		for (const dep of Array.isArray(dependencies) ? dependencies : Object.keys(dependencies)) {
			const path = resolve(from, dep);
			if (path === undefined) {
				deps.push(JSON.stringify(dep));
				continue;
			}

			deps.push(display_name(path));
			yield* add_package(path);
		}

		if (deps.length) yield `\t${display} -> ${deps.join(', ')} ${attributes};\n`;
	}

	function* add_package(path: string): Generator<string> {
		const data = lock.packages[path];
		if (!data) return;

		const display = display_name(path);
		if (added.has(display)) return;
		added.add(display);

		yield* add_dependencies(path, display, data.dependencies);

		if (path) return;

		if (!options.rootOnly && data.workspaces) {
			const workspaces = Object.entries(lock.packages)
				.filter(([name]) => name && data.workspaces!.some(pattern => matchesGlob(name, pattern)))
				.map(([, pkg]) => pkg.name!);

			yield* add_dependencies(path, display, workspaces, '[style=dotted]');
		}

		if (options.devDependencies) {
			yield* add_dependencies(path, display, data.devDependencies, '[style=dashed]');
		}
	}

	yield* add_package('');

	yield '}\n';
}
