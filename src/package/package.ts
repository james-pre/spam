export interface PackageReference {
	id: number;
	name: string;
	relation: string;
	version: string;
	hash: number;
}

export interface Package {
	name: string;
	version: string;
	license?: string;
	url?: string;
	description?: string;
	author?: string;
	dependencies: PackageReference[];
	conflicts: PackageReference[];
	downloadSize?: bigint;
	installSize: bigint;
	reason?: string;
}
