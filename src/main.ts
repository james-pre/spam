#!/usr/bin/env node

import spam from './cli.js';
import './npm/cli.js';
import './git/cli.js';

await spam.parseAsync();
