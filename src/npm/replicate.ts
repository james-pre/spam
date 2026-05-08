import { join } from 'node:path';
import { apiRequest } from './api.js';
import { cacheDir } from '../cache.js';
import * as z from 'zod';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import * as io from 'ioium/node';
import { createInterface } from 'node:readline/promises';

const base = 'https://replicate.npmjs.com/';

const request: <T>(
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	href: string,
	body?: object,
	onWarning?: ((message: string) => void) | undefined
) => Promise<T> = apiRequest.bind<any>({
	base,
});

export interface Metadata {
	db_name: string;
	engine: string;
	doc_count: number;
	update_seq: number;
}

export async function getMetadata(): Promise<Metadata> {
	return await request<Metadata>('GET', '/');
}

/**
 * Supported query parameters for the _changes endpoint on replicate.npmjs.com
 */
export interface ChangesParams {
	since?: Seq;
	limit?: number;
	descending?: boolean;
	doc_ids?: string[];
}

export type Seq = number;

export interface Change {
	seq: Seq;
	id: string;
	changes?: { rev: string }[];
	deleted?: boolean;
}

export interface Changes {
	results: Change[];
	last_seq: Seq;
	pending?: number;
}

/**
 * Get all changes from the CouchDB changes feed.
 */
export async function* getChanges(params: ChangesParams = {}): AsyncGenerator<Change> {
	let since = params.since ?? 0;
	const limit = Math.min(params.limit ?? 1000, 10000);

	while (true) {
		const data = await request<Changes>('GET', '/_changes', { ...params, limit, since });

		if (!data.results?.length) break;

		yield* data.results;

		since = data.last_seq;

		if (data.results.length < limit) break;
	}
}

export interface AllDocsParams {
	start_key?: string;
	start_key_doc_id?: string;
	end_key?: string;
	end_key_doc_id?: string;
	key?: string;
	keys?: string[];
	limit?: number;
	descending?: boolean;
}

export interface AllDocsRow {
	id: string;
	key: string;
	value: {
		rev: string;
	};
}

export interface AllDocs {
	total_rows: number;
	offset: number;
	rows: AllDocsRow[];
}

/**
 * Paginate through all documents in the registry via _all_docs endpoint.
 */
export async function* getAll(params: AllDocsParams = {}): AsyncGenerator<AllDocsRow> {
	const limit = Math.min(params.limit ?? 1000, 10000);
	let inclusive_end = true,
		start_key = params.start_key;

	while (true) {
		const data = await request<AllDocs>('POST', '/_all_docs', { ...params, limit, inclusive_end, start_key });

		if (!data.rows?.length) break;

		yield* data.rows;

		if (data.rows.length < limit) break;

		const lastRow = data.rows[data.rows.length - 1];
		start_key = lastRow.key;
		inclusive_end = false;
	}
}

export const cachePath = join(cacheDir, 'npm_couchdb.json');

export interface CouchDBCache {
	doc_count: number;
	update_seq: number;
	// id -> rev
	entries: Record<string, string>;
}

export async function getCache(): Promise<CouchDBCache> {
	if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));

	using rl = createInterface(process.stdin, process.stdout);

	const ok = z
		.stringbool()
		.safeParse(await rl.question('Need to download full couchdb. This will take a while. Is this ok [y/N]: ')).data;

	rl.close();

	if (!ok) throw 'Aborted.';

	const { doc_count, update_seq } = await getMetadata();

	using _ = io.start('Downloading entries');

	const entries = Object.create(null);

	let rowIndex = 0;
	for await (const row of getAll({ limit: 10000 })) {
		entries[row.id] = row.value.rev;
		rowIndex++;
		if (rowIndex % 1000 === 0) io.progress(rowIndex, doc_count, Math.round((rowIndex / doc_count) * 100) + '%');
	}
	io.progress(rowIndex, doc_count);

	io.writeJSON(cachePath, { doc_count, update_seq, entries });
	return { doc_count, update_seq, entries };
}

/**
 * Remove the local cache file if it exists.
 * Returns true if removed, false if not present.
 */
export function removeCache(): boolean {
	if (existsSync(cachePath)) {
		unlinkSync(cachePath);
		return true;
	}
	return false;
}

/**
 * Apply incremental changes since the cached update_seq and update the local cache file.
 * For each change, prefer the rev from the change entry; fall back to fetching the packument
 * from registry.npmjs.org to obtain a rev if necessary.
 */
export async function update(): Promise<number> {
	const cache = await getCache();

	let applied = 0;
	const { update_seq, doc_count } = await getMetadata();

	const expectedChanged = update_seq - cache.update_seq;

	io.start('Downloading and applying changes');

	for await (const change of getChanges({ since: cache.update_seq })) {
		if (change.seq > update_seq) break;

		applied++;
		if (applied % 1000 === 0) io.progress(applied, expectedChanged, Math.round((applied / expectedChanged) * 100) + '%');

		if (change.deleted) {
			delete cache.entries[change.id];
			continue;
		}

		const rev = change.changes?.[0]?.rev as string | undefined;
		if (rev) {
			cache.entries[change.id] = rev;
			continue;
		}

		const doc = await apiRequest<{ _rev?: string }>('GET', `/${change.id}`).catch(() => null);

		if (doc?._rev) cache.entries[change.id] = doc._rev;
	}

	io.done();

	cache.doc_count = doc_count;
	cache.update_seq = update_seq;

	io.writeJSON(cachePath, cache);

	return applied;
}
