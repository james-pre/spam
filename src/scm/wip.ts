import { prettyDate } from 'ioium/node';
import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { promisify, styleText } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(path: string, ...args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync('git', ['-C', path, ...args], { encoding: 'utf8' });
		return stdout.trimEnd();
	} catch (error: any) {
		const lines: string[] = error.stderr?.trim().split('\n') ?? [];
		const rejection = lines.find(line => line.startsWith(' ! '));
		throw new Error(rejection?.trim() || lines.at(-1) || error.message);
	}
}

/** Remote WIP refs are mirrored locally under the same name. */
const namespace = 'refs/wip/';

const messagePrefix = 'spam wip from ';

export interface Ref {
	branch: string;
	commit: string;
	host?: string;
	date: Date;
}

export interface Status {
	path: string;
	/** Undefined when HEAD is detached */
	branch?: string;
	remote?: string;
	/** Number of uncommitted changes, including untracked files */
	changes: number;
	/** The WIP for the current branch */
	wip?: Ref;
	/** WIPs for other branches */
	others: Ref[];
}

export type State = 'clean' | 'local' | 'remote' | 'conflict';

export type Action = 'push' | 'pull' | 'sync';

export function getState(status: Status): State {
	if (status.changes && status.wip) return 'conflict';
	if (status.changes) return 'local';
	if (status.wip) return 'remote';
	return 'clean';
}

async function getRemote(path: string, branch?: string): Promise<string | undefined> {
	if (branch) {
		const upstream = await git(path, 'config', `branch.${branch}.remote`).catch(() => null);
		if (upstream) return upstream;
	}
	const remotes = (await git(path, 'remote')).split('\n').filter(Boolean);
	return remotes.includes('origin') ? 'origin' : remotes[0];
}

export async function getStatus(path: string): Promise<Status> {
	const branch = (await git(path, 'symbolic-ref', '--short', '-q', 'HEAD').catch(() => null)) || undefined;
	const remote = await getRemote(path, branch);

	if (remote) await git(path, 'fetch', '--quiet', '--prune', '--no-tags', remote, `+${namespace}*:${namespace}*`);

	const refs: Ref[] = [];
	const format = ['%(refname)', '%(objectname)', '%(contents:subject)', '%(committerdate:unix)'].join('%00');
	for (const line of (await git(path, 'for-each-ref', '--format=' + format, namespace)).split('\n')) {
		if (!line) continue;
		const [refName, commit, subject, timestamp] = line.split('\0');
		const host = subject.split(messagePrefix)[1];
		refs.push({ branch: refName.slice(namespace.length), commit, host, date: new Date(parseInt(timestamp) * 1000) });
	}

	const changes = (await git(path, 'status', '--porcelain')).split('\n').filter(Boolean).length;

	return {
		path,
		branch,
		remote,
		changes,
		wip: refs.find(ref => ref.branch == branch),
		others: refs.filter(ref => ref.branch != branch),
	};
}

export function formatRef(ref: Ref): string {
	return `WIP from ${ref.host ?? 'unknown host'} at ${prettyDate(ref.date)}`;
}

const stateColors = { clean: 'green', local: 'yellow', remote: 'blue', conflict: 'red' } as const;

export function formatStatus(status: Status): string {
	const state = getState(status);
	const changes = `${status.changes} uncommitted change${status.changes == 1 ? '' : 's'}`;

	let text = styleText(stateColors[state], state.padEnd(9));
	text += status.branch ? styleText('cyan', status.branch) : styleText('dim', '(detached)');
	if (status.changes) text += ' ' + changes;
	if (status.changes && status.wip) text += ',';
	if (status.wip) text += ' ' + formatRef(status.wip);
	if (!status.remote) text += styleText('dim', ' (no remote)');
	for (const other of status.others) text += styleText('dim', `\n    ${other.branch}: ${formatRef(other)}`);
	return text;
}

/**
 * Resolve what `action` does for a repository.
 * @returns The concrete action, or null when there is nothing to do
 */
