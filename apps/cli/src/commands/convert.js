import { loadModel, saveModel, detectFormat } from '../lib/io.js';
import { CliError } from '../lib/errors.js';
import { emitOk } from '../lib/format.js';

function register(program) {
    program
        .command('convert')
        .description('convert between EDS and XDD formats')
        .argument('<input>', "input file ('-' = stdin)")
        .argument('<output>', "output file ('-' = stdout)")
        .option('--from <fmt>', 'input format when not detectable from the extension (eds|xdd)')
        .option('--to <fmt>', 'output format when not detectable from the extension (eds|xdd)')
        .option('--json', 'print a machine-readable result to stdout')
        .addHelpText('after', `
Examples:
  canopen convert device.eds device.xdd
  cat device.eds | canopen convert - - --from eds --to xdd`)
        .action(async (input, output, opts) => {
            const { model } = await loadModel(input, { format: opts.from });
            const toFormat = opts.to ?? detectFormat(output);
            if (!toFormat) throw new CliError(`cannot detect output format; pass --to eds|xdd`);
            await saveModel(model, output, { format: toFormat });
            if (opts.json) emitOk(output, ['converted']);
            else if (output !== '-') console.log(`wrote ${output} (${toFormat})`);
        });
}

export default register;
