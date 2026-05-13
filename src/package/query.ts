import type { QueryCmp } from 'libdnf';
export type { QueryCmp };

export type QueryFilterFlags =
	| 'available'
	| 'downgradable'
	| 'downgrades'
	| 'duplicates'
	| 'installed'
	| 'installonly'
	| 'leaves'
	| 'leaves_groups'
	| 'priority'
	| 'reboot_suggested'
	| 'recent'
	| 'unneeded'
	| 'upgradable'
	| 'upgrades'
	| 'userinstalled'
	| 'versionlock';

type ValuedKeys =
	| 'arch'
	| 'conflicts'
	| 'description'
	| 'enhances'
	| 'epoch'
	| 'file'
	| 'from_repo_id'
	| 'location'
	| 'name'
	| 'obsoletes'
	| 'provides'
	| 'recommends'
	| 'release'
	| 'repo_id'
	| 'requires'
	| 'suggests'
	| 'summary'
	| 'supplements'
	| 'url'
	| 'version';

export type QueryFilter =
	| QueryFilterFlags
	| [ValuedKeys, QueryCmp, value: string | string[]]
	| ['recent', timestamp?: number | bigint | Date]
	| ['advisories', ...[filter: 'name' | 'packages' | 'reference' | 'severity' | 'type', QueryCmp, value: string | string[]][]];
