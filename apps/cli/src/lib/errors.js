/**
 * CLI error conventions.
 *
 * Exit codes:
 *   0  success
 *   1  domain / runtime error (bad index, parse failure, PDO limits, ...)
 *   2  usage error (unknown command, bad flags — raised by commander)
 *   3  `validate` found problems
 */

export class CliError extends Error {
    constructor(message, exitCode = 1) {
        super(message);
        this.name = 'CliError';
        this.exitCode = exitCode;
    }
}

/** Print `canopen: <message>` to stderr and exit. */
export function fail(message, exitCode = 1) {
    process.stderr.write(`canopen: ${message}\n`);
    process.exit(exitCode);
}
