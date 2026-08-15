/**
 * `canopen pdo` — transmit/receive PDO communication parameters and
 * mappings. PDOs are addressed as `tx|rx <n>` where <n> is the PDO id
 * shown by `pdo list` (the communication index, e.g. 0x1800, also works).
 */

import { addNewPdo, deletePdo } from '@canopen-editor/core';
import { CliError } from '../lib/errors.js';
import { loadModel, editFile } from '../lib/io.js';
import { withReadOptions, withEditOptions } from '../lib/options.js';
import { parseRef } from '../lib/parse.js';
import { table, emitJson, emitOk, hexIndex, refLabel } from '../lib/format.js';
import {
    getPdos, resolvePdo, addMappings, removeMapping, reorderMapping,
    setPdoParams, PDO_MAX_BITS,
} from '../lib/pdo-edit.js';

function parseDir(dir) {
    const d = String(dir).toLowerCase();
    if (d === 'tx') return false;
    if (d === 'rx') return true;
    throw new CliError(`expected 'tx' or 'rx', got '${dir}'`);
}

function mappingName(objects, m) {
    const entry = objects[m.index];
    if (!entry) return '(missing)';
    if (m.subIndex > 0 && entry.subObjects?.[m.subIndex]) {
        return entry.subObjects[m.subIndex].parameterName ?? '';
    }
    return entry.parameterName ?? '';
}

function bitBar(mappings) {
    let bar = '';
    mappings.forEach((m, i) => {
        bar += (i % 2 === 0 ? '#' : '=').repeat(m.bits);
    });
    return `[${bar.padEnd(PDO_MAX_BITS, '.')}]`;
}

function pdoJson(objects, pdo) {
    return {
        ...pdo,
        commIndexHex: hexIndex(pdo.commIndex),
        mappingIndexHex: hexIndex(pdo.mappingIndex),
        mappings: pdo.mappings.map((m) => ({
            ...m,
            ref: refLabel(m.index, m.subIndex),
            name: mappingName(objects, m),
        })),
    };
}

