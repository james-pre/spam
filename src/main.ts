#!/usr/bin/env -S node --experimental-addon-modules

import spam from './cli.js';
import './npm/cli.js';
import './scm/cli.js';
import { done, exit } from 'ioium/node';

try {
	await spam.parseAsync();
} catch (e) {
	if (typeof e == 'number') process.exit(e);
	done(true);
	exit(e);
}
