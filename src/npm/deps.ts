import type { PackageLock } from './package-json.js';

export interface CreateGraphOptions {
	includeVersions?: boolean;
	devDependencies?: boolean;
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
		for (let dir = from; ; ) {
			const path = (dir ? dir + '/' : '') + 'node_modules/' + dep;
			if (path in lock.packages) return path;

			const i = dir.lastIndexOf('node_modules/');
			if (i == -1) return;
			dir = dir.slice(0, Math.max(i - 1, 0));
		}
	}

	function display_name(path: string) {
		const data = lock.packages[path];
		const name = data?.name || (path ? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length) : lock.name);
		const version = data?.version || (path ? '' : lock.version);
		return JSON.stringify(options.includeVersions && version ? `${name}@${version}` : name);
	}

	function* add_dependencies(
		from: string,
		display: string,
		dependencies: Record<string, string> = {},
		attributes = ''
	): Generator<string> {
		const deps = [];
		for (const dep of Object.keys(dependencies)) {
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

		if (!options.devDependencies || path) return;

		yield* add_dependencies(path, display, data.devDependencies, '[style=dashed]');
	}

	// Start with the root package
	yield* add_package('');

	yield '}\n';
}
