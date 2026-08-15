/**
 * Bundle the workspace CLI (apps/cli) into a single self-contained ESM file
 * so the packaged desktop app can ship it and run it on its own Electron
 * binary in Node mode (ELECTRON_RUN_AS_NODE) — no system Node.js required.
 *
 * Output (dist/cli/):
 *   canopen.mjs    bundled CLI (shipped into resources/cli via extraResources)
 *   canopen.1.md   manual source, read by `canopen docs` (same location)
 *   canopen        /usr/bin wrapper script        (Linux only; mapped by fpm)
 *   canopen.1.gz   gzipped manpage for man-db     (Linux only; mapped by fpm)
 */

import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(__dirname, '../../cli');
const outDir = resolve(__dirname, '../dist/cli');

// Must match electron-builder's install layout: /opt/<productName>/ with the
// app binary named <executableName> and extraResources under resources/.
const APP_DIR = '/opt/CANopen Editor';
const APP_BIN = 'canopen-editor';

const pkg = JSON.parse(await readFile(resolve(cliDir, 'package.json'), 'utf8'));

await mkdir(outDir, { recursive: true });

await build({
    entryPoints: [resolve(cliDir, 'src/index.js')],
    outfile: resolve(outDir, 'canopen.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    define: { 'process.env.CANOPEN_CLI_VERSION': JSON.stringify(pkg.version) },
    // The createRequire shim lets the CJS deps (commander, canopen-eds/xdd)
    // require node builtins from inside the ESM bundle.
    banner: {
        js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from \'node:module\'; const require = __createRequire(import.meta.url);',
    },
    logLevel: 'warning',
});

await copyFile(resolve(cliDir, 'man/canopen.1.md'), resolve(outDir, 'canopen.1.md'));

if (process.platform === 'linux') {
    const wrapper = `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec "${APP_DIR}/${APP_BIN}" "${APP_DIR}/resources/cli/canopen.mjs" "$@"
`;
    await writeFile(resolve(outDir, 'canopen'), wrapper, { mode: 0o755 });

    const troff = execFileSync(
        resolve(cliDir, 'node_modules/.bin/marked-man'),
        [resolve(cliDir, 'man/canopen.1.md')],
    );
    await writeFile(resolve(outDir, 'canopen.1.gz'), gzipSync(troff, { level: 9 }));
}

console.log(`bundled canopen CLI v${pkg.version} -> ${outDir}`);
