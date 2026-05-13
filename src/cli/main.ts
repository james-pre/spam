#!/usr/bin/env -S node --experimental-addon-modules

import spam from './common.js';
import './npm.js';
import './scm.js';
import { done, exit } from 'ioium/node';

try {
	await spam.parseAsync();
} catch (e) {
	if (typeof e == 'number') process.exit(e);
	done(true);
	exit(e);
}
