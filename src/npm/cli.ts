import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { createWriteStream } from 'node:fs';
import { styleText } from 'node:util';
import spam from '../cli.js';
import * as api from './api.js';
import { createGraph } from './deps.js';
import { PackageLock } from './lock.js';
import * as replicate from './replicate.js';

const num = (n: number) => styleText('blueBright', n.toString());

const cli = spam.command('npm').alias('node');

cli.command('graph')
	.option('-i, --input <path>', 'Path to the input package-lock.json file', 'package-lock.json')
	.option('-o, --output <path>', 'Path to the output DOT file', '/proc/self/fd/1')
	.option('-V, --include-versions', 'Include package versions in the graph')
	.option('-D, --dev-dependencies', 'Include devDependencies in the graph')
	.action(options => {
		let lock: PackageLock;
		try {
			lock = io.readJSON(options.input, PackageLock);
		} catch {
			io.exit('Invalid package-lock.json file', 1);
		}

		const stream = createWriteStream(options.output);

		for (const part of createGraph(lock, options)) {
			stream.write(part);
		}

		stream.close();
	});

cli.command('stats')
	.option('-v, --verbose', 'Enable verbose output')
	.option('--debug', 'Show debugging info, including API requests')
	.option('-p, --package <name...>', 'Get stats for packages with the given name', [] as string[])
	.option('-a, --author <name...>', 'Get stats for packages maintained by the given author', [] as string[])
	.option('-q, --quiet', 'Suppress output')
	.option('-P, --pkg-info', 'Show information for each package, not just overall', false)
	.option('-S, --start', 'Also include when a package was first downloaded')
	.option('--sort <prop>', 'Sort packages by (name/downloads/date)')
	.option('-s, --sum-downloads', 'Show total downloads for all packages', false)
	.option('-e, --extra', 'Show extra stats like download rates')
	.option('-D, --diagnostics', 'Show diagnostic information')
	.action(async opts => {
		const isSinglePackage = !opts.author?.length && opts.package?.length == 1;

		if (isSinglePackage) {
			opts.pkgInfo = true;
			opts.sumDownloads = false;
			opts.sort = undefined;
		}

		function num(val: number | string, style: Parameters<typeof styleText>[0] = 'blueBright'): string {
			return styleText(style, val.toString());
		}

		for (const author of opts.author) {
			const results = await api.searchNpm('maintainer:' + author);

			console.log(styleText('whiteBright', author), 'maintains', num(results.length, 'cyan'), 'packages.');

			opts.package.push(...results.map(r => r.package.name));
		}

		let sum = 0;

		const nameLength = Math.max(...opts.package.map(name => name.length));

		function _print(info: api.PackageDownloadInfo) {
			const message = [styleText('whiteBright', info.package.padEnd(nameLength)), 'has', num(info.total), 'downloads'];

			if (opts.start) message.push('since', styleText('greenBright', info.start));

			console.log(...message);

			if (!opts.pkgInfo || !opts.extra) return;

			const spacing = ' '.repeat(nameLength);

			console.log(
				spacing,
				Object.entries(info.rates)
					.map(([key, value]) => `${num(value, 'cyan')}/${key}`)
					.join(', ')
			);

			const recent = [
				['day', (info.downloads.at(-1)?.downloads || info.downloads.at(-2)?.downloads) ?? 'unknown'],
				['week', info.downloads.slice(-7).reduce((a, b) => a + b.downloads, 0)],
				['month', info.downloads.slice(-30).reduce((a, b) => a + b.downloads, 0)],
			] as const;

			console.log(spacing, recent.map(([span, value]) => `${num(value, 'blueBright')} in the past ${span}`).join(', '));

			console.log('');
		}

		function onWarning(message: string) {
			if (!opts.verbose) return;
			console.warn(styleText('yellow', 'Warning:'), message);
		}

		const results: api.PackageDownloadInfo[] = [];
		let time = 0;

		const unscopedNames = opts.package.filter(name => !api.scopedPackageName.test(name));
		if (!isSinglePackage && unscopedNames.length > 1) {
			opts.package = opts.package.filter(name => api.scopedPackageName.test(name));

			const start = performance.now();
			const info = await api
				.getPackageDownloadsBulk(unscopedNames, onWarning)
				.catch(e => io.exit(`Error fetching bulk data: ${opts.verbose && e instanceof Error ? e.stack : e}`));

			sum += info.total;

			results.push(...Object.values(info.packages));

			if (!opts.sort) {
				for (const pkg of Object.values(info.packages)) {
					_print(pkg);
				}
			}

			time += performance.now() - start;
		}

		for (const name of opts.package) {
			const start = performance.now();
			let info: api.PackageDownloadInfo;
			try {
				info = await api.getPackageDownloads(name, onWarning);
			} catch (e) {
				io.error(`Error fetching data for package "${name}": ${opts.verbose && e instanceof Error ? e.stack : e}`);
				continue;
			}

			sum += info.total;

			results.push(info);

			if (!opts.sort) _print(info);

			time += performance.now() - start;
		}

		if (opts.sort) {
			results.sort((a, b) => {
				if (opts.sort === 'name') return a.package.localeCompare(b.package);
				if (opts.sort === 'downloads') return b.total - a.total;
				if (opts.sort === 'date') return a.start.localeCompare(b.start);
				return 0;
			});

			for (const result of results) _print(result);
		}

		if (opts.sumDownloads) {
			console.log('Total downloads for all packages:', num(sum, 'cyanBright'));
		}

		if (opts.extra && !isSinglePackage) {
			let rates = { day: 0, week: 0, month: 0 };
			for (const result of results) {
				rates.day += result.rates.day;
				rates.week += result.rates.week;
				rates.month += result.rates.month;
			}
			console.log(
				'Download rates:',
				Object.entries(rates)
					.map(([key, value]) => `${num(value, 'cyan')}/${key}`)
					.join(', ')
			);
		}

		if (opts.diagnostics) {
			console.log(
				'Took',
				num(time > 5000 ? (time / 1000).toFixed(2) + 's' : Math.round(time) + 'ms'),
				'with',
				num(api.diagnostics.requests),
				'requests and',
				num(api.diagnostics.retries),
				'retries'
			);
		}
	});

