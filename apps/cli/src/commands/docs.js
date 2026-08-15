import { readFile } from 'node:fs/promises';

function register(program) {
    program
        .command('docs')
        .description('print the full manual (markdown) to stdout')
        .action(async () => {
            const url = new URL('../../man/canopen.1.md', import.meta.url);
            process.stdout.write(await readFile(url, 'utf8'));
        });
}

export default register;
