import * as io from 'ioium/node';
import { createWriteStream } from 'node:fs';
import spam from '../cli.js';
import { createGraph } from './deps.js';
import { PackageLock } from './lock.js';
import { styleText } from 'node:util';
import * as api from './api.js';
import * as fs from 'node:fs';

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

		for (const name of opts.package) {
			const start = performance.now();
			let info: api.PackageDownloadInfo;
			try {
				info = await api.getPackageDownloads(name, onWarning);
			} catch (e) {
				console.error(
					styleText('redBright', `Error fetching data for package "${name}": ${opts.verbose && e instanceof Error ? e.stack : e}`)
				);
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

cli.command('check-name')
	.argument('[names...]', 'Names to check')
	.option('-f, --file <path...>', 'Path to a file containing npm package names')
	.option('-i, --ignore <status...>', 'Status to ignore', [] as string[])
	.option('--print-only <status>', 'Print only names with the specified status')
	.option('--debug', 'Enable debug output')
	.action(async (names, options) => {
		const displayNames = new Map();
		let maxNameLength = 0;

		for (const [i, name] of names.entries()) {
			displayNames.set(name.toLowerCase(), name);
			names[i] = name.toLowerCase();
			maxNameLength = Math.max(name.length, maxNameLength);
		}

		for (const path of options.file || []) {
			if (!fs.existsSync(path)) {
				console.error('Input file does not exist: ' + path);
				process.exit();
			}

			const contents = fs.readFileSync(path, { encoding: 'utf8' });
			const _names = contents.replaceAll('\n', ',').replaceAll(/\s/g, '').split(',');
			for (const name of _names) {
				displayNames.set(name.toLowerCase(), name);
				names.push(name.toLowerCase());
				maxNameLength = Math.max(name.length, maxNameLength);
			}
		}
		names.sort();

		const statusStyles = {
			error: 'redBright',
			yes: 'green',
			no: 'yellow',
			duplicate: 'magenta',
			unknown: 'cyan',
		} as const;

		type Status = keyof typeof statusStyles;

		const duplicateNames = names.length - displayNames.size;

		function printName(name: string, status: Status, statusCode?: number) {
			if (options.ignore.includes(status) || (options.printOnly && options.printOnly != status)) {
				return;
			}

			console.log(
				options.printOnly
					? name
					: `${styleText('blueBright', name.padEnd(maxNameLength))}: ${styleText(statusStyles[status], status)} ${options.debug && statusCode ? `(${statusCode})` : ''}`
			);
		}

		let checkedNames = new Set();
		if (!options.printOnly) {
			console.log(
				`Checking availability of ${styleText('blueBright', names.length.toString())} names${duplicateNames > 0 ? ` (${styleText('blueBright', duplicateNames.toString())} duplicates) ` : ''}...`
			);
		}
		for (const name of names) {
			if (checkedNames.has(name)) {
				printName(displayNames.get(name), 'duplicate');
				continue;
			}

			try {
				const res = await fetch('https://registry.npmjs.com/' + name);

				if (checkedNames.has(name)) {
					printName(displayNames.get(name), 'duplicate');
					continue;
				}
				const status: Status = res.status == 404 ? 'yes' : res.status == 200 ? 'no' : 'unknown';
				printName(displayNames.get(name), status, res.status);

				checkedNames.add(name);
			} catch (err) {
				if (checkedNames.has(name)) {
					printName(displayNames.get(name), 'duplicate');
					continue;
				}
				printName(displayNames.get(name), 'error');
			}

			if (checkedNames.size == displayNames.size) process.exit();
		}
	});
