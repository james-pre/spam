// Utility types and functions for interacting with the npm API.

import { debug } from 'ioium/node';

const [today] = new Date().toISOString().split('T');

const dayBefore = (date: string) => {
	const [year, month, day] = date.split('-').map(Number);
	const [dayBefore] = new Date(year, month - 1, day - 1).toISOString().split('T');
	return dayBefore;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const scopedPackageName = /^@[-\w.]+\/[-\w.]+$/;

export let diagnostics = {
	requests: 0,
	retries: 0,
};

export async function apiRequest<T>(
	this: { retry?: number; base?: string } | void,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE',
	href: string,
	body?: object,
	onWarning?: (message: string) => void
): Promise<T> {
	const url = new URL(href, this?.base || 'https://api.npmjs.org/');
	debug(method, url.href);
	if (method == 'GET' && body) for (const [key, value] of Object.entries(body)) url.searchParams.set(key, JSON.stringify(value));

	const res = await fetch(url, {
		method,
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:1.0) spam/1.0',
			Accept: 'application/json',
		},
		body: typeof body == 'undefined' || method == 'GET' ? undefined : JSON.stringify(body),
	});

	let { retry = 0 } = this || {};
	if (res.status == 429 && retry < 5) {
		onWarning?.('Too many requests, waiting...');
		retry++;
		diagnostics.retries++;
		// Exponential backoff
		await wait(Math.pow(2, retry) * 1000);
		return await apiRequest.call<{ retry: number }, any[], Promise<T>>({ retry }, method, href, onWarning);
	}

	if (!res.ok) throw res.statusText;

	diagnostics.requests++;
	return await res.json();
}

function downloadsWeightedAverage(info: PackageDownloadInfo, span: number, window: number, weight: number): number {
	const latest = info.downloads.at(-1);
	const latestIsZero = latest?.day == today && latest?.downloads == 0;

	let weightedSum = 0,
		totalWeight = 0;
	for (let block = 0; block < window; block++) {
		let sum = 0,
			days = 0;
		for (let day = 1 + block * span; day <= (block + 1) * span; day++) {
			// if latest day is zero then stats probably haven't been loaded yet
			const entry = info.downloads.at(-(day + +latestIsZero));
			if (!entry) break;
			sum += entry.downloads;
			days++;
		}

		if (!days) break;

		const w = Math.pow(weight, block);
		weightedSum += (days < span ? (sum * span) / days : sum) * w;
		totalWeight += w;
	}

	return Math.round(totalWeight ? weightedSum / totalWeight : 0);
}

export interface PackageDownloadRates {
	/** Average over the past week */
	day: number;
	/** Average over the past month */
	week: number;
	/** Average over the past three months */
	month: number;
}

function computeDownloadRates(info: PackageDownloadInfo): PackageDownloadRates {
	return {
		day: downloadsWeightedAverage(info, 1, 7, 0.5),
		week: downloadsWeightedAverage(info, 7, 4, 0.5),
		month: downloadsWeightedAverage(info, 30, 3, 0.5),
	};
}

export interface PackageDownloadInfo {
	// from API
	package: string;
	start: string;
	end: string;
	downloads: {
		day: string;
		downloads: number;
	}[];
	// computed
	total: number;
	/** Weighted average download rates */
	rates: PackageDownloadRates;
}

export async function getPackageDownloads(packageName: string, onWarning?: (message: string) => void): Promise<PackageDownloadInfo> {
	const downloadsBefore = (day: string) =>
		apiRequest<PackageDownloadInfo>('GET', `/downloads/range/2015-01-10:${day}/${packageName}`, undefined, onWarning);

	const results = await downloadsBefore(today);
	results.total = 0;

	for (const dl of results.downloads) {
		results.total += dl.downloads;
	}

	while (results.start != '2015-01-10') {
		const { downloads, start } = await downloadsBefore(dayBefore(results.start));
		if (downloads.every(d => !d.downloads)) break;
		results.start = start;
		for (const dl of downloads) {
			results.downloads.push(dl);
			results.total += dl.downloads;
		}
	}

	results.downloads.sort((a, b) => a.day.localeCompare(b.day));
	results.start = results.downloads.find(d => d.downloads != 0)!.day;

	results.rates = computeDownloadRates(results);

	return results;
}

