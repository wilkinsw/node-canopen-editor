/**
 * Model validation rules for `canopen validate`.
 *
 * Returns findings: { level: 'error'|'warn', ref: '0x1800'|'0x2000.0x01'|null,
 * message }. Warnings become errors under --strict.
 */

import {
    ObjectType, AccessType, isContainerType, isIntegerType, isFloatType,
    dataTypeSize, countRxTxPdo, getTxPdos, getRxPdos,
} from '@canopen-editor/core';
import { hexIndex, refLabel } from './format.js';

const VALID_ACCESS = Object.values(AccessType);
const MANDATORY_OBJECTS = [0x1000, 0x1001, 0x1018];

function numericValue(str) {
    if (str === undefined || str === '') return null;
    const s = String(str).trim();
    const value = /^0x/i.test(s) ? parseInt(s, 16) : Number(s);
    return Number.isNaN(value) ? NaN : value;
}

function checkEntryFields(findings, ref, entry) {
    if (entry.accessType !== undefined && !VALID_ACCESS.includes(entry.accessType)) {
        findings.push({ level: 'error', ref, message: `invalid access type '${entry.accessType}'` });
    }
    if (entry.objectType === ObjectType.VAR && entry.dataType === undefined) {
        findings.push({ level: 'error', ref, message: 'VAR entry has no data type' });
    }
    const isNumeric = isIntegerType(entry.dataType) || isFloatType(entry.dataType);
    if (isNumeric) {
        const def = numericValue(entry.defaultValue);
        const low = numericValue(entry.lowLimit);
        const high = numericValue(entry.highLimit);
        if (Number.isNaN(def)) {
            findings.push({ level: 'warn', ref, message: `default value '${entry.defaultValue}' is not numeric` });
        }
        if (Number.isNaN(low)) {
            findings.push({ level: 'warn', ref, message: `low limit '${entry.lowLimit}' is not numeric` });
        }
        if (Number.isNaN(high)) {
            findings.push({ level: 'warn', ref, message: `high limit '${entry.highLimit}' is not numeric` });
        }
        if (low != null && high != null && !Number.isNaN(low) && !Number.isNaN(high) && low > high) {
            findings.push({ level: 'warn', ref, message: `low limit ${entry.lowLimit} exceeds high limit ${entry.highLimit}` });
        }
        if (def != null && !Number.isNaN(def)) {
            if (low != null && !Number.isNaN(low) && def < low) {
                findings.push({ level: 'warn', ref, message: `default ${entry.defaultValue} below low limit ${entry.lowLimit}` });
            }
            if (high != null && !Number.isNaN(high) && def > high) {
                findings.push({ level: 'warn', ref, message: `default ${entry.defaultValue} above high limit ${entry.highLimit}` });
            }
        }
    }
}

