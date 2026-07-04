export function processHasUid(id: number): boolean {
	return process.getuid?.() === id || process.geteuid?.() === id;
}

export function processHasGid(id: number): boolean {
	return process.getgid?.() === id || process.getegid?.() === id;
}

export function isRoot(): boolean {
	return process.getuid?.() === 0 || process.geteuid?.() === 0 || process.getgid?.() === 0 || process.getegid?.() === 0;
}
