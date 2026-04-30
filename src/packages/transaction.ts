import type { EventEmitter } from 'node:events';

export interface Transaction extends EventEmitter<{}> {}
