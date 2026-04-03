import type { PackageLock } from './lock.js';

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

	const added = new Set();

	function display_name(name: string, version: string) {
		name ||= lock.name;
		return JSON.stringify(options.includeVersions ? `${name}@${version}` : name);
	}

	function* add_dependencies(display: string, dependencies: Record<string, string> = {}, attributes = ''): Generator<string> {
		const deps = [];
		for (const [dep, dep_version] of Object.entries(dependencies)) {
			deps.push(display_name(dep, dep_version));
			yield* add_package(dep, dep_version);
			added.add(dep);
		}

		if (deps.length) yield `\t${display} -> ${deps.join(', ')} ${attributes};\n`;
	}

	function* add_package(name: string, version: string): Generator<string> {
		if (added.has(name)) return;

		const data = lock.packages[name] ?? lock.packages['node_modules/' + name];
		if (!data) return;

		const display = display_name(name, version);

		yield* add_dependencies(display, data.dependencies);

		if (!options.devDependencies || name) return;

		yield* add_dependencies(display, data.devDependencies, '[style=dashed]');
	}

	// Start with the root package
	yield* add_package('', lock.version);

	yield '}\n';
}
