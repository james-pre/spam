import * as io from 'ioium/node';
import { styleText } from 'node:util';
import { config } from '../config.js';
import { prettyPath } from './paths.js';
import type { SCM } from './repo.js';

export interface ScmOptions {
	args: Record<SCM, string[]>;
	opName?: string;
	opIng?: string;
	jobSuccess?: string;
	fullSuccess?: string;
	concurrency: number;
}

export async function runSCM(options: ScmOptions) {
	if (!config.repos.length) {
		io.warn('No repositories configured.');
		return;
	}

	options.opName ??= options.args.git[0];
	options.opIng ??= options.opName[0].toUpperCase() + options.opName.slice(1) + 'ing';

	console.log(options.opIng, styleText('blueBright', config.repos.length.toString()), 'repositories...');

	const { failed, noJobs } = await io.jobs.runCommands(
		{
			concurrency: options.concurrency,
			jobStartText: styleText('cyan', 'starting...'),
			parseLine(line: string) {
				if (line.startsWith('fatal:')) throw line.slice(6).trim();

				const percentMatch = line.match(/(\d+)%/);
				const percent = percentMatch ? percentMatch[1] : null;

				const countMatch = line.match(/\((\d+)\/(\d+)\)/);
				const count = countMatch ? `${countMatch[1]}/${countMatch[2]}` : null;

				let size: string | null = null;
				let rate: string | null = null;

				const parts = line.split('|').map(p => p.trim());
				if (parts[0]) {
					const sizeMatch = parts[0].match(/(\d+(?:\.\d+)?)\s+([KMG]i?B)/i);
					if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2]}`;
				}
				if (parts[1]) {
					const rateMatch = parts[1].match(/(\d+(?:\.\d+)?)\s+([KMG]i?B\/s)/i);
					if (rateMatch) rate = `${rateMatch[1]} ${rateMatch[2]}`;
				}

				let status = '';

				if (percent) status += percent.padStart(3, ' ') + '% ';
				if (size) status += size + ' ';
				if (rate) status += `@ ${rate} `;
				if (count) status += `(${count})`;

				return status || line;
			},
		},
		config.repos.map(repo => ({
			argv:
				repo.scm == 'git'
					? ['git', '-C', repo.path, ...options.args.git]
					: (() => {
							throw new Error('Unsupported SCM: ' + repo.scm);
						})(),
			name: prettyPath(repo.path),
		}))
	);

	if (noJobs) io.log('Nothing to do.');
	else if (failed) io.exit(`Failed to ${options.opName} ${failed} repositories.`);
	else console.log(styleText('green', options.fullSuccess ?? 'Complete!'));
}
