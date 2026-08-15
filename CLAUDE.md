# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

An editor for CANopen device description files. It parses, edits, and exports object
dictionaries in EDS, XDD, and CANopenNode (`OD.h`/`OD.c`) formats. The same React renderer
ships two ways, plus a scriptable CLI:

- **Web** (`apps/web`) — client-side SPA deployed as a static site to GitHub Pages.
- **Desktop** (`apps/desktop`) — Electron app with native open/save dialogs and inline
  save-in-place.
- **CLI** (`apps/cli`) — the `canopen` binary; full feature parity with the GUI
  (device metadata, object/sub-object CRUD, PDO mapping, convert/export) plus
  `--json` output and a `validate` command.

## Monorepo layout

pnpm workspaces + Turborepo. Five workspace projects:

```
packages/core       # @canopen-editor/core — framework-free domain barrel + type helpers
packages/renderer   # @canopen-editor/renderer — all React UI + lib/eds (the shared renderer)
apps/web            # @canopen-editor/web — thin Vite app, GitHub Pages target
apps/desktop        # @canopen-editor/desktop — Electron app (electron-vite + electron-builder)
apps/cli            # @canopen-editor/cli — `canopen` binary (commander, plain Node, no bundler)
```

`packages/renderer` and `packages/core` are consumed **as source** (their `package.json`
`exports` point at `src/`); each app's Vite build transpiles them. That's why both GUI apps
keep `optimizeDeps: { include: ['canopen-eds','canopen-xdd'], exclude:
['@canopen-editor/renderer','@canopen-editor/core'] }` — pre-bundle the leaf domain deps,
but let the workspace packages flow through the normal plugin pipeline (JSX + CSS Modules).

## Commands

Run from the repo root:

```bash
pnpm install                  # install all workspaces (runs Electron's binary postinstall)
pnpm dev:web                  # web dev server with HMR
pnpm dev:desktop              # Electron app in dev (renderer HMR + main auto-restart)
pnpm build                    # turbo: build every workspace
pnpm build:web                # web production build → apps/web/dist
pnpm build:desktop            # electron-vite build + electron-builder → apps/desktop/release
pnpm build:cli                # generate the CLI manpage (marked-man → apps/cli/man/canopen.1)
pnpm canopen -- <args>        # run the CLI from the repo root (no build step needed)
pnpm --filter @canopen-editor/desktop compile   # build main/preload/renderer only (no packaging)
pnpm lint                     # eslint over the whole repo (single root flat config)
pnpm preview                  # serve the web production build
```

ESLint is centralized: one root `eslint.config.mjs` plus the eslint deps live at the repo
root; sub-packages have no lint script. There is no test suite.

Electron's binary download runs via `pnpm.onlyBuiltDependencies` (in the root
`package.json`) on a fresh install. If `apps/desktop/node_modules/.../electron/dist` is
missing after install, run `node node_modules/.pnpm/electron@*/node_modules/electron/install.js`.

## Architecture

Single page (`EditorPage`); `App.jsx` renders it directly, no router.

### Domain logic lives in external packages, re-exported through one barrel

All CANopen parsing/serialization/PDO logic comes from the `canopen-eds` and `canopen-xdd`
dependencies (pure-JS CommonJS). **`packages/core/src/index.js` is the domain barrel**: it
re-exports their full API (via default-import + destructure, the CJS↔ESM interop pattern
that works in both plain Node and Vite) plus the shared helpers in `core/src/types.js`
(enum name maps, `dataTypeSize`, `isIntegerType`/`isFloatType`/`isStringType`/
`isContainerType`). The renderer's `packages/renderer/src/lib/eds/index.js` re-exports the
core barrel (with the `serializeXdd as writeXdd` alias) plus the UI-only `pdo-display.js`.
Renderer code imports from `lib/eds/index.js`; the CLI imports from `@canopen-editor/core`;
neither imports the npm packages directly — and check for an existing export before writing
new CANopen logic.

### CLI (`apps/cli`)

Plain Node ESM, no bundler; `commander` is the only runtime dep besides core. Layout:
`src/index.js` assembles the program; `src/commands/*.js` are file-per-noun modules
(`object`, `sub`, `pdo`, `device`, plus `new`/`info`/`convert`/`export-c`/`validate`/`docs`);
`src/lib/` holds the read-modify-write pipeline (`io.js`), arg parsing (`parse.js`), output
formatting (`format.js`), entry/sub0 editing (`edit.js`), PDO mutations with loud capacity
errors (`pdo-edit.js`), and `validate` rules (`validate-model.js`). Exit codes: 0 ok,
1 domain error, 2 usage, 3 validate errors. Mutating commands edit in place; `-o` redirects
(and converts by extension); `-` + `--format` does stdin/stdout. `object copy`/`paste` use
the same clipboard-envelope JSON as the GUI (`lib/clipboard.js` schema, duplicated
deliberately in `apps/cli/src/lib/edit.js`). The manpage source is `apps/cli/man/canopen.1.md`
(printed by `canopen docs`); `pnpm build:cli` generates troff via marked-man.