function register(program) {
    const pdo = program
        .command('pdo')
        .description('view and edit transmit/receive PDOs');

    withReadOptions(
        pdo
            .command('list')
            .description('list PDOs with comm parameters and mapping summaries')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .option('--tx', 'only transmit PDOs')
            .option('--rx', 'only receive PDOs')
    ).action(async (file, opts) => {
        const { model } = await loadModel(file, { format: opts.format });
        const objects = model.objects ?? {};
        const dirs = [];
        if (opts.tx || !opts.rx) dirs.push(false);
        if (opts.rx || !opts.tx) dirs.push(true);
        if (opts.json) {
            const result = {};
            for (const isRx of dirs) {
                result[isRx ? 'rx' : 'tx'] = getPdos(objects, isRx).map((p) => pdoJson(objects, p));
            }
            emitJson(result);
            return;
        }
        let first = true;
        for (const isRx of dirs) {
            const pdos = getPdos(objects, isRx);
            if (!first) console.log('');
            console.log(isRx ? 'RX PDOs' : 'TX PDOs');
            if (!pdos.length) {
                console.log('  (none)');
                first = false;
                continue;
            }
            const rows = pdos.map((p) => [
                String(p.id),
                hexIndex(p.commIndex),
                `0x${p.cobId.toString(16).toUpperCase().padStart(3, '0')}`,
                String(p.transmissionType),
                p.disabled ? 'yes' : '',
                `${p.mappings.reduce((sum, m) => sum + m.bits, 0)}/${PDO_MAX_BITS}`,
                p.mappings.map((m) => refLabel(m.index, m.subIndex)).join(' '),
            ]);
            console.log(table(rows, ['Id', 'Comm', 'COB-ID', 'Type', 'Off', 'Bits', 'Mappings']));
            first = false;
        }
    });

    withReadOptions(
        pdo
            .command('show')
            .description('show one PDO: comm parameters, mapping table, and bit map')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id (from pdo list) or comm index (e.g. 0x1800)')
    ).action(async (file, dir, n, opts) => {
        const isRx = parseDir(dir);
        const { model } = await loadModel(file, { format: opts.format });
        const objects = model.objects ?? {};
        const p = resolvePdo(objects, isRx, n);
        if (opts.json) {
            emitJson(pdoJson(objects, p));
            return;
        }
        console.log(table([
            ['Id', String(p.id)],
            ['Comm index', hexIndex(p.commIndex)],
            ['Mapping index', hexIndex(p.mappingIndex)],
            ['COB-ID', `0x${p.cobId.toString(16).toUpperCase().padStart(3, '0')}`],
            ['Disabled', p.disabled ? 'yes' : 'no'],
            ['Transmission type', String(p.transmissionType)],
            ['Inhibit time', String(p.inhibitTime)],
            ['Event timer', String(p.eventTimer)],
            ['Sync start', String(p.syncStart)],
            ['Bits used', `${p.mappings.reduce((sum, m) => sum + m.bits, 0)}/${PDO_MAX_BITS}`],
        ]));
        if (p.mappings.length) {
            const rows = p.mappings.map((m, i) => [
                String(i + 1),
                refLabel(m.index, m.subIndex),
                mappingName(objects, m),
                String(m.bits),
            ]);
            console.log(`\nMappings:\n${table(rows, ['Slot', 'Ref', 'Name', 'Bits'])}`);
        }
        console.log(`\n${bitBar(p.mappings)}`);
    });

    withEditOptions(
        pdo
            .command('add')
            .description('add a new PDO at the next free comm index')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
    ).action(async (file, dir, opts) => {
        const isRx = parseDir(dir);
        let added;
        const out = await editFile(file, opts, (model) => {
            const before = new Set(getPdos(model.objects, isRx).map((p) => p.id));
            const objects = addNewPdo(model.objects, isRx);
            added = getPdos(objects, isRx).find((p) => !before.has(p.id));
            return { ...model, objects };
        });
        if (opts.json) emitOk(out, [added ? `${dir} ${added.id}` : dir]);
        else if (added) {
            console.log(`added ${dir.toLowerCase()} PDO ${added.id} (comm ${hexIndex(added.commIndex)}, mapping ${hexIndex(added.mappingIndex)})`);
        }
    });

    withEditOptions(
        pdo
            .command('rm')
            .description('remove a PDO (comm and mapping objects)')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id or comm index')
    ).action(async (file, dir, n, opts) => {
        const isRx = parseDir(dir);
        let removed;
        const out = await editFile(file, opts, (model) => {
            const p = resolvePdo(model.objects, isRx, n);
            removed = p.id;
            return { ...model, objects: deletePdo(model.objects, p.id, isRx) };
        });
        if (opts.json) emitOk(out, [`${dir} ${removed}`]);
        else console.log(`removed ${dir.toLowerCase()} PDO ${removed}`);
    });

    withEditOptions(
        pdo
            .command('set')
            .description('set communication parameters of a PDO')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id or comm index')
            .option('--cob-id <id>', 'COB-ID (hex 0x181 or decimal; masked to 11 bits)')
            .option('--transmission-type <n>', 'transmission type (0 – 255)')
            .option('--inhibit-time <n>', 'inhibit time')
            .option('--event-timer <n>', 'event timer')
            .option('--sync-start <n>', 'sync start value')
            .option('--disabled', 'mark the PDO invalid (sets COB-ID bit 31)')
            .option('--enabled', 'mark the PDO valid')
    )
        .addHelpText('after', `
Examples:
  canopen pdo set device.eds tx 1 --cob-id 0x181 --transmission-type 254
  canopen pdo set device.eds tx 1 --event-timer 1000 --enabled`)
        .action(async (file, dir, n, opts) => {
            const isRx = parseDir(dir);
            let changed = [];
            const out = await editFile(file, opts, (model) => {
                const p = resolvePdo(model.objects, isRx, n);
                const result = setPdoParams(model.objects, isRx, p, {
                    ...opts,
                    disabled: opts.disabled ? true : opts.enabled ? false : undefined,
                });
                changed = result.changed;
                return { ...model, objects: result.objects };
            });
            if (opts.json) emitOk(out, changed.map((f) => `${dir} ${n} ${f}`));
        });

    withEditOptions(
        pdo
            .command('map')
            .description('map one or more objects into a PDO')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id or comm index')
            .argument('<refs...>', 'objects to map: index[.sub], e.g. 0x2000.1')
            .option('--at <slot>', 'insert at this 1-based slot instead of appending')
    )
        .addHelpText('after', `
Targets must have pdoMapping=true and a fixed-size data type. Exceeds of the
64-bit / 8-slot PDO capacity are errors.

Examples:
  canopen pdo map device.eds tx 1 0x2000.1 0x2000.2
  canopen pdo map device.eds rx 1 0x6040 --at 1`)
        .action(async (file, dir, n, refArgs, opts) => {
            const isRx = parseDir(dir);
            const refs = refArgs.map(parseRef);
            const at = opts.at !== undefined ? Number(opts.at) : null;
            if (at !== null && (!Number.isInteger(at) || at < 1)) {
                throw new CliError(`invalid --at '${opts.at}'`);
            }
            const out = await editFile(file, opts, (model) => {
                const p = resolvePdo(model.objects, isRx, n);
                return { ...model, objects: addMappings(model.objects, isRx, p, refs, at) };
            });
            const labels = refs.map((r) => refLabel(r.index, r.subIndex));
            if (opts.json) emitOk(out, labels);
            else console.log(`mapped ${labels.join(', ')}`);
        });

    withEditOptions(
        pdo
            .command('unmap')
            .description('remove a mapping by slot number or object reference')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id or comm index')
            .argument('<slot-or-ref>', 'slot number (1-based, see pdo show) or 0x-prefixed reference')
    ).action(async (file, dir, n, slotOrRef, opts) => {
        const isRx = parseDir(dir);
        const out = await editFile(file, opts, (model) => {
            const p = resolvePdo(model.objects, isRx, n);
            return { ...model, objects: removeMapping(model.objects, isRx, p, slotOrRef) };
        });
        if (opts.json) emitOk(out, [slotOrRef]);
        else console.log(`unmapped ${slotOrRef}`);
    });

    withEditOptions(
        pdo
            .command('reorder')
            .description('move a mapping from one slot to another')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<dir>', 'tx or rx')
            .argument('<n>', 'PDO id or comm index')
            .argument('<from>', 'source slot (1-based)')
            .argument('<to>', 'destination slot (1-based)')
    ).action(async (file, dir, n, from, to, opts) => {
        const isRx = parseDir(dir);
        const fromSlot = Number(from);
        const toSlot = Number(to);
        if (!Number.isInteger(fromSlot) || !Number.isInteger(toSlot)) {
            throw new CliError('slots must be integers');
        }
        const out = await editFile(file, opts, (model) => {
            const p = resolvePdo(model.objects, isRx, n);
            return { ...model, objects: reorderMapping(model.objects, isRx, p, fromSlot, toSlot) };
        });
        if (opts.json) emitOk(out, [`${from}->${to}`]);
        else console.log(`moved slot ${from} to ${to}`);
    });
}

export default register;
