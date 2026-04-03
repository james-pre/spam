import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import spam from '../cli.js';
import { config, defaultConfigPath, loadConfig, saveConfig } from './config.js';
import { runGit } from './git.js';
import { prettyPath, resolvePaths } from './utils.js';

const cli = spam
	.command('git')
	.option('-c, --config <path>', 'Path to config file', defaultConfigPath)
	.option(
		'-n, --concurrency <n>',
		'Number of pulls to run concurrently',
		value => {
			const parsed = parseInt(value, 10);
			if (!Number.isSafeInteger(parsed) || parsed < 1) return 4;
			return parsed;
		},
		4
	)
	.option('-r, --recursive', 'Recursively add/remove directories');

cli.hook('preAction', () => {
	loadConfig(cli.opts().config);
});

cli.command('list')
	.alias('ls')
	.description('List all managed repositories')
	.action(() => {
		for (const dir of config.dirs) {
			console.log(prettyPath(dir));
		}
	});

cli.command('add')
	.argument('<paths...>', 'Paths to add')
	.description('Add repositories')
	.action(function spam_git_add(paths: string[]) {
		const opts = this.optsWithGlobals();
		for (const path of resolvePaths(paths, opts.recursive)) {
			if (config.dirs.includes(path)) {
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
			config.dirs.push(resolve(path));
			console.log(styleText('green', '+ ' + prettyPath(path)));
		}
		saveConfig(opts.config);
	});

cli.command('remove')
	.alias('rm')
	.option('-m, --missing', 'Remove repositories that no longer exist locally')
	.argument('<paths...>', 'Paths to remove')
	.description('Remove repositories')
	.action(function spam_git_rm(paths: string[]) {
		const opts = this.optsWithGlobals();
		for (const path of resolvePaths(paths, opts.recursive)) {
			const index = config.dirs.indexOf(path);
			if (index === -1) {
				io.warn('Ignored missing repo:', path);
				continue;
			}
			config.dirs.splice(index, 1);
			console.log(styleText('red', '- ' + prettyPath(path)));
		}
		for (let i = 0; i < config.dirs.length; i++) {
			if (!opts.missing) break;
			const dir = config.dirs[i];
			if (fs.existsSync(dir)) continue;
			config.dirs.splice(i, 1);
			console.log(styleText('red', '- ' + prettyPath(dir) + ' (missing)'));
			i--;
		}
		saveConfig(opts.config);
	});

cli.command('pull')
	.description('Same as the respective git commands on all repos')
	.action(async function spam_git_pull() {
		const { concurrency } = this.optsWithGlobals();
		await runGit({ concurrency, args: ['pull', '--progress'] });
	});

cli.command('fetch')
	.description('Same as the respective git commands on all repos')
	.action(async function spam_git_fetch() {
		const { concurrency } = this.optsWithGlobals();
		await runGit({ concurrency, args: ['fetch', '--all', '--progress'] });
	});
