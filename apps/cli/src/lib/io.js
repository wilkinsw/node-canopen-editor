/**
 * File pipeline: load a device-description model, mutate it, save it back.
 *
 * Format is detected from the file extension (.eds / .xdd); `-` means
 * stdin/stdout and requires an explicit format. Mutating commands write back
 * to the input file unless -o/--output redirects (whose extension may convert
 * the format on the way out).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseEds, serializeEds, parseXdd, serializeXdd } from '@canopen-editor/core';
import { CliError } from './errors.js';

export const FORMATS = ['eds', 'xdd'];

/** Detect 'eds' | 'xdd' from a filename, or null if unknown. */
export function detectFormat(path) {
    if (!path || path === '-') return null;
    const lower = path.toLowerCase();
    if (lower.endsWith('.eds')) return 'eds';
    if (lower.endsWith('.xdd')) return 'xdd';
    return null;
}

function resolveFormat(path, override, role) {
    if (override) {
        if (!FORMATS.includes(override)) {
            throw new CliError(`unknown format '${override}' (expected eds or xdd)`);
        }
        return override;
    }
    const detected = detectFormat(path);
    if (!detected) {
        const what = path === '-' ? (role === 'input' ? 'stdin' : 'stdout') : `'${path}'`;
        throw new CliError(`cannot detect format of ${what}; pass --format eds|xdd`);
    }
    return detected;
}

/** Read a file or stdin ('-') as UTF-8 text. */
export async function readInput(path) {
    if (path === '-') {
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf8');
    }
    try {
        return await readFile(path, 'utf8');
    } catch (err) {
        throw new CliError(`cannot read '${path}': ${err.message}`);
    }
}

/** Load a model from an .eds/.xdd file or stdin. Returns { model, format }. */
export async function loadModel(path, { format } = {}) {
    const fmt = resolveFormat(path, format, 'input');
    const text = await readInput(path);
    try {
        const model = fmt === 'xdd' ? parseXdd(text) : parseEds(text);
        return { model, format: fmt };
    } catch (err) {
        throw new CliError(`failed to parse ${fmt.toUpperCase()} from '${path}': ${err.message}`);
    }
}

/**
 * Serialize a model to an .eds/.xdd file or stdout.
 *
 * Does not stamp modification date/time — output stays deterministic unless
 * the caller applied --touch first.
 */
export async function saveModel(model, path, { format } = {}) {
    const fmt = resolveFormat(path, format, 'output');
    const name = path === '-' ? `device.${fmt}` : basename(path);
    const text = fmt === 'xdd' ? serializeXdd(model, name) : serializeEds(model);
    if (path === '-') {
        process.stdout.write(text);
        return;
    }
    try {
        await writeFile(path, text);
    } catch (err) {
        throw new CliError(`cannot write '${path}': ${err.message}`);
    }
}

/** Apply --touch: stamp modification date/time (and optionally modifiedBy). */
export function touchModel(model, modifiedBy) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    let hours = now.getHours();
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const fileInfo = {
        ...model.fileInfo,
        modificationDate: `${mm}-${dd}-${now.getFullYear()}`,
        modificationTime: `${hours}:${String(now.getMinutes()).padStart(2, '0')}${suffix}`,
    };
    if (typeof modifiedBy === 'string') fileInfo.modifiedBy = modifiedBy;
    return { ...model, fileInfo };
}

/**
 * Shared flow for mutating commands: load <file>, run mutate(model) -> model,
 * save to --output (default: in place), honoring --format/--touch/--json.
 * `opts` are the commander options; `changed` labels go into --json output.
 */
export async function editFile(file, opts, mutate) {
    const { model, format: inFormat } = await loadModel(file, { format: opts.format });
    let updated = await mutate(model);
    if (opts.touch !== undefined) {
        updated = touchModel(updated, typeof opts.touch === 'string' ? opts.touch : undefined);
    }
    const out = opts.output ?? (file === '-' ? '-' : file);
    const outFormat = detectFormat(out) ?? opts.format ?? inFormat;
    await saveModel(updated, out, { format: outFormat });
    return out;
}
