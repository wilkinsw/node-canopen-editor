/**
 * CANopen type definitions.
 *
 * Base enums (ObjectType, AccessType, DataType) come from the shared
 * canopen-eds package; the barrel (index.js) re-exports them. Display
 * utilities shared by the editor apps and the CLI are defined here.
 */

import edsPkg from 'canopen-eds';

const { ObjectType, DataType } = edsPkg;

export const ObjectTypeName = Object.fromEntries(
    Object.entries(ObjectType).map(([k, v]) => [v, k])
);

export const DataTypeName = Object.fromEntries(
    Object.entries(DataType).map(([k, v]) => [v, k])
);

/** Returns byte size of a DataType, or null for variable-length types. */
export function dataTypeSize(type) {
    const sizes = {
        [DataType.BOOLEAN]: 1,
        [DataType.INTEGER8]: 1,
        [DataType.UNSIGNED8]: 1,
        [DataType.INTEGER16]: 2,
        [DataType.UNSIGNED16]: 2,
        [DataType.INTEGER24]: 3,
        [DataType.UNSIGNED24]: 3,
        [DataType.INTEGER32]: 4,
        [DataType.UNSIGNED32]: 4,
        [DataType.REAL32]: 4,
        [DataType.INTEGER40]: 5,
        [DataType.UNSIGNED40]: 5,
        [DataType.INTEGER48]: 6,
        [DataType.UNSIGNED48]: 6,
        [DataType.INTEGER56]: 7,
        [DataType.UNSIGNED56]: 7,
        [DataType.INTEGER64]: 8,
        [DataType.UNSIGNED64]: 8,
        [DataType.REAL64]: 8,
        [DataType.TIME_OF_DAY]: 6,
        [DataType.TIME_DIFFERENCE]: 6,
    };
    return sizes[type] ?? null;
}

/** Returns true for integer numeric types. */
export function isIntegerType(type) {
    return [
        DataType.BOOLEAN,
        DataType.INTEGER8,  DataType.INTEGER16,  DataType.INTEGER24,
        DataType.INTEGER32, DataType.INTEGER40,  DataType.INTEGER48,
        DataType.INTEGER56, DataType.INTEGER64,
        DataType.UNSIGNED8, DataType.UNSIGNED16, DataType.UNSIGNED24,
        DataType.UNSIGNED32,DataType.UNSIGNED40, DataType.UNSIGNED48,
        DataType.UNSIGNED56,DataType.UNSIGNED64,
    ].includes(type);
}

/** Returns true for floating point types. */
export function isFloatType(type) {
    return [DataType.REAL32, DataType.REAL64].includes(type);
}

/** Returns true for string types. */
export function isStringType(type) {
    return [
        DataType.VISIBLE_STRING,
        DataType.OCTET_STRING,
        DataType.UNICODE_STRING,
    ].includes(type);
}

/** Returns true for complex/container object types. */
export function isContainerType(objectType) {
    return [
        ObjectType.ARRAY,
        ObjectType.RECORD,
        ObjectType.DEFSTRUCT,
    ].includes(objectType);
}
