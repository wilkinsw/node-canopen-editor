/**
 * `canopen sub` — sub-objects of ARRAY/RECORD entries.
 *
 * Sub-object 0 is the structural "highest sub-index supported" slot: it
 * cannot be removed, and add/rm keep its defaultValue current — the same
 * bookkeeping as the GUI.
 */

import { writeFile } from 'node:fs/promises';
import { createSubEntry, isContainerType } from '@canopen-editor/core';
import { CliError } from '../lib/errors.js';
import { loadModel, editFile, readInput } from '../lib/io.js';
import { withReadOptions, withEditOptions, withFieldOptions } from '../lib/options.js';
import { parseIndex, parseRef } from '../lib/parse.js';
import { emitOk, hexIndex, refLabel } from '../lib/format.js';
import {
    getEntry, getSubEntry, applyEntryOptions, appendSubObject, removeSubObject,
    buildSubObjectPayload, parsePayload, CLIPBOARD_KIND,
} from '../lib/edit.js';

function getContainer(objects, index) {
    const entry = getEntry(objects, index);
    if (!isContainerType(entry.objectType)) {
        throw new CliError(`object ${hexIndex(index)} is not an ARRAY/RECORD and has no sub-objects`);
    }
    return entry;
}

function requireSub(ref, what = 'reference') {
    if (ref.subIndex == null) {
        throw new CliError(`${what} must include a sub-index (e.g. 0x2000.1)`);
    }
    return ref;
}

function register(program) {
    const sub = program
        .command('sub')
        .description('add, edit, and remove sub-objects of ARRAY/RECORD entries');

    withFieldOptions(withEditOptions(
        sub
            .command('add')
            .description('append a sub-object at the next free sub-index')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<index>', 'parent object index')
    ), { topLevel: false })
        .addHelpText('after', `
Examples:
  canopen sub add device.eds 0x2000 --name Speed --data-type INTEGER16 --access rw --pdo-mapping`)
        .action(async (file, indexArg, opts) => {
            const index = parseIndex(indexArg);
            let subIndex;
            const out = await editFile(file, opts, (model) => {
                const entry = getContainer(model.objects, index);
                const base = createSubEntry(opts.name ?? undefined);
                const { entry: prepared } = applyEntryOptions(base, { ...opts, name: undefined }, { topLevel: false });
                const result = appendSubObject(entry, prepared);
                subIndex = result.subIndex;
                return { ...model, objects: { ...model.objects, [index]: result.entry } };
            });
            if (opts.json) emitOk(out, [refLabel(index, subIndex)]);
            else console.log(`added ${refLabel(index, subIndex)}`);
        });

    withFieldOptions(withEditOptions(
        sub
            .command('set')
            .description('edit fields of an existing sub-object')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<ref>', 'sub-object reference, e.g. 0x2000.1')
    ), { topLevel: false })
        .addHelpText('after', `
Examples:
  canopen sub set device.eds 0x2000.1 --name "Motor Speed" --default 100`)
        .action(async (file, refArg, opts) => {
            const { index, subIndex } = requireSub(parseRef(refArg));
            let changed = [];
            const out = await editFile(file, opts, (model) => {
                const entry = getContainer(model.objects, index);
                const subEntry = getSubEntry(entry, index, subIndex);
                const result = applyEntryOptions(subEntry, opts, { topLevel: false });
                changed = result.changed;
                if (!changed.length) throw new CliError('no fields given (see --help)');
                const updated = {
                    ...entry,
                    subObjects: { ...entry.subObjects, [subIndex]: result.entry },
                };
                return { ...model, objects: { ...model.objects, [index]: updated } };
            });
            if (opts.json) emitOk(out, changed.map((f) => `${refLabel(index, subIndex)}.${f}`));
        });

    withEditOptions(
        sub
            .command('rm')
            .description('remove a sub-object (sub 0 is refused)')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<ref>', 'sub-object reference, e.g. 0x2000.3')
    ).action(async (file, refArg, opts) => {
        const { index, subIndex } = requireSub(parseRef(refArg));
        const out = await editFile(file, opts, (model) => {
            const entry = getContainer(model.objects, index);
            const updated = removeSubObject(entry, index, subIndex);
            return { ...model, objects: { ...model.objects, [index]: updated } };
        });
        if (opts.json) emitOk(out, [refLabel(index, subIndex)]);
        else console.log(`removed ${refLabel(index, subIndex)}`);
    });

    withReadOptions(
        sub
            .command('copy')
            .description('copy a sub-object as clipboard-envelope JSON (stdout or -o file)')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .argument('<ref>', 'sub-object reference, e.g. 0x2000.1')
            .option('-o, --output <file>', 'write the JSON payload to a file instead of stdout')
    ).action(async (file, refArg, opts) => {
        const { model } = await loadModel(file, { format: opts.format });
        const { index, subIndex } = requireSub(parseRef(refArg));
        const entry = getContainer(model.objects, index);
        const subEntry = getSubEntry(entry, index, subIndex);
        const payload = `${JSON.stringify(buildSubObjectPayload(subIndex, subEntry), null, 2)}\n`;
        if (opts.output) await writeFile(opts.output, payload);
        else process.stdout.write(payload);
    });

    withEditOptions(
        sub
            .command('paste')
            .description('append a sub-object from clipboard-envelope JSON (stdin or --from file)')
            .argument('<file>', "file to edit ('-' is not supported here)")
            .argument('<index>', 'parent object index')
            .option('--from <json-file>', 'read the payload from a file instead of stdin')
    )
        .addHelpText('after', `
Like the GUI, paste always appends at the next free sub-index; the payload's
original sub-index is ignored.

Examples:
  canopen sub copy a.eds 0x2000.1 | canopen sub paste b.eds 0x3000`)
        .action(async (file, indexArg, opts) => {
            if (file === '-' && !opts.from) {
                throw new CliError('stdin carries the payload; pass the file as a path (or use --from)');
            }
            const index = parseIndex(indexArg);
            const text = await readInput(opts.from ?? '-');
            const payload = parsePayload(text, CLIPBOARD_KIND.SUB_OBJECT);
            let subIndex;
            const out = await editFile(file, opts, (model) => {
                const entry = getContainer(model.objects, index);
                const result = appendSubObject(entry, payload.sub);
                subIndex = result.subIndex;
                return { ...model, objects: { ...model.objects, [index]: result.entry } };
            });
            if (opts.json) emitOk(out, [refLabel(index, subIndex)]);
            else console.log(`pasted ${refLabel(index, subIndex)}`);
        });
}

export default register;
