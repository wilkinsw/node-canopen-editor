import { loadModel } from '../lib/io.js';
import { withReadOptions } from '../lib/options.js';
import { table, emitJson } from '../lib/format.js';
import { validateModel } from '../lib/validate-model.js';

function register(program) {
    withReadOptions(
        program
            .command('validate')
            .description('check a device description for consistency problems')
            .option('--strict', 'treat warnings as errors')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
    )
        .addHelpText('after', `
Checks index/sub-index ranges, container sub 0 bookkeeping, PDO comm/mapping
pairing, dangling or oversized PDO mappings, and numeric default/limit
consistency — including problems the GUI cannot detect.

Exit status: 0 when clean, 3 when problems were found.

Examples:
  canopen validate device.eds
  canopen validate device.xdd --strict --json`)
        .action(async (file, opts) => {
            const { model } = await loadModel(file, { format: opts.format });
            let findings = validateModel(model);
            if (opts.strict) {
                findings = findings.map((f) => ({ ...f, level: 'error' }));
            }
            const errors = findings.filter((f) => f.level === 'error').length;
            const warnings = findings.length - errors;
            if (opts.json) {
                emitJson({ ok: findings.length === 0, errors, warnings, findings });
            } else if (!findings.length) {
                console.log('ok — no problems found');
            } else {
                console.log(table(findings.map((f) => [f.level, f.ref ?? '-', f.message])));
                console.log(`\n${errors} error(s), ${warnings} warning(s)`);
            }
            if (findings.length) process.exit(3);
        });
}

export default register;
