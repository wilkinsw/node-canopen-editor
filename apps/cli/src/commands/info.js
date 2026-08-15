import { getTxPdos, getRxPdos, getCategoryForIndex, CATEGORIES } from '@canopen-editor/core';
import { loadModel } from '../lib/io.js';
import { withReadOptions } from '../lib/options.js';
import { table, emitJson } from '../lib/format.js';

function register(program) {
    withReadOptions(
        program
            .command('info')
            .description('summarize a device description file')
            .argument('<file>', "input .eds/.xdd file ('-' = stdin)")
    )
        .addHelpText('after', `
Examples:
  canopen info device.eds
  canopen info device.xdd --json`)
        .action(async (file, opts) => {
            const { model, format } = await loadModel(file, { format: opts.format });
            const objects = model.objects ?? {};
            const indices = Object.keys(objects).map(Number);
            const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]));
            for (const index of indices) byCategory[getCategoryForIndex(index)] += 1;
            const summary = {
                file: file === '-' ? null : file,
                format,
                productName: model.deviceInfo?.productName ?? '',
                vendorName: model.deviceInfo?.vendorName ?? '',
                fileVersion: model.fileInfo?.fileVersion ?? '',
                description: model.fileInfo?.description ?? '',
                objectCount: indices.length,
                objectsByCategory: byCategory,
                txPdoCount: getTxPdos(objects).length,
                rxPdoCount: getRxPdos(objects).length,
            };
            if (opts.json) {
                emitJson(summary);
                return;
            }
            const rows = [
                ['Format', summary.format],
                ['Product', summary.productName],
                ['Vendor', summary.vendorName],
                ['File version', summary.fileVersion],
                ['Description', summary.description],
                ['Objects', String(summary.objectCount)],
                ...CATEGORIES.map((c) => [`  ${c.label}`, String(byCategory[c.key])]),
                ['TX PDOs', String(summary.txPdoCount)],
                ['RX PDOs', String(summary.rxPdoCount)],
            ];
            console.log(table(rows));
        });
}

export default register;
