/**
 * `canopen object` — top-level object dictionary entries.
 */

import { writeFile } from 'node:fs/promises';
import {
    createVarEntry, createArrayEntry, createRecordEntry,
    getCategoryForIndex, CATEGORIES,
    ObjectTypeName, DataTypeName,
} from '@canopen-editor/core';
import { CliError } from '../lib/errors.js';
import { loadModel, editFile, readInput } from '../lib/io.js';
import { withReadOptions, withEditOptions, withFieldOptions } from '../lib/options.js';
import { parseIndex } from '../lib/parse.js';
import { table, emitJson, emitOk, hexIndex, hexSub } from '../lib/format.js';
import {
    getEntry, applyEntryOptions,
    buildObjectPayload, parsePayload, CLIPBOARD_KIND,
} from '../lib/edit.js';

const CREATORS = {
    var: createVarEntry,
    array: createArrayEntry,
    record: createRecordEntry,
};

function entryRow(index, entry) {
    return [
        hexIndex(index),
        entry.parameterName ?? '',
        ObjectTypeName[entry.objectType] ?? String(entry.objectType ?? ''),
        entry.dataType !== undefined ? (DataTypeName[entry.dataType] ?? String(entry.dataType)) : '',
        entry.accessType ?? '',
        entry.subObjects ? String(Object.keys(entry.subObjects).length) : '',
    ];
}

function entryJson(index, entry) {
    return { index, indexHex: hexIndex(index), ...structuredClone(entry) };
}

