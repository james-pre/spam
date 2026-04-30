import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { basename, resolve } from 'node:path';
import { styleText } from 'node:util';
import spam from '../cli.js';
import { config, saveConfig } from '../config.js';
import { prettyPath, resolvePaths } from './paths.js';
import { runSCM } from './scm.js';
import { formatSourceRepo, resolveSourceRepos, shortSourceRepoString, type SCMPackageManager } from './repo.js';

const scm = spam
	.command('scm')
	.description('Source Control Management')
	.option(
		'-n, --concurrency <n>',
		'Number of operations to run concurrently',
		value => {
			const parsed = parseInt(value, 10);
			if (!Number.isSafeInteger(parsed) || parsed < 1) return 4;
			return parsed;
		},
		4
	);

scm.command('info')
	.description('Show information about managed repositories')
	.argument('<repos...>', 'Repo names or paths')
	.action(function spam_git_info(repos) {
		for (const repo of resolveSourceRepos(repos)) {
			console.log(formatSourceRepo(repo));
		}
	});

scm.command('pull')
	.description('Pull changes from all managed repositories')
	.action(async function spam_pull() {
		const { concurrency } = this.optsWithGlobals();
		await runSCM({ concurrency, args: { git: ['pull', '--progress'] } });
	});

scm.command('fetch')
	.description('Fetch changes from all managed repositories')
	.action(async function spam_git_fetch() {
		const { concurrency } = this.optsWithGlobals();
		await runSCM({ concurrency, args: { git: ['fetch', '--all', '--progress'] } });
	});

scm.command('add')
	.argument('<paths...>', 'Paths to add')
	.option('-r, --recursive', 'Recursively add directories')
	.description('Add repositories')
	.action(function spam_git_add(paths: string[]) {
		const opts = this.optsWithGlobals();
		for (const path of resolvePaths(paths, opts.recursive)) {
			if (config.repos.some(repo => repo.path === path)) {
				io.warn('Already added:', path);
				continue;
			}

			let dir;
			try {
				dir = fs.readdirSync(path);
			} catch (e) {
				io.error(e);
				continue;
			}

			if (!dir.includes('.git')) {
				io.error('Not a git repository:', path);
				continue;
			}

			const packages: SCMPackageManager[] = [];

			if (dir.includes('package.json')) packages.push('npm');
			if (dir.includes('yarn.lock')) packages.push('yarn');

			config.repos.push({ path: resolve(path), scm: 'git', packageManagers: packages, name: basename(path) });
			console.log(styleText('green', '+ ' + prettyPath(path)));
		}
		saveConfig(opts.config);
	});

scm.command('list')
	.alias('ls')
	.description('List all managed repositories')
	.action(() => {
		for (const repo of config.repos) console.log(...shortSourceRepoString(repo));
	});

scm.command('remove')
	.alias('rm')
	.option('-m, --missing', 'Remove repositories that no longer exist locally')
	.option('-r, --recursive', 'Recursively remove directories')
	.argument('[paths...]', 'Paths to remove')
	.description('Remove repositories')
	.action(function spam_git_rm(paths: string[]) {
		const opts = this.optsWithGlobals();
		for (const repo of resolveSourceRepos(paths, opts.recursive)) {
			const index = config.repos.indexOf(repo);
			if (index === -1) io.exit('Bug! Could not resolve repo index');
			config.repos.splice(index, 1);
			console.log(styleText('red', '- ' + prettyPath(repo.path)));
		}
		for (let i = 0; i < config.repos.length; i++) {
			if (!opts.missing) break;
			const { path: dir } = config.repos[i];
			if (fs.existsSync(dir)) continue;
			config.repos.splice(i, 1);
			console.log(styleText('red', '- ' + prettyPath(dir) + ' (missing)'));
			i--;
		}
		saveConfig(opts.config);
	});
