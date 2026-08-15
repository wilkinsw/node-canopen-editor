/**
 * `canopen device` — file/device metadata and comments.
 *
 * Keys mirror the GUI's Device tab:
 *   fileInfo.<field>    fileName fileVersion fileRevision edsVersion description
 *                       creationTime creationDate createdBy
 *                       modificationTime modificationDate modifiedBy
 *   deviceInfo.<field>  vendorName vendorNumber productName productNumber
 *                       revisionNumber orderCode granularity dynamicChannelsSupported
 *   baud.<rate>         10 20 50 125 250 500 800 1000            (boolean)
 *   feature.<flag>      simpleBootUpMaster simpleBootUpSlave
 *                       groupMessaging lssSupported              (boolean)
 */

import { CliError } from '../lib/errors.js';
import { loadModel, editFile } from '../lib/io.js';
import { withReadOptions, withEditOptions } from '../lib/options.js';
import { parseBool, parseKeyValue, parseNumber } from '../lib/parse.js';
import { table, emitJson, emitOk } from '../lib/format.js';

const FILE_INFO_KEYS = [
    'fileName', 'fileVersion', 'fileRevision', 'edsVersion', 'description',
    'creationTime', 'creationDate', 'createdBy',
    'modificationTime', 'modificationDate', 'modifiedBy',
];
const DEVICE_TEXT_KEYS = [
    'vendorName', 'vendorNumber', 'productName', 'productNumber',
    'revisionNumber', 'orderCode',
];
const DEVICE_NUMBER_KEYS = ['granularity', 'dynamicChannelsSupported'];
const BAUD_RATES = ['10', '20', '50', '125', '250', '500', '800', '1000'];
const FEATURE_KEYS = [
    'simpleBootUpMaster', 'simpleBootUpSlave', 'groupMessaging', 'lssSupported',
];

/** Resolve a dotted key to { section, field, type }. Throws on unknown keys. */
function resolveKey(key) {
    const [section, field, extra] = String(key).split('.');
    if (extra !== undefined) throw new CliError(`unknown key '${key}'`);
    if (section === 'fileInfo' && FILE_INFO_KEYS.includes(field)) {
        return { section: 'fileInfo', field, type: 'string' };
    }
    if (section === 'deviceInfo') {
        if (DEVICE_TEXT_KEYS.includes(field)) return { section: 'deviceInfo', field, type: 'string' };
        if (DEVICE_NUMBER_KEYS.includes(field)) return { section: 'deviceInfo', field, type: 'number' };
    }
    if (section === 'baud' && BAUD_RATES.includes(field)) {
        return { section: 'deviceInfo', field: `baudRate${field}`, type: 'boolean' };
    }
    if (section === 'feature' && FEATURE_KEYS.includes(field)) {
        return { section: 'deviceInfo', field, type: 'boolean' };
    }
    throw new CliError(`unknown key '${key}' (see 'canopen device set --help')`);
}

function coerce(value, type, key) {
    if (type === 'boolean') return parseBool(value, `for ${key}`);
    if (type === 'number') return parseNumber(value, `value for ${key}`);
    return value;
}

function deviceSummary(model) {
    return {
        fileInfo: Object.fromEntries(FILE_INFO_KEYS.map((k) => [k, model.fileInfo?.[k] ?? ''])),
        deviceInfo: Object.fromEntries(
            [...DEVICE_TEXT_KEYS, ...DEVICE_NUMBER_KEYS].map((k) => [k, model.deviceInfo?.[k] ?? ''])
        ),
        baud: Object.fromEntries(
            BAUD_RATES.map((r) => [r, Boolean(model.deviceInfo?.[`baudRate${r}`])])
        ),
        feature: Object.fromEntries(
            FEATURE_KEYS.map((k) => [k, Boolean(model.deviceInfo?.[k])])
        ),
        comments: model.comments ?? [],
    };
}