const npm_db = cli.command('db').description('Manage the local npm database');

npm_db
	.command('status')
	.description('Show local cache status')
	.action(async () => {
		const { doc_count, update_seq } = await replicate.getMetadata();

		if (!fs.existsSync(replicate.cachePath)) {
			console.log('No local cache.');
			console.log(`Remote has ${num(doc_count)} entries and ${num(update_seq)} changes.`);
			return;
		}

		const cache = await replicate.getCache();

		const cachedEntries = Object.keys(cache.entries).length;
		const diff = update_seq - cache.update_seq;
		const isBehind = diff > 0;
		const magnitude = Math.abs(diff);

		console.log(num(cachedEntries), 'cached entries.');
		console.log(
			styleText(isBehind ? 'yellow' : 'cyan', magnitude.toString()),
			'changes',
			isBehind ? 'behind' : 'ahead',
			`(cached ${num(cache.update_seq)}, remote ${num(update_seq)})`
		);
	});

npm_db
	.command('clean')
	.description('Remove local npm database cache')
	.action(() => {
		if (replicate.removeCache()) console.log('Local npm cache removed');
		else console.log('No local npm cache file found');
	});

npm_db
	.command('update')
	.alias('up')
	.description('Download the latest npm database')
	.action(async () => {
		if (!fs.existsSync(replicate.cachePath)) {
			await replicate.getCache();
			return;
		}

		const applied = await replicate.update();
		console.log('Applied', num(applied), 'changes.');
	});

npm_db
	.command('show')
	.description('Show cached rev for package id')
	.argument('<id>', 'Package id')
	.action(async id => {
		const cache = await replicate.getCache();
		const rev = cache.entries[id];
		if (typeof rev === 'undefined') console.log('not found');
		else console.log(rev);
	});

const punctuationRegex = /[-_.]+/g;
const normalize = (value: string) => value.toLowerCase().replaceAll(punctuationRegex, '');

cli.command('check-name')
	.argument('[names...]', 'Names to check')
	.option('-f, --file <path...>', 'Path to a file containing npm package names')
	.option('-i, --ignore <status...>', 'Status to ignore', [] as string[])
	.option('--print-only <status>', 'Print only names with the specified status')
	.option('--debug', 'Enable debug output')
	.action(async (cliNames: string[], options) => {
		const displayNames = new Map();
		let maxNameLength = 0;

		function addNames(values: Iterable<string>) {
			for (const displayName of values) {
				let name = displayName.toLowerCase();
				displayNames.set(name, displayName);
				maxNameLength = Math.max(displayName.length, maxNameLength);
			}
		}

		addNames(cliNames);

		for (const path of options.file || []) {
			if (!fs.existsSync(path)) io.exit('Input file does not exist: ' + path);

			const contents = fs.readFileSync(path, { encoding: 'utf8' });
			const fileNames = contents.replaceAll('\n', ',').replaceAll(/\s/g, '').split(',');
			addNames(fileNames);
		}

		const namesToCheck = new Set(displayNames.keys());

		if (!namesToCheck.size) io.exit('No names specified');

		if (!options.printOnly) console.log(`Checking availability of ${styleText('blueBright', namesToCheck.size.toString())} names...`);

		const statusStyles = {
			error: 'redBright',
			yes: 'green',
			no: 'yellow',
			duplicate: 'magenta',
			unknown: 'cyan',
		} as const;

		type Status = keyof typeof statusStyles;

		function printName(name: string, status: Status, existing?: string) {
			if (options.ignore.includes(status) || (options.printOnly && options.printOnly != status)) {
				return;
			}

			if (options.printOnly) {
				console.log(name);
				return;
			}

			console.log(
				styleText('blueBright', name.padEnd(maxNameLength)) + ':',
				styleText(statusStyles[status], status),
				existing && existing !== name ? `(${styleText('cyan', existing)})` : ''
			);
		}

		let checkedNames = new Set();
		const cache = await replicate.getCache();
		const normalizedNames = Object.create(null);

		for (const id of Object.keys(cache.entries)) normalizedNames[normalize(id)] = id;

		for (const name of namesToCheck) {
			if (checkedNames.has(name)) {
				printName(displayNames.get(name), 'duplicate');
				continue;
			}

			const existing = normalizedNames[normalize(name)];

			const displayName = displayNames.get(name);

			if (existing) {
				printName(displayName, 'no', existing);
			} else {
				printName(displayName, 'yes');
			}

			checkedNames.add(name);
		}
	});
