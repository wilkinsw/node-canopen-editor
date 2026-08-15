import { access } from 'node:fs/promises';
import { createEmptyEds } from '@canopen-editor/core';
import { CliError } from '../lib/errors.js';
import { saveModel, detectFormat } from '../lib/io.js';
import { emitOk } from '../lib/format.js';

function register(program) {
    program
        .command('new')
        .description('create a new, empty device description file')
        .argument('<file>', "output path ('-' = stdout; requires --format)")
        .option('--product-name <name>', 'initial product name', 'New Device')
        .option('-F, --format <fmt>', 'output format when not detectable from the extension (eds|xdd)')
        .option('--force', 'overwrite an existing file')
        .option('--json', 'print a machine-readable result to stdout')
        .addHelpText('after', `
Examples:
  canopen new device.eds
  canopen new device.xdd --product-name "My Device"`)
        .action(async (file, opts) => {
            if (file !== '-' && !opts.force) {
                const exists = await access(file).then(() => true, () => false);
                if (exists) throw new CliError(`'${file}' already exists (use --force to overwrite)`);
            }
            const model = createEmptyEds(opts.productName);
            await saveModel(model, file, { format: opts.format });
            if (opts.json) emitOk(file, ['created']);
            else if (file !== '-') console.log(`created ${file} (${detectFormat(file) ?? opts.format})`);
        });
}

export default register;
