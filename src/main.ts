#!/usr/bin/env -S node --experimental-addon-modules

import spam from './cli.js';
import './npm/cli.js';
import './scm/cli.js';

await spam.parseAsync();