### State model

`EditorPage.jsx` owns all editor state (`eds`, `fileName`, `filePath`, `isDirty`,
`selectedIndex`, `activeTab`, `fileFormat`). The `eds` object is the parsed model
(`fileInfo`, `deviceInfo`, `comments`, and `objects` — an index-keyed dictionary whose
entries may have `subObjects`). State updates flow immutably through `updateEds(updater)`,
which also flips `isDirty`. Child components are presentational — slices of `eds` in,
`onChange` callbacks out. The four tabs (`device`, `od`, `txpdo`, `rxpdo`) are conditional
renders, not routes.

### Platform-abstracted file I/O (the key cross-cutting design)

The renderer does **no** direct browser/Electron file I/O. It consumes an injected
`FileService` via React context (`packages/renderer/src/platform/FileServiceContext.jsx`,
`useFileService()`). Serialization stays in `EditorPage`; the service only does the
read/write primitives:

- `openTextFile({ extensions })` → `{ name, path, content } | null` (`path` is null on web)
- `writeFile({ path, suggestedName, content, contentType, extensions })` → `{ name, path } | null`
  — `path` set means overwrite-in-place (desktop inline save); `path` null means Save dialog
  (desktop) / browser download (web). Export always passes `path: null`.
- optional `onMenuCommand(cb)` — desktop only; wires native menu / accelerators (New, Open,
  Save, Export) back into `EditorPage`.
- `writeClipboardObject(payload)` / `readClipboardObject()` → object-dictionary clipboard
  (cut/copy/paste). The renderer owns the JSON envelope schema (`lib/clipboard.js`); the
  service only carries it across the OS clipboard under a custom format (web: a `"web …"`
  ClipboardItem MIME; desktop: an Electron `clipboard` buffer format).
- optional `showNativeContextMenu(items)` — desktop only; pops a native OS context menu and
  resolves to the chosen item id. Absent on web, where the renderer falls back to a custom
  in-DOM `ContextMenu`. Both paths are unified by the `useContextMenu` hook.
- optional `showNativeDialog(options)` — desktop only; shows a native OS confirm/alert
  (`dialog.showMessageBox`) and resolves to a boolean. Absent on web, where the renderer falls
  back to a custom in-DOM `Dialog`. Both paths are unified by the `useDialog` hook; dialog
  messages must be plain strings so the native path can render them.

Each app provides the implementation and injects it at its entry point via
`<FileServiceProvider value={service}>`:

- `apps/web/src/platform/browserFileService.js` — transient `<input type="file">` +
  `FileReader`; `Blob` + `<a download>`.
- `apps/desktop/src/platform/electronFileService.js` — delegates to `window.electronAPI`
  (the preload bridge → IPC → `dialog`/`fs` in `apps/desktop/electron/main.js`).

When adding a platform primitive (file, clipboard, menu), add it to **both** services and the
`FileService` doc comment; don't reach for browser or Electron APIs inside the renderer.

### Electron security

`apps/desktop/electron/main.js` uses `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. The preload exposes only `ipcRenderer.invoke` wrappers via `contextBridge`.
A strict CSP is injected into the renderer HTML at build time by a small plugin in
`electron.vite.config.mjs` (build-only, so it never breaks the dev server / React Fast
Refresh).

## Conventions

`AGENTS.md` is the authoritative UI style guide — read it before any UI work. Highlights:

- **Visual style**: dark-mode sci-fi/FUI. All colors are CSS custom properties on `:root` in
  `packages/renderer/src/index.css`; never hard-code hex outside CSS variables.
- **Components**: one folder per component (`Component.jsx` + `Component.module.css`),
  functional only, CSS Modules. Page-local components nest under
  `pages/EditorPage/components/`.
- **Layout**: flexbox only, never CSS grid.
- **JS**: ES modules, `async/await` over `.then()`, `export default` at the bottom.

## Deployment

- **Web → Pages**: `.github/workflows/deploy.yml` (pnpm) builds `apps/web` with
  `VITE_BASE=/node-canopen-editor/` and publishes `apps/web/dist`. Locally
  `apps/web/vite.config.js` defaults `base` to `'./'`.
- **Desktop releases**: `.github/workflows/desktop-release.yml` runs on `v*` tags, builds on
  ubuntu/macos/windows, and publishes electron-builder artifacts to a GitHub Release.

## Version note

The two apps intentionally run different Vite majors: web is on Vite 8 (its original stack),
desktop is pinned to Vite 7 because `electron-vite` does not yet peer-support Vite 8. The
shared renderer is source-only (no Vite dep of its own), so it builds under both.