export function resolveAction(status: Status, action: Action, force: boolean = false): 'push' | 'pull' | null {
	switch (action) {
		case 'push':
			if (!status.changes) return null;
			if (!status.branch) throw new Error('Not on a branch');
			if (!status.remote) throw new Error('No remote');
			if (status.wip && !force) throw new Error('A WIP already exists on the remote');
			return 'push';
		case 'pull':
			if (!status.wip) return null;
			if (status.changes) throw new Error('Uncommitted changes would be overwritten by the WIP');
			return 'pull';
		case 'sync':
			if (status.changes && status.wip) throw new Error('Both the remote WIP and uncommitted changes exist');
			if (status.wip) return 'pull';
			return resolveAction(status, 'push');
	}
}

/**
 * @returns The top level of the git repository containing `path`, if any
 */
export async function findRepo(path: string): Promise<string | null> {
	return await git(path, 'rev-parse', '--show-toplevel').catch(() => null);
}

export interface PushOptions {
	/** Keep the uncommitted changes in the working tree after pushing */
	keep?: boolean;
	/** Overwrite an existing remote WIP */
	force?: boolean;
}

/**
 * Move the uncommitted changes into the remote WIP ref for the current branch.
 */
export async function push(status: Status, options: PushOptions = {}): Promise<string> {
	const { path, branch, remote } = status;
	if (!branch || !remote) throw new Error('Can not push without a branch and remote');
	if (status.wip && !options.force) throw new Error('A WIP already exists on the remote');

	const ref = namespace + branch;
	const stashBefore = await git(path, 'rev-parse', '-q', '--verify', 'refs/stash').catch(() => null);
	await git(path, 'stash', 'push', '--quiet', '--include-untracked', '--message', messagePrefix + hostname());
	const commit = await git(path, 'rev-parse', '-q', '--verify', 'refs/stash').catch(() => null);
	if (!commit || commit == stashBefore) throw new Error('No changes could be stashed');

	try {
		await git(path, 'push', '--quiet', `--force-with-lease=${ref}:${status.wip?.commit ?? ''}`, remote, `${commit}:${ref}`);
	} catch (error) {
		await git(path, 'stash', 'pop', '--quiet', '--index');
		throw error;
	}

	await git(path, 'update-ref', ref, commit);
	await git(path, 'stash', options.keep ? 'pop' : 'drop', '--quiet', ...(options.keep ? ['--index'] : []));
	return styleText('green', `pushed ${status.changes} change${status.changes == 1 ? '' : 's'}`);
}

/**
 * Apply the remote WIP for the current branch to the working tree and remove it from the remote.
 */
export async function pull(status: Status): Promise<string> {
	const { path, branch, remote, wip } = status;
	if (!branch || !remote || !wip) throw new Error('Can not pull without a branch, remote, and WIP');

	const head = await git(path, 'rev-parse', 'HEAD');
	const base = await git(path, 'rev-parse', wip.commit + '^1');

	let notes = '';
	if (head != base) {
		const isBehind = await git(path, 'merge-base', '--is-ancestor', head, base).then(
			() => true,
			() => false
		);
		if (isBehind) {
			await git(path, 'merge', '--quiet', '--ff-only', base);
			notes += ', fast-forwarded to ' + base.slice(0, 7);
		} else notes += styleText('yellow', `, applied onto ${head.slice(0, 7)} instead of ${base.slice(0, 7)}`);
	}

	try {
		await git(path, 'stash', 'apply', '--quiet', wip.commit);
	} catch (error) {
		throw new Error(`Failed to apply WIP, it was left on the remote: ${error instanceof Error ? error.message : error}`);
	}

	try {
		await drop(status, wip);
	} catch (error) {
		notes += styleText('yellow', `, but the remote WIP could not be removed: ${error instanceof Error ? error.message : error}`);
	}

	return styleText('green', 'pulled ' + formatRef(wip)) + notes;
}

/**
 * Remove a WIP from the remote, unless it changed since `status` was fetched.
 */
export async function drop(status: Status, wip: Ref): Promise<void> {
	if (!status.remote) throw new Error('Can not drop without a remote');

	const ref = namespace + wip.branch;
	await git(status.path, 'push', '--quiet', `--force-with-lease=${ref}:${wip.commit}`, status.remote, ':' + ref);
	await git(status.path, 'update-ref', '-d', ref);
}
