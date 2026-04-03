// Utility types and functions for interacting with the npm API.

import { debug } from 'ioium/node';

const [today] = new Date().toISOString().split('T');

const dayBefore = (date: string) => {
	const [year, month, day] = date.split('-').map(Number);
	const [dayBefore] = new Date(year, month, day - 1).toISOString().split('T');
	return dayBefore;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export let diagnostics = {
	requests: 0,
	retries: 0,
};

export async function apiRequest<T>(this: { retry?: number } | void, href: string, onWarning?: (message: string) => void): Promise<T> {
	const url = new URL(href, 'https://api.npmjs.org/');
	debug('GET', url.href);
	const res = await fetch(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:1.0) npm-stats/1.0',
			Accept: 'application/json',
		},
	});

	let { retry = 0 } = this || {};
	if (res.status == 429 && retry < 5) {
		onWarning?.('Too many requests, waiting...');
		retry++;
		diagnostics.retries++;
		// Exponential backoff
		await wait(Math.pow(2, retry) * 1000);
		return await apiRequest.call<{ retry: number }, any[], Promise<T>>({ retry }, href, onWarning);
	}

	if (!res.ok) throw res.statusText;

	diagnostics.requests++;
	return await res.json();
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
	rates: {
		/** Average over the past week */
		day: number;
		/** Average over the past month */
		week: number;
		/** Average over the past three months */
		month: number;
	};
}

export async function getPackageDownloads(packageName: string, onWarning?: (message: string) => void): Promise<PackageDownloadInfo> {
	const downloadsBefore = (day: string) =>
		apiRequest<PackageDownloadInfo>(`/downloads/range/2015-01-10:${day}/${packageName}`, onWarning);

	const results = await downloadsBefore(today);
	results.total = 0;

	const todayIsZero = +(results.downloads.at(-1)?.day == today && results.downloads.at(-1)?.downloads == 0);

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

	function weightedAverage(span: number, window: number, weight: number): number {
		let weightedSum = 0,
			totalWeight = 0;
		for (let block = 0; block < window; block++) {
			let sum = 0,
				days = 0;
			for (let day = 1 + block * span; day <= (block + 1) * span; day++) {
				// if today is zero then stats probably haven't been loaded yet
				const entry = results.downloads.at(-(day + todayIsZero));
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

	results.rates = {
		day: weightedAverage(1, 7, 0.5),
		week: weightedAverage(7, 4, 0.5),
		month: weightedAverage(30, 3, 0.5),
	};

	return results;
}

export async function searchNpm(query: string): Promise<SearchResultEntry[]> {
	let lastResult: SearchResult;
	let results: SearchResultEntry[] = [];
	let from = 0;

	do {
		lastResult = await apiRequest<SearchResult>(`/search?text=${query}&size=250&from=${from}`);

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
