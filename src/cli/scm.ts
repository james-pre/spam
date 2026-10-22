import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { basename, resolve } from 'node:path';
import { styleText } from 'node:util';
import { config, saveConfig } from '../config.js';
import type { PackageManagerName } from '../package/manager.js';
import { prettyPath, resolvePaths } from '../scm/paths.js';
import { formatSourceRepo, resolveSourceRepos, shortSourceRepoString } from '../scm/repo.js';
import { run as runSCM } from '../scm/scm.js';
import * as wip from '../scm/wip.js';
import spam from './common.js';

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

			const packages: PackageManagerName[] = [];

			if (dir.includes('package.json')) packages.push('npm');
			// if (dir.includes('yarn.lock')) packages.push('yarn');

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

const wip_cli = scm.command('wip').description('Hand off uncommitted changes between devices using WIP refs');

wip_cli
	.command('list')
	.alias('ls')
	.description('List WIP refs and uncommitted changes of all managed repositories')
	.action(async function spam_scm_wip_list() {
		const { concurrency } = this.optsWithGlobals();
		const { noJobs } = await io.jobs.runWithData(
			{
				concurrency,
				name: repo => prettyPath(repo.path),
				async run(repo) {
					return { status: 'succeeded', text: wip.formatStatus(await wip.getStatus(repo.path)) };
				},
			},
			config.repos
		);
		if (noJobs) io.warn('No repositories configured.');
	});

wip_cli
	.command('drop')
	.description('Remove the remote WIP ref of the current git repository without applying it')
	.argument('[branch]', 'Branch of the WIP to drop, defaults to the current branch')
	.action(async function spam_scm_wip_drop(branch?: string) {
		const path = await wip.findRepo(process.cwd());
		if (!path) io.exit('Not in a git repository.');

		const status = await wip.getStatus(path);
		branch ??= status.branch;
		if (!branch) io.exit('Not on a branch, specify one.');

		const ref = [status.wip, ...status.others].find(ref => ref?.branch == branch);
		if (!ref) return console.log('Nothing to do.');

		await io.assertYes(`Drop ${wip.formatRef(ref)} on ${branch}? It can not be recovered.`);
		await wip.drop(status, ref);
		console.log(styleText('green', 'Dropped ' + wip.formatRef(ref)));
	});

async function runWipAction(status: wip.Status, action: 'push' | 'pull', options: wip.PushOptions): Promise<string> {
	return action == 'push' ? await wip.push(status, options) : await wip.pull(status);
}

async function wipRepo(path: string, action: wip.Action, options: wip.PushOptions) {
	const status = await wip.getStatus(path);
	const resolved = wip.resolveAction(status, action, options.force);
	if (!resolved) {
		console.log('Nothing to do.');
		return;
	}
	console.log(await runWipAction(status, resolved, options));
}

async function wipAll(action: wip.Action, options: wip.PushOptions & { concurrency: number }) {
	const planned = new Map<string, [wip.Status, 'push' | 'pull']>();
	let problems = 0;

	console.log('Checking', styleText('blueBright', config.repos.length.toString()), 'repositories...');
	const { noJobs } = await io.jobs.runWithData(
		{
			concurrency: options.concurrency,
			name: repo => prettyPath(repo.path),
			async run(repo) {
				const status = await wip.getStatus(repo.path).catch(error => {
					problems++;
					throw error;
				});
				const text = wip.formatStatus(status);
				try {
					const resolved = wip.resolveAction(status, action, options.force);
					if (!resolved) return { status: 'succeeded', text };
					planned.set(repo.path, [status, resolved]);
					return { status: 'succeeded', text: text + styleText('bold', ' → ' + resolved) };
				} catch (error) {
					problems++;
					return { status: 'succeeded', text: text + styleText('red', ' → ' + io.errorText(error)) };
				}
			},
		},
		config.repos
	);

	if (noJobs) return io.warn('No repositories configured.');
	if (problems) io.warn(`Skipping ${problems} repositories that need attention.`);
	if (!planned.size) {
		if (problems) io.exit('Nothing else to do.');
		return console.log('Nothing to do.');
	}

	await io.assertYes(`${action[0].toUpperCase() + action.slice(1)} ${planned.size} repositories?`);

	const ordered = config.repos.map(repo => planned.get(repo.path)).filter(entry => !!entry);
	const { failed } = await io.jobs.runWithData(
		{
			concurrency: options.concurrency,
			name: ([status]) => prettyPath(status.path),
			run: ([status, resolved]) => runWipAction(status, resolved, options).then(text => ({ status: 'succeeded', text })),
		},
		ordered
	);

	if (failed) io.exit(`Failed to ${action} ${failed} repositories.`);
	if (problems) io.exit(`Skipped ${problems} repositories that need attention.`);
	console.log(styleText('green', 'Complete!'));
}

const wipDescriptions = {
	push: 'Move uncommitted changes to the remote WIP ref',
	pull: 'Apply the remote WIP ref and remove it from the remote',
	sync: 'Push or pull the WIP ref, depending on which side has changes',
} satisfies Record<wip.Action, string>;

for (const [action, description] of Object.entries(wipDescriptions) as [wip.Action, string][]) {
	const command = wip_cli
		.command(action)
		.description(description + '. Applies to all managed repositories when not run in a git repository.')
		.option('-a, --all', 'Use all managed repositories, even when run in a git repository');

	if (action == 'push')
		command.option('-k, --keep', 'Keep the changes in the working tree').option('-f, --force', 'Overwrite an existing remote WIP');

	command.action(async function spam_scm_wip() {
		const options = this.optsWithGlobals() as wip.PushOptions & { all?: boolean; concurrency: number };
		const path = options.all ? null : await wip.findRepo(process.cwd());
		if (!path) return await wipAll(action, options);
		await wipRepo(path, action, options);
	});
}
