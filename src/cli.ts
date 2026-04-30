import { program } from 'commander';
import * as io from 'ioium/node';
import $pkg from '../package.json' with { type: 'json' };
import { config, defaultConfigPath, loadConfig } from './config.js';
import { formatDep, formatDepSummary } from './dependency.js';
import { getSourceRepoDependencies, shortSourceRepoString } from './scm/repo.js';
import { runSCM } from './scm/scm.js';
import { getGlobalDependencies } from './system/deps.js';

const spam = program
	.name($pkg.name)
	.version($pkg.version)
	.description($pkg.description)
	.option('--debug', 'Enable debug mode')
	.option('-c, --config <path>', 'Path to config file', defaultConfigPath);

spam.hook('preAction', () => {
	loadConfig(spam.opts().config);
});

spam.on('option:debug', debug => {
	io._setDebugOutput(debug);
	if (!debug) return;
});

spam.command('pull')
	.description('Pull changes from all managed repositories')
	.action(async function spam_pull() {
		await runSCM({ concurrency: 4, args: { git: ['pull', '--progress'] } });
	});

spam.command('ls')
	.description('List packages and managed repositories')
	.option('-x, --no-summary', 'Actually list out every package instead of a summary')
	.action(async function (options) {
		for (const repo of config.repos) {
			const [scm, path] = shortSourceRepoString(repo);

			const deps = getSourceRepoDependencies(repo);

			if (options.summary) {
				console.log(scm, path + ':', formatDepSummary(deps));
			} else {
				console.log(scm, path + ':');
				for (const dep of deps) console.log(formatDep(dep));
			}
		}

		const globalDeps = await Array.fromAsync(getGlobalDependencies());

		if (options.summary) {
			console.log('<global>:', formatDepSummary(globalDeps));
		} else {
			console.log('<global>:');
			for (const dep of globalDeps) console.log(formatDep(dep));
		}
	});

export default spam;
