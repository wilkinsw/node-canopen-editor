/**
 * Output formatting: uppercase 0x hex (matching the GUI), padded column
 * tables, and JSON emission.
 */

/** '0x2000' — 4-digit uppercase object index. */
export function hexIndex(index) {
    return `0x${Number(index).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** '0x01' — 2-digit uppercase sub-index. */
export function hexSub(subIndex) {
    return `0x${Number(subIndex).toString(16).toUpperCase().padStart(2, '0')}`;
}

/** '0x2000.0x01' or '0x2000' — an object reference label. */
export function refLabel(index, subIndex = null) {
    return subIndex == null ? hexIndex(index) : `${hexIndex(index)}.${hexSub(subIndex)}`;
}

/**
 * Render rows as aligned columns. `rows` is an array of string arrays;
 * `headers` (optional) is prepended with a separator line.
 */
export function table(rows, headers = null) {
    const all = headers ? [headers, ...rows] : rows;
    if (!all.length) return '';
    const widths = [];
    for (const row of all) {
        row.forEach((cell, i) => {
            widths[i] = Math.max(widths[i] ?? 0, String(cell).length);
        });
    }
    const render = (row) =>
        row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
    const lines = [];
    if (headers) {
        lines.push(render(headers));
        lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
        for (const row of rows) lines.push(render(row));
    } else {
        for (const row of all) lines.push(render(row));
    }
    return lines.join('\n');
}

/** Print a value as pretty JSON on stdout. */
export function emitJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** For mutating commands with --json: report success. */
export function emitOk(file, changed) {
    emitJson({ ok: true, file, changed });
}
