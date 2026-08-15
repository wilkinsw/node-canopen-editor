import { readFile } from 'node:fs/promises';
import { CliError } from '../lib/errors.js';

// Repo layout first; bundled builds ship the manual next to the script.
const CANDIDATES = [
    '../../man/canopen.1.md',
    './canopen.1.md',
];

function register(program) {
    program
        .command('docs')
        .description('print the full manual (markdown) to stdout')
        .action(async () => {
            for (const candidate of CANDIDATES) {
                try {
                    const text = await readFile(new URL(candidate, import.meta.url), 'utf8');
                    process.stdout.write(text);
                    return;
                } catch {
                    // try the next location
                }
            }
            throw new CliError('manual file not found');
        });
}

export default register;
