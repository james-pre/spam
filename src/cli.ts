import { program } from 'commander';
import $pkg from '../package.json' with { type: 'json' };
import * as io from 'ioium/node';

const spam = program.name($pkg.name).version($pkg.version).description($pkg.description).option('--debug', 'Enable debug mode');

spam.on('option:debug', debug => {
	io._setDebugOutput(debug);
	if (!debug) return;
});

export default spam;
