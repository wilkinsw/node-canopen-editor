/**
 * Domain barrel for the CANopen editor.
 *
 * Re-exports the full public API of canopen-eds / canopen-xdd plus the
 * shared type helpers in types.js. Consumers (renderer, CLI) import from
 * here rather than from the npm packages directly.
 *
 * canopen-eds / canopen-xdd are CommonJS. Default-import + destructure is
 * the interop pattern that works identically in plain Node (the CLI) and
 * Vite (web/desktop renderers), regardless of cjs-module-lexer detection.
 */
import edsPkg from 'canopen-eds';
import xddPkg from 'canopen-xdd';

export const {
    parseEds,
    serializeEds,
    Eds,
    EdsError,
    ObjectType,
    AccessType,
    DataType,
    createEmptyEds,
    createVarEntry,
    createArrayEntry,
    createRecordEntry,
    createSubEntry,
    getCategoryForIndex,
    CATEGORIES,
    countRxTxPdo,
    getPdoMappableObjects,
    parseMappingValue,
    buildMappingValue,
    getTxPdos,
    getRxPdos,
    writePdoToObjects,
    addNewPdo,
    deletePdo,
    getMappingBitUsage,
} = edsPkg;

export const { parseXdd, serializeXdd, exportOD } = xddPkg;

export {
    ObjectTypeName,
    DataTypeName,
    dataTypeSize,
    isIntegerType,
    isFloatType,
    isStringType,
    isContainerType,
} from './types.js';