function register(program) {
    const object = program
        .command('object')
        .description('list, add, edit, and remove object dictionary entries');

    withReadOptions(
        object
            .command('list')
            .description('list entries grouped by category')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .option('--category <key>', `only show one category (${CATEGORIES.map((c) => c.key).join('|')})`)
            .option('--long', 'include default value, limits, PDO flag, and storage')
    )
        .addHelpText('after', `
Examples:
  canopen object list device.eds
  canopen object list device.eds --category manufacturer --json`)
        .action(async (file, opts) => {
            const { model } = await loadModel(file, { format: opts.format });
            const objects = model.objects ?? {};
            if (opts.category && !CATEGORIES.some((c) => c.key === opts.category)) {
                throw new CliError(`unknown category '${opts.category}'`);
            }
            const indices = Object.keys(objects).map(Number).sort((a, b) => a - b);
            if (opts.json) {
                const list = indices
                    .filter((i) => !opts.category || getCategoryForIndex(i) === opts.category)
                    .map((i) => ({ category: getCategoryForIndex(i), ...entryJson(i, objects[i]) }));
                emitJson(list);
                return;
            }
            const headers = ['Index', 'Name', 'Type', 'Data Type', 'Access', 'Subs'];
            if (opts.long) headers.push('Default', 'Low', 'High', 'PDO', 'Storage');
            let first = true;
            for (const category of CATEGORIES) {
                if (opts.category && category.key !== opts.category) continue;
                const rows = indices
                    .filter((i) => getCategoryForIndex(i) === category.key)
                    .map((i) => {
                        const row = entryRow(i, objects[i]);
                        if (opts.long) {
                            const e = objects[i];
                            row.push(e.defaultValue ?? '', e.lowLimit ?? '', e.highLimit ?? '',
                                e.pdoMapping ? 'yes' : '', e.storageLocation ?? '');
                        }
                        return row;
                    });
                if (!rows.length) continue;
                if (!first) console.log('');
                console.log(`${category.label}`);
                console.log(table(rows, headers));
                first = false;
            }
        });

    withReadOptions(
        object
            .command('show')
            .description('show all fields of one entry (and its sub-objects)')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .argument('<index>', 'object index (hex 0x1018 or decimal)')
    ).action(async (file, indexArg, opts) => {
        const { model } = await loadModel(file, { format: opts.format });
        const index = parseIndex(indexArg);
        const entry = getEntry(model.objects, index);
        if (opts.json) {
            emitJson(entryJson(index, entry));
            return;
        }
        const fields = [
            ['Index', hexIndex(index)],
            ['Name', entry.parameterName ?? ''],
            ['Object type', ObjectTypeName[entry.objectType] ?? String(entry.objectType ?? '')],
            ['Data type', entry.dataType !== undefined ? (DataTypeName[entry.dataType] ?? String(entry.dataType)) : ''],
            ['Access', entry.accessType ?? ''],
            ['Default', entry.defaultValue ?? ''],
            ['Low limit', entry.lowLimit ?? ''],
            ['High limit', entry.highLimit ?? ''],
            ['PDO mapping', entry.pdoMapping ? 'yes' : 'no'],
            ['Storage', entry.storageLocation ?? ''],
        ];
        if (entry.stringLength !== undefined) fields.splice(6, 0, ['String length', String(entry.stringLength)]);
        console.log(table(fields));
        if (entry.subObjects) {
            const rows = Object.entries(entry.subObjects)
                .map(([sub, s]) => [
                    hexSub(Number(sub)),
                    s.parameterName ?? '',
                    s.dataType !== undefined ? (DataTypeName[s.dataType] ?? String(s.dataType)) : '',
                    s.accessType ?? '',
                    s.defaultValue ?? '',
                    s.pdoMapping ? 'yes' : '',
                ]);
            console.log(`\nSub-objects:\n${table(rows, ['Sub', 'Name', 'Data Type', 'Access', 'Default', 'PDO'])}`);
        }
    });

    withFieldOptions(withEditOptions(
        object
            .command('add')
            .description('add a new entry')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<index>', 'object index (0x0000 – 0xFFFF)')
            .requiredOption('--type <t>', 'object type: var|array|record')
    ))
        .addHelpText('after', `
Examples:
  canopen object add device.eds 0x2000 --type var --name Speed --data-type INTEGER16 --access rw
  canopen object add device.eds 0x2100 --type record --name "Motor Params"`)
        .action(async (file, indexArg, opts) => {
            const index = parseIndex(indexArg);
            const creator = CREATORS[String(opts.type).toLowerCase()];
            if (!creator) throw new CliError(`invalid --type '${opts.type}' (expected var|array|record)`);
            const out = await editFile(file, opts, (model) => {
                if (model.objects?.[index]) {
                    throw new CliError(`object ${hexIndex(index)} already exists`);
                }
                const base = creator(opts.name ?? undefined);
                const { entry } = applyEntryOptions(base, { ...opts, name: undefined }, { topLevel: true });
                return { ...model, objects: { ...model.objects, [index]: entry } };
            });
            if (opts.json) emitOk(out, [hexIndex(index)]);
            else console.log(`added ${hexIndex(index)}`);
        });

    withFieldOptions(withEditOptions(
        object
            .command('set')
            .description('edit fields of an existing entry')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<index>', 'object index')
            .option('--object-type <t>', 'object type name (VAR, ARRAY, RECORD, DOMAIN, DEFTYPE, DEFSTRUCT) or number')
    ))
        .addHelpText('after', `
Examples:
  canopen object set device.eds 0x2000 --name "Motor Speed" --default 100
  canopen object set device.eds 0x2000 --pdo-mapping --access ro`)
        .action(async (file, indexArg, opts) => {
            const index = parseIndex(indexArg);
            let changed = [];
            const out = await editFile(file, opts, (model) => {
                const entry = getEntry(model.objects, index);
                const result = applyEntryOptions(entry, opts, { topLevel: true });
                changed = result.changed;
                if (!changed.length) throw new CliError('no fields given (see --help)');
                return { ...model, objects: { ...model.objects, [index]: result.entry } };
            });
            if (opts.json) emitOk(out, changed.map((f) => `${hexIndex(index)}.${f}`));
        });

    withEditOptions(
        object
            .command('rm')
            .description('remove one or more entries')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<indices...>', 'object indices')
    ).action(async (file, indexArgs, opts) => {
        const indices = indexArgs.map(parseIndex);
        const out = await editFile(file, opts, (model) => {
            const objects = { ...model.objects };
            for (const index of indices) {
                getEntry(objects, index);
                delete objects[index];
            }
            return { ...model, objects };
        });
        if (opts.json) emitOk(out, indices.map(hexIndex));
        else console.log(`removed ${indices.map(hexIndex).join(', ')}`);
    });

    withReadOptions(
        object
            .command('copy')
            .description('copy an entry as clipboard-envelope JSON (stdout or -o file)')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .argument('<index>', 'object index')
            .option('-o, --output <file>', 'write the JSON payload to a file instead of stdout')
    )
        .addHelpText('after', `
The payload uses the same JSON envelope as the GUI clipboard, so it can be
piped into 'canopen object paste' or pasted into the desktop/web editor.

Examples:
  canopen object copy a.eds 0x2000 | canopen object paste b.eds
  canopen object copy a.eds 0x2000 -o motor.json`)
        .action(async (file, indexArg, opts) => {
            const { model } = await loadModel(file, { format: opts.format });
            const index = parseIndex(indexArg);
            const entry = getEntry(model.objects, index);
            const payload = `${JSON.stringify(buildObjectPayload(index, entry), null, 2)}\n`;
            if (opts.output) await writeFile(opts.output, payload);
            else process.stdout.write(payload);
        });

    withEditOptions(
        object
            .command('paste')
            .description('insert an entry from clipboard-envelope JSON (stdin or --from file)')
            .argument('<file>', "file to edit ('-' is not supported here)")
            .option('--index <idx>', "target index (default: the payload's index)")
            .option('--from <json-file>', 'read the payload from a file instead of stdin')
            .option('--force', 'overwrite an existing entry at the target index')
    ).action(async (file, opts) => {
        if (file === '-' && !opts.from) {
            throw new CliError("stdin carries the payload; pass the file as a path (or use --from)");
        }
        const text = await readInput(opts.from ?? '-');
        const payload = parsePayload(text, CLIPBOARD_KIND.OBJECT);
        const index = opts.index !== undefined ? parseIndex(opts.index) : payload.index;
        const out = await editFile(file, opts, (model) => {
            if (model.objects?.[index] && !opts.force) {
                throw new CliError(`object ${hexIndex(index)} already exists (use --force to overwrite, or --index to retarget)`);
            }
            return { ...model, objects: { ...model.objects, [index]: structuredClone(payload.entry) } };
        });
        if (opts.json) emitOk(out, [hexIndex(index)]);
        else console.log(`pasted ${hexIndex(index)}`);
    });
}

export default register;