function register(program) {
    const device = program
        .command('device')
        .description('view and edit file/device metadata and comments');

    withReadOptions(
        device
            .command('show')
            .description('show all metadata fields')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
    ).action(async (file, opts) => {
        const { model } = await loadModel(file, { format: opts.format });
        const summary = deviceSummary(model);
        if (opts.json) {
            emitJson(summary);
            return;
        }
        const rows = [];
        for (const [section, fields] of Object.entries(summary)) {
            if (section === 'comments') continue;
            for (const [field, value] of Object.entries(fields)) {
                rows.push([`${section}.${field}`, String(value)]);
            }
        }
        console.log(table(rows, ['Key', 'Value']));
        if (summary.comments.length) {
            console.log(`\nComments:\n${summary.comments.join('\n')}`);
        }
    });

    withReadOptions(
        device
            .command('get')
            .description('print a single metadata value')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
            .argument('<key>', 'dotted key, e.g. deviceInfo.vendorName or baud.500')
    )
        .addHelpText('after', `
Examples:
  canopen device get device.eds deviceInfo.productName
  canopen device get device.eds baud.500`)
        .action(async (file, key, opts) => {
            const { model } = await loadModel(file, { format: opts.format });
            const { section, field } = resolveKey(key);
            const value = model[section]?.[field] ?? '';
            if (opts.json) emitJson({ key, value });
            else console.log(String(value));
        });

    withEditOptions(
        device
            .command('set')
            .description('set one or more metadata values')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<assignments...>', 'key=value pairs')
    )
        .addHelpText('after', `
Keys:
  fileInfo.{${FILE_INFO_KEYS.join('|')}}
  deviceInfo.{${[...DEVICE_TEXT_KEYS, ...DEVICE_NUMBER_KEYS].join('|')}}
  baud.{${BAUD_RATES.join('|')}}          (true/false)
  feature.{${FEATURE_KEYS.join('|')}}     (true/false)

Examples:
  canopen device set device.eds deviceInfo.vendorName=Acme baud.500=true
  canopen device set device.eds fileInfo.description="Motor controller"`)
        .action(async (file, assignments, opts) => {
            const changed = [];
            const out = await editFile(file, opts, (model) => {
                const updated = { ...model, fileInfo: { ...model.fileInfo }, deviceInfo: { ...model.deviceInfo } };
                for (const assignment of assignments) {
                    const { key, value } = parseKeyValue(assignment);
                    const { section, field, type } = resolveKey(key);
                    updated[section][field] = coerce(value, type, key);
                    changed.push(key);
                }
                return updated;
            });
            if (opts.json) emitOk(out, changed);
        });

    const comment = device
        .command('comment')
        .description('view and edit the free-form comment lines');

    withReadOptions(
        comment
            .command('list')
            .description('print comment lines (numbered)')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
    ).action(async (file, opts) => {
        const { model } = await loadModel(file, { format: opts.format });
        const comments = model.comments ?? [];
        if (opts.json) {
            emitJson(comments);
            return;
        }
        comments.forEach((line, i) => console.log(`${i + 1}: ${line}`));
    });

    withEditOptions(
        comment
            .command('add')
            .description('append comment lines')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<text...>', 'lines to append')
    ).action(async (file, text, opts) => {
        const out = await editFile(file, opts, (model) => ({
            ...model,
            comments: [...(model.comments ?? []), ...text],
        }));
        if (opts.json) emitOk(out, ['comments']);
    });

    withEditOptions(
        comment
            .command('rm')
            .description('remove a comment line by number (1-based, see comment list)')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
            .argument('<line>', 'line number to remove')
    ).action(async (file, line, opts) => {
        const n = parseNumber(line, 'line number');
        const out = await editFile(file, opts, (model) => {
            const comments = model.comments ?? [];
            if (n < 1 || n > comments.length) {
                throw new CliError(`no comment line ${n} (file has ${comments.length})`);
            }
            return { ...model, comments: comments.filter((_, i) => i !== n - 1) };
        });
        if (opts.json) emitOk(out, ['comments']);
    });

    withEditOptions(
        comment
            .command('clear')
            .description('remove all comment lines')
            .argument('<file>', "file to edit ('-' = stdin, writes stdout)")
    ).action(async (file, opts) => {
        const out = await editFile(file, opts, (model) => ({ ...model, comments: [] }));
        if (opts.json) emitOk(out, ['comments']);
    });
}

export default register;
