#!/usr/bin/env node

import spam from './cli.js';
import './npm/cli.js';
import './scm/cli.js';

await spam.parseAsync();