export function validateModel(model) {
    const findings = [];
    const objects = model.objects ?? {};

    for (const [key, entry] of Object.entries(objects)) {
        const index = Number(key);
        const ref = hexIndex(index);
        if (index < 0 || index > 0xFFFF) {
            findings.push({ level: 'error', ref, message: 'index out of range (0x0000 – 0xFFFF)' });
        }
        checkEntryFields(findings, ref, entry);

        if (isContainerType(entry.objectType)) {
            const subs = entry.subObjects ?? {};
            const subIndices = Object.keys(subs).map(Number);
            if (!subIndices.length) {
                findings.push({ level: 'error', ref, message: 'container object has no sub-objects' });
                continue;
            }
            // PDO mapping objects (0x1600/0x1A00 ranges) use sub 0 as the
            // count of *valid* mappings, not the highest sub-index — their
            // contents are checked in the PDO pass below instead.
            const isPdoMappingObject =
                (index >= 0x1600 && index <= 0x17FF) || (index >= 0x1A00 && index <= 0x1BFF);
            if (!subs[0]) {
                findings.push({ level: 'error', ref, message: 'container object is missing sub 0 (highest sub-index supported)' });
            } else if (!isPdoMappingObject) {
                const declaredMax = numericValue(subs[0].defaultValue);
                const actualMax = Math.max(...subIndices.filter((i) => i !== 0), 0);
                if (declaredMax !== actualMax) {
                    findings.push({
                        level: 'error', ref,
                        message: `sub 0 declares highest sub-index ${subs[0].defaultValue}, actual is ${actualMax}`,
                    });
                }
            }
            if (entry.subNumber !== undefined && entry.subNumber !== subIndices.length) {
                findings.push({
                    level: 'error', ref,
                    message: `subNumber is ${entry.subNumber} but entry has ${subIndices.length} sub-objects`,
                });
            }
            for (const subIndex of subIndices) {
                if (subIndex < 0 || subIndex > 254) {
                    findings.push({ level: 'error', ref: refLabel(index, subIndex), message: 'sub-index out of range (0 – 254)' });
                }
                checkEntryFields(findings, refLabel(index, subIndex), subs[subIndex]);
            }
        }
    }

    // PDO comm/mapping pairing
    for (const [key] of Object.entries(objects)) {
        const index = Number(key);
        const isComm = (index >= 0x1400 && index <= 0x15FF) || (index >= 0x1800 && index <= 0x19FF);
        const isMap = (index >= 0x1600 && index <= 0x17FF) || (index >= 0x1A00 && index <= 0x1BFF);
        if (isComm && !objects[index + 0x200]) {
            findings.push({
                level: 'error', ref: hexIndex(index),
                message: `PDO communication object has no mapping object at ${hexIndex(index + 0x200)}`,
            });
        }
        if (isMap && !objects[index - 0x200]) {
            findings.push({
                level: 'error', ref: hexIndex(index),
                message: `PDO mapping object has no communication object at ${hexIndex(index - 0x200)}`,
            });
        }
    }

    // PDO contents
    for (const isRx of [false, true]) {
        const pdos = (isRx ? getRxPdos : getTxPdos)(objects);
        for (const pdo of pdos) {
            const ref = hexIndex(pdo.commIndex);
            if (pdo.transmissionType < 0 || pdo.transmissionType > 255) {
                findings.push({ level: 'error', ref, message: `transmission type ${pdo.transmissionType} out of range (0 – 255)` });
            }
            if (pdo.cobId < 0 || pdo.cobId > 0x7FF) {
                findings.push({ level: 'error', ref, message: `COB-ID 0x${pdo.cobId.toString(16).toUpperCase()} exceeds 11 bits` });
            }
            if (pdo.mappings.length > 8) {
                findings.push({ level: 'error', ref, message: `${pdo.mappings.length} mappings (max 8)` });
            }
            const bits = pdo.mappings.reduce((sum, m) => sum + m.bits, 0);
            if (bits > 64) {
                findings.push({ level: 'error', ref, message: `${bits} mapped bits (max 64)` });
            }
            for (const m of pdo.mappings) {
                const target = objects[m.index];
                const sub = m.subIndex > 0 ? target?.subObjects?.[m.subIndex] : target;
                const mapRef = refLabel(pdo.mappingIndex);
                if (!target || (m.subIndex > 0 && !sub)) {
                    findings.push({
                        level: 'error', ref: mapRef,
                        message: `mapping references nonexistent ${refLabel(m.index, m.subIndex > 0 ? m.subIndex : null)}`,
                    });
                    continue;
                }
                const size = dataTypeSize(sub.dataType);
                if (size != null && size * 8 !== m.bits) {
                    findings.push({
                        level: 'error', ref: mapRef,
                        message: `mapping of ${refLabel(m.index, m.subIndex)} declares ${m.bits} bits, data type is ${size * 8}`,
                    });
                }
                if (!sub.pdoMapping) {
                    findings.push({
                        level: 'warn', ref: mapRef,
                        message: `mapped target ${refLabel(m.index, m.subIndex)} has pdoMapping=false`,
                    });
                }
            }
        }
    }

    // Device-level checks
    const counts = countRxTxPdo(objects);
    const declaredRx = model.deviceInfo?.nrOfRXPDO;
    const declaredTx = model.deviceInfo?.nrOfTXPDO;
    if (declaredRx !== undefined && declaredRx !== counts.rx) {
        findings.push({ level: 'warn', ref: null, message: `deviceInfo.nrOfRXPDO is ${declaredRx}, file has ${counts.rx}` });
    }
    if (declaredTx !== undefined && declaredTx !== counts.tx) {
        findings.push({ level: 'warn', ref: null, message: `deviceInfo.nrOfTXPDO is ${declaredTx}, file has ${counts.tx}` });
    }
    for (const mandatory of MANDATORY_OBJECTS) {
        if (!objects[mandatory]) {
            findings.push({ level: 'warn', ref: hexIndex(mandatory), message: 'mandatory CiA-301 object is missing' });
        }
    }

    return findings;
}
