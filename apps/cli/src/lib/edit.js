/**
 * Object-dictionary entry editing: field application shared by
 * object/sub add+set, sub 0 bookkeeping (mirrors the GUI's ObjectDetail),
 * and the clipboard envelope shared with the GUI apps.
 */

import { isStringType } from '@canopen-editor/core';
import { CliError } from './errors.js';
import { hexIndex, hexSub, refLabel } from './format.js';
import {
    parseDataType, parseAccessType, parseObjectType, parseNumber,
} from './parse.js';

/** Fetch an entry or throw. */
export function getEntry(objects, index) {
    const entry = objects?.[index];
    if (!entry) throw new CliError(`no object at ${hexIndex(index)}`);
    return entry;
}

/** Fetch a sub-entry or throw. */
export function getSubEntry(entry, index, subIndex) {
    const sub = entry.subObjects?.[subIndex];
    if (!sub) throw new CliError(`no sub-object ${refLabel(index, subIndex)}`);
    return sub;
}

/**
 * Apply command-line field options to an entry (or sub-entry) immutably.
 * Returns { entry, changed: [fieldName...] }.
 */
export function applyEntryOptions(entry, opts, { topLevel = true } = {}) {
    const updated = { ...entry };
    const changed = [];
    const set = (field, value) => {
        updated[field] = value;
        changed.push(field);
    };
    if (opts.name !== undefined) set('parameterName', opts.name);
    if (opts.objectType !== undefined) set('objectType', parseObjectType(opts.objectType));
    if (opts.dataType !== undefined) set('dataType', parseDataType(opts.dataType));
    if (opts.access !== undefined) set('accessType', parseAccessType(opts.access));
    if (opts.default !== undefined) set('defaultValue', opts.default);
    if (opts.low !== undefined) set('lowLimit', opts.low);
    if (opts.high !== undefined) set('highLimit', opts.high);
    if (opts.pdoMapping !== undefined) set('pdoMapping', opts.pdoMapping);
    if (opts.stringLength !== undefined) {
        if (!isStringType(updated.dataType)) {
            throw new CliError('--string-length only applies to string data types');
        }
        set('stringLength', parseNumber(opts.stringLength, 'string length'));
    }
    if (opts.storage !== undefined) {
        if (!topLevel) throw new CliError('--storage only applies to top-level objects');
        set('storageLocation', opts.storage === '' ? undefined : opts.storage);
    }
    return { entry: updated, changed };
}

/**
 * Append `sub` at the next free sub-index and keep sub 0's
 * highest-sub-index defaultValue current (GUI ObjectDetail semantics).
 * Returns { entry, subIndex }.
 */
export function appendSubObject(entry, sub) {
    const indices = Object.keys(entry.subObjects ?? {}).map(Number);
    const next = indices.length ? Math.max(...indices) + 1 : 1;
    const subObjects = { ...entry.subObjects, [next]: structuredClone(sub) };
    if (subObjects[0]) subObjects[0] = { ...subObjects[0], defaultValue: String(next) };
    return { entry: { ...entry, subObjects }, subIndex: next };
}

/** Remove a sub-object (never sub 0) and recompute sub 0's defaultValue. */
export function removeSubObject(entry, index, subIndex) {
    if (subIndex === 0) {
        throw new CliError(`sub-object ${hexSub(0)} is structural and cannot be removed`);
    }
    getSubEntry(entry, index, subIndex);
    const subObjects = { ...entry.subObjects };
    delete subObjects[subIndex];
    const remaining = Object.keys(subObjects).map(Number).filter((i) => i !== 0);
    const maxSub = remaining.length ? Math.max(...remaining) : 0;
    if (subObjects[0]) subObjects[0] = { ...subObjects[0], defaultValue: String(maxSub) };
    return { ...entry, subObjects };
}

/* Clipboard envelope — must match packages/renderer/src/lib/clipboard.js so
 * exported JSON can round-trip with the GUI apps. */
export const APP_MARKER = 'canopen-editor';
export const PAYLOAD_VERSION = 1;
export const CLIPBOARD_KIND = { OBJECT: 'object', SUB_OBJECT: 'subObject' };

export function buildObjectPayload(index, entry) {
    return {
        app: APP_MARKER,
        version: PAYLOAD_VERSION,
        kind: CLIPBOARD_KIND.OBJECT,
        index: Number(index),
        entry,
    };
}

export function buildSubObjectPayload(subIndex, sub) {
    return {
        app: APP_MARKER,
        version: PAYLOAD_VERSION,
        kind: CLIPBOARD_KIND.SUB_OBJECT,
        subIndex: Number(subIndex),
        sub,
    };
}

/** Parse and validate an envelope of the expected kind; throws CliError. */
export function parsePayload(text, expectedKind) {
    let payload;
    try {
        payload = JSON.parse(text);
    } catch {
        throw new CliError('input is not valid JSON');
    }
    const valid = payload
        && payload.app === APP_MARKER
        && payload.version === PAYLOAD_VERSION
        && Object.values(CLIPBOARD_KIND).includes(payload.kind);
    if (!valid) throw new CliError('input is not a canopen-editor clipboard payload');
    if (payload.kind !== expectedKind) {
        throw new CliError(`payload is a ${payload.kind}, expected ${expectedKind}`);
    }
    return payload;
}
