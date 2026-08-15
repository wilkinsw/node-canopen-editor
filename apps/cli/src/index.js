/**
 * `canopen` — command-line editor for CANopen EDS/XDD device descriptions.
 *
 * Program assembly: registers every command module and maps errors to the
 * exit-code convention in lib/errors.js.
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { CliError, fail } from './lib/errors.js';
import registerNew from './commands/new.js';
import registerInfo from './commands/info.js';
import registerConvert from './commands/convert.js';
import registerExportC from './commands/export-c.js';
import registerDevice from './commands/device.js';
import registerObject from './commands/object.js';
import registerSub from './commands/sub.js';
import registerPdo from './commands/pdo.js';
import registerValidate from './commands/validate.js';
import registerDocs from './commands/docs.js';

const require = createRequire(import.meta.url);
const { version, description } = require('../package.json');

const program = new Command();

program
    .name('canopen')
    .description(description)
    .version(version)
    .addHelpText('after', `
Files may be .eds or .xdd (detected by extension); '-' reads stdin / writes
stdout and requires -F/--format. Mutating commands edit the file in place
unless -o/--output redirects. Run 'canopen docs' for the full manual.

Examples:
  canopen new device.eds --product-name "My Device"
  canopen object add device.eds 0x2000 --type record --name "Motor Params"
  canopen pdo map device.eds tx 1 0x2000.1
  canopen export-c device.eds -o ./generated`);

program.exitOverride();
program.configureOutput({ outputError: (str) => process.stderr.write(str) });

const registrars = [
    registerNew,
    registerInfo,
    registerConvert,
    registerExportC,
    registerDevice,
    registerObject,
    registerSub,
    registerPdo,
    registerValidate,
    registerDocs,
];
for (const mod of registrars) mod(program);

try {
    await program.parseAsync(process.argv);
} catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('commander.')) {
        process.exit(err.exitCode === 0 ? 0 : 2);
    }
    if (err instanceof CliError) fail(err.message, err.exitCode);
    fail(err?.message ?? String(err));
}
