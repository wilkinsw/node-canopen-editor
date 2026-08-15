/** Shared commander option sets. */

/** Options common to every mutating command (read-modify-write pipeline). */
export function withEditOptions(cmd) {
    return cmd
        .option('-o, --output <file>', "write result to <file> ('-' = stdout) instead of editing in place; the output extension may convert the format")
        .option('-F, --format <fmt>', 'file format when not detectable from the extension (eds|xdd)')
        .option('--touch [name]', 'stamp fileInfo modification date/time (and modifiedBy to [name])')
        .option('--json', 'print a machine-readable result to stdout');
}

/** Entry/sub-entry field options shared by object/sub add and set. */
export function withFieldOptions(cmd, { topLevel = true } = {}) {
    cmd
        .option('--name <s>', 'parameter name')
        .option('--data-type <t>', 'data type name (e.g. UNSIGNED16) or number')
        .option('--access <a>', 'access type: rw|ro|wo|const|rww|rwr')
        .option('--default <s>', 'default value')
        .option('--string-length <n>', 'string length (string data types only)')
        .option('--low <s>', 'low limit')
        .option('--high <s>', 'high limit')
        .option('--pdo-mapping', 'allow PDO mapping')
        .option('--no-pdo-mapping', 'disallow PDO mapping');
    if (topLevel) {
        cmd.option('--storage <s>', "storage location (e.g. RAM, ROM; '' clears)");
    }
    return cmd;
}

/** Options common to read-only commands. */
export function withReadOptions(cmd) {
    return cmd
        .option('-F, --format <fmt>', 'file format when not detectable from the extension (eds|xdd)')
        .option('--json', 'print machine-readable JSON to stdout');
}