export interface BulkPackageDownloadInfo {
	packages: Record<string, PackageDownloadInfo>;
	rates: PackageDownloadRates;
	total: number;
}

export async function getPackageDownloadsBulk(
	packageNames: string[],
	onWarning?: (message: string) => void
): Promise<BulkPackageDownloadInfo> {
	const badNames = packageNames.filter(n => scopedPackageName.test(n));
	if (badNames.length) throw new Error('Bulk download count queries are not supported for scoped packages: ' + badNames.join(', '));

	const remainingNames = new Set(packageNames);

	let [year, month, day] = today.split('-').map(Number);
	month--; // Date() uses 0-indexed

	async function nextDownloads(): Promise<Record<string, PackageDownloadInfo>> {
		const [start] = new Date(year - 1, month, day + 1).toISOString().split('T');
		const [end] = new Date(year, month, day).toISOString().split('T');
		const result = await apiRequest<Record<string, PackageDownloadInfo>>(
			'GET',
			`/downloads/range/${start}:${end}/${Array.from(remainingNames).join(',')}`,
			onWarning
		);
		year--;
		return result;
	}

	const result: BulkPackageDownloadInfo = {
		packages: {},
		rates: { day: 0, week: 0, month: 0 },
		total: 0,
	};

	const bulk = await nextDownloads();

	for (const [name, data] of Object.entries(bulk)) {
		if (!data) {
			remainingNames.delete(name);
			continue;
		}

		data.total = 0;
		for (const dl of data.downloads) {
			data.total += dl.downloads;
			result.total += dl.downloads;
		}
		result.packages[name] = data;
	}

	while (remainingNames.size) {
		for (const [name, data] of Object.entries(await nextDownloads())) {
			if (!data) {
				remainingNames.delete(name);
				continue;
			}

			const pkg = result.packages[name];
			const { downloads, start } = data;
			if (downloads.every(d => !d.downloads)) {
				remainingNames.delete(name);
				continue;
			}

			pkg.start = start;
			for (const dl of downloads) {
				pkg.downloads.push(dl);
				pkg.total += dl.downloads;
				result.total += dl.downloads;
			}

			if (start == '2015-01-10') remainingNames.delete(name);
		}
	}

	for (const data of Object.values(result.packages)) {
		data.downloads.sort((a, b) => a.day.localeCompare(b.day));
		data.start = data.downloads.find(d => d.downloads != 0)!.day;
		data.rates = computeDownloadRates(data);
		result.rates.day += data.rates.day;
		result.rates.week += data.rates.week;
		result.rates.month += data.rates.month;
	}

	return result;
}

export async function searchNpm(query: string): Promise<SearchResultEntry[]> {
	let lastResult: SearchResult;
	let results: SearchResultEntry[] = [];
	let from = 0;

	do {
		lastResult = await apiRequest<SearchResult>('GET', `/search?text=${query}&size=250&from=${from}`);

		results.push(...lastResult.objects);

		from += 250;
	} while (lastResult.total == 250);

	return results;
}

export interface SearchResult {
	objects: SearchResultEntry[];
	total: number;
	time: string;
}

export interface SearchResultEntry {
	downloads: {
		monthly: number;
		weekly: number;
	};
	dependents: any;
	updated: string;
	searchScore: number;
	package: PackageInfo;
	score: {
		final: number;
		detail: {
			popularity: number;
			quality: number;
			maintenance: number;
		};
	};
	flags: {
		insecure: number;
	};
}

export interface PackageInfo {
	_rev: string;
	name: string;
	keywords: string[];
	version: string;
	description?: string;
	sanitized_name: string;
	publisher: UserInfo;
	maintainers: UserInfo[];
	license?: string;
	date: string;
	links: {
		homepage?: string;
		repository?: string;
		bugs?: string;
		npm: string;
	};
}

export interface UserInfo {
	email: string;
	username: string;
}
