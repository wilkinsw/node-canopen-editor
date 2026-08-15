/**
 * Argument parsing helpers: hex/decimal indices, `index.sub` refs,
 * booleans, key=value pairs, and enum-name lookups.
 */

import { DataType, DataTypeName, AccessType, ObjectType } from '@canopen-editor/core';
import { CliError } from './errors.js';

/** Parse an object index: '0x2000' or decimal. Range 0x0000–0xFFFF. */
export function parseIndex(str) {
    const idx = parseNumber(str, 'index');
    if (idx < 0 || idx > 0xFFFF) {
        throw new CliError(`index ${str} out of range (0x0000 – 0xFFFF)`);
    }
    return idx;
}

/** Parse a sub-index: '0x01' or decimal. Range 0–254. */
export function parseSubIndex(str) {
    const sub = parseNumber(str, 'sub-index');
    if (sub < 0 || sub > 254) {
        throw new CliError(`sub-index ${str} out of range (0 – 254)`);
    }
    return sub;
}

/** Parse an object reference 'index[.sub]', e.g. '0x2000' or '0x2000.3'. */
export function parseRef(str) {
    const [indexPart, subPart, extra] = String(str).split('.');
    if (extra !== undefined) throw new CliError(`invalid reference '${str}' (expected index[.sub])`);
    return {
        index: parseIndex(indexPart),
        subIndex: subPart !== undefined ? parseSubIndex(subPart) : null,
    };
}

/** Parse a hex ('0x...') or decimal integer; throws CliError on garbage. */
export function parseNumber(str, what = 'number') {
    const s = String(str).trim();
    const value = /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
    if (isNaN(value) || !/^(0x[0-9a-f]+|\d+)$/i.test(s)) {
        throw new CliError(`invalid ${what} '${str}'`);
    }
    return value;
}

/** Parse a boolean flag value: true/false, yes/no, on/off, 1/0. */
export function parseBool(str, what = 'value') {
    const s = String(str).trim().toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(s)) return true;
    if (['false', 'no', 'off', '0'].includes(s)) return false;
    throw new CliError(`invalid boolean ${what} '${str}' (use true/false)`);
}

/** Split a 'key=value' argument. */
export function parseKeyValue(str) {
    const eq = String(str).indexOf('=');
    if (eq < 1) throw new CliError(`invalid assignment '${str}' (expected key=value)`);
    return { key: str.slice(0, eq), value: str.slice(eq + 1) };
}

/** Parse a DataType by name ('UNSIGNED16', case-insensitive) or number. */
export function parseDataType(str) {
    const byName = DataType[String(str).toUpperCase()];
    if (byName !== undefined) return byName;
    const value = parseNumber(str, 'data type');
    if (!(value in DataTypeName)) throw new CliError(`unknown data type '${str}'`);
    return value;
}

/** Parse an access type: rw, ro, wo, const, rww, rwr. */
export function parseAccessType(str) {
    const valid = Object.values(AccessType);
    const s = String(str).toLowerCase();
    if (!valid.includes(s)) {
        throw new CliError(`invalid access type '${str}' (expected ${valid.join('|')})`);
    }
    return s;
}

/** Parse an object type by name ('var', 'array', 'record', ...) or number. */
export function parseObjectType(str) {
    const byName = ObjectType[String(str).toUpperCase()];
    if (byName !== undefined) return byName;
    const value = parseNumber(str, 'object type');
    if (!Object.values(ObjectType).includes(value)) {
        throw new CliError(`unknown object type '${str}'`);
    }
    return value;
}
