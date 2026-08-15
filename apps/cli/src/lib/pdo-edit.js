/**
 * PDO mutations. Unlike the GUI (which silently rejects over-capacity
 * drops), every constraint violation raises a loud CliError.
 */

import {
    getTxPdos, getRxPdos, writePdoToObjects, getMappingBitUsage, dataTypeSize,
} from '@canopen-editor/core';
import { CliError } from './errors.js';
import { hexIndex, refLabel } from './format.js';
import { parseNumber } from './parse.js';

export const PDO_MAX_BITS = 64;
export const PDO_MAX_MAPPINGS = 8;

export function getPdos(objects, isRx) {
    return (isRx ? getRxPdos : getTxPdos)(objects);
}

/**
 * Resolve a PDO by id (1, 2, ...) or by communication index (0x1400/0x1800
 * ranges). Throws if not found.
 */
export function resolvePdo(objects, isRx, ref) {
    const pdos = getPdos(objects, isRx);
    const value = parseNumber(ref, 'PDO id');
    const pdo = pdos.find((p) => p.id === value || p.commIndex === value);
    if (!pdo) {
        const kind = isRx ? 'RX' : 'TX';
        const known = pdos.map((p) => p.id).join(', ') || 'none';
        throw new CliError(`no ${kind} PDO '${ref}' (known ids: ${known})`);
    }
    return pdo;
}

/** Resolve a mapping target { index, subIndex } to its entry, validating it. */
function resolveTarget(objects, { index, subIndex }) {
    const entry = objects[index];
    if (!entry) throw new CliError(`no object at ${hexIndex(index)}`);
    const target = subIndex == null ? entry : entry.subObjects?.[subIndex];
    if (!target) throw new CliError(`no sub-object ${refLabel(index, subIndex)}`);
    return target;
}

/** Append (or insert at `at`, 1-based) mappings for the given refs. */
export function addMappings(objects, isRx, pdo, refs, at) {
    const mappings = [...pdo.mappings];
    let insert = at != null ? at - 1 : mappings.length;
    if (at != null && (at < 1 || insert > mappings.length)) {
        throw new CliError(`--at ${at} out of range (1 – ${mappings.length + 1})`);
    }
    for (const ref of refs) {
        const target = resolveTarget(objects, ref);
        const label = refLabel(ref.index, ref.subIndex);
        if (!target.pdoMapping) {
            throw new CliError(`${label} is not PDO-mappable (set it with 'canopen ${ref.subIndex == null ? 'object' : 'sub'} set ... --pdo-mapping')`);
        }
        const size = dataTypeSize(target.dataType);
        if (size == null) {
            throw new CliError(`${label} has a variable-length data type and cannot be PDO-mapped`);
        }
        mappings.splice(insert, 0, { index: ref.index, subIndex: ref.subIndex ?? 0, bits: size * 8 });
        insert += 1;
    }
    if (mappings.length > PDO_MAX_MAPPINGS) {
        throw new CliError(`PDO would have ${mappings.length} mappings (max ${PDO_MAX_MAPPINGS})`);
    }
    const bits = getMappingBitUsage(mappings);
    if (bits > PDO_MAX_BITS) {
        throw new CliError(`PDO would use ${bits} bits (max ${PDO_MAX_BITS})`);
    }
    return writePdoToObjects(objects, { ...pdo, mappings }, isRx);
}

/**
 * Remove one mapping, addressed by 1-based slot number (plain decimal) or by
 * object reference ('0x2000' / '0x2000.1' — first matching slot).
 */
export function removeMapping(objects, isRx, pdo, slotOrRef) {
    const mappings = [...pdo.mappings];
    let slot;
    if (/^\d+$/.test(String(slotOrRef).trim())) {
        slot = Number(slotOrRef) - 1;
        if (slot < 0 || slot >= mappings.length) {
            throw new CliError(`no slot ${slotOrRef} (PDO has ${mappings.length} mappings)`);
        }
    } else {
        const [indexPart, subPart] = String(slotOrRef).split('.');
        const index = parseNumber(indexPart, 'index');
        const subIndex = subPart !== undefined ? parseNumber(subPart, 'sub-index') : null;
        slot = mappings.findIndex((m) =>
            m.index === index && (subIndex == null || m.subIndex === subIndex));
        if (slot < 0) throw new CliError(`no mapping of ${refLabel(index, subIndex)} in this PDO`);
    }
    mappings.splice(slot, 1);
    return writePdoToObjects(objects, { ...pdo, mappings }, isRx);
}

/** Move a mapping from one 1-based slot to another. */
export function reorderMapping(objects, isRx, pdo, fromSlot, toSlot) {
    const mappings = [...pdo.mappings];
    const from = fromSlot - 1;
    const to = toSlot - 1;
    if (from < 0 || from >= mappings.length || to < 0 || to >= mappings.length) {
        throw new CliError(`slot out of range (PDO has ${mappings.length} mappings)`);
    }
    const [moved] = mappings.splice(from, 1);
    mappings.splice(to, 0, moved);
    return writePdoToObjects(objects, { ...pdo, mappings }, isRx);
}

/** Apply comm-parameter options to a PDO; returns { objects, changed }. */
export function setPdoParams(objects, isRx, pdo, opts) {
    const updated = { ...pdo };
    const changed = [];
    if (opts.cobId !== undefined) {
        const raw = parseNumber(opts.cobId, 'COB-ID');
        const masked = raw & 0x7FF;
        if (masked !== raw) {
            process.stderr.write(`canopen: warning: COB-ID 0x${raw.toString(16).toUpperCase()} masked to 11 bits (0x${masked.toString(16).toUpperCase()})\n`);
        }
        updated.cobId = masked;
        changed.push('cobId');
    }
    if (opts.transmissionType !== undefined) {
        const value = parseNumber(opts.transmissionType, 'transmission type');
        if (value > 255) throw new CliError('transmission type out of range (0 – 255)');
        updated.transmissionType = value;
        changed.push('transmissionType');
    }
    for (const [flag, field] of [
        ['inhibitTime', 'inhibitTime'],
        ['eventTimer', 'eventTimer'],
        ['syncStart', 'syncStart'],
    ]) {
        if (opts[flag] !== undefined) {
            updated[field] = parseNumber(opts[flag], field);
            changed.push(field);
        }
    }
    if (opts.disabled !== undefined) {
        updated.disabled = opts.disabled;
        changed.push('disabled');
    }
    if (!changed.length) throw new CliError('no parameters given (see --help)');
    return { objects: writePdoToObjects(objects, updated, isRx), changed };
}
