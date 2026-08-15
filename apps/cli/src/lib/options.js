/** Shared commander option sets. */

/** Options common to every mutating command (read-modify-write pipeline). */
export function withEditOptions(cmd) {
    return cmd
        .option('-o, --output <file>', "write result to <file> ('-' = stdout) instead of editing in place; the output extension may convert the format")
        .option('-F, --format <fmt>', 'file format when not detectable from the extension (eds|xdd)')
        .option('--touch [name]', 'stamp fileInfo modification date/time (and modifiedBy to [name])')
        .option('--json', 'print a machine-readable result to stdout');
}

/** Options common to read-only commands. */
export function withReadOptions(cmd) {
    return cmd
        .option('-F, --format <fmt>', 'file format when not detectable from the extension (eds|xdd)')
        .option('--json', 'print machine-readable JSON to stdout');
}
