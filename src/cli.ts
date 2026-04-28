import { program } from 'commander';
import $pkg from '../package.json' with { type: 'json' };
import * as io from 'ioium/node';
import { runGit } from './git/git.js';
import { defaultConfigPath, loadConfig } from './config.js';

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
		await runGit({ concurrency: 4, args: ['pull', '--progress'] });
	});

export default spam;
