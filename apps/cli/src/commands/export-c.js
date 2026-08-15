import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportOD } from '@canopen-editor/core';
import { CliError } from '../lib/errors.js';
import { loadModel } from '../lib/io.js';
import { emitOk } from '../lib/format.js';

function register(program) {
    program
        .command('export-c')
        .description('export CANopenNode C source (OD.h / OD.c)')
        .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
        .option('-o, --output <dir>', 'output directory', '.')
        .option('--name <name>', 'base name for the generated files and header guards', 'OD')
        .option('-F, --format <fmt>', 'input format when not detectable from the extension (eds|xdd)')
        .option('--json', 'print a machine-readable result to stdout')
        .addHelpText('after', `
Examples:
  canopen export-c device.eds -o ./generated
  canopen export-c device.xdd --name MyOD`)
        .action(async (file, opts) => {
            const { model } = await loadModel(file, { format: opts.format });
            const { header, source } = exportOD(model, opts.name);
            const headerPath = join(opts.output, `${opts.name}.h`);
            const sourcePath = join(opts.output, `${opts.name}.c`);
            try {
                await writeFile(headerPath, header);
                await writeFile(sourcePath, source);
            } catch (err) {
                throw new CliError(`cannot write output: ${err.message}`);
            }
            if (opts.json) emitOk(file, [headerPath, sourcePath]);
            else console.log(`wrote ${headerPath}\nwrote ${sourcePath}`);
        });
}

export default register;
