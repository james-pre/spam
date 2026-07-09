import { program } from 'commander';
import * as io from 'ioium/node';
import $pkg from '../../package.json' with { type: 'json' };
import { config, defaultConfigPath, loadConfig } from '../config.js';
import type { PackageManagerName } from '../package/manager.js';
import { formatPackage, formatPackageSummary } from '../package/package.js';
import { getSourceRepoPackages, shortSourceRepoString } from '../scm/repo.js';
import * as scm from '../scm/scm.js';
import { system } from '../system/scope.js';
import { getPackages } from '../scope.js';

const spam = program
	.name($pkg.name)
	.version($pkg.version)
	.description($pkg.description)
	.option('--debug', 'Enable debug mode')
	.option('-c, --config <path>', 'Path to config file', defaultConfigPath);

spam.hook('preAction', cmd => {
	const opts = cmd.opts();
	loadConfig(opts.config);
	io._setDebugOutput(opts.debug ?? false);
});

spam.command('pull')
	.description('Pull changes from all managed repositories')
	.action(async function spam_pull() {
		await scm.run({ concurrency: 4, args: { git: ['pull', '--progress'] } });
	});

spam.command('ls')
	.description('List packages and managed repositories')
	.option('-x, --no-summary', 'Actually list out every package instead of a summary')
	.option('-m, --manager <pm...>', 'Filter by package manager')
	.option('-s, --scope <type...>', 'Filter by scope type')
	.option('-q, --quiet', 'Hide some output, e.g. manager failures')
	.action(async function (options) {
		if (!options.scope || options.scope.includes('local'))
			for (const repo of config.repos) {
				const [scm, path] = shortSourceRepoString(repo);

				const pkgs = getSourceRepoPackages(repo);

				if (options.manager && !pkgs.some(pkg => options.manager?.includes(pkg.from))) continue;

				if (options.summary) {
					console.log(scm, path + ':', formatPackageSummary(pkgs, options.manager as PackageManagerName[]));
				} else {
					console.log(scm, path + ':');
					for (const pkg of pkgs) if (!options.manager || options.manager.includes(pkg.from)) console.log(formatPackage(pkg));
				}
			}

		const globalPkgs = await Array.fromAsync(
			getPackages(system, {
				onManagerFail(manager, err) {
					if (options.quiet) return;
					io.warn(manager, 'failed:', err);
				},
			})
		);

		if (options.summary) {
			console.log('<global>:', formatPackageSummary(globalPkgs, options.manager as PackageManagerName[]));
		} else {
			console.log('<global>:');
			for (const pkg of globalPkgs) if (!options.manager || options.manager.includes(pkg.from)) console.log(formatPackage(pkg));
		}
	});

export default spam;
