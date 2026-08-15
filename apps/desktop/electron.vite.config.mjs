import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Strict CSP for the packaged app. Injected only on `build` so it never
// interferes with Vite's dev server / React Fast Refresh inline preamble.
// `style-src 'unsafe-inline'` is required for React's dynamic inline styles
// (e.g. PDO slot colors); production scripts are all external (no inline JS).
const PROD_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; object-src 'none'; base-uri 'self'"

function injectCsp() {
  return {
    name: 'inject-prod-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />\n  </head>`,
      )
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: { index: resolve(__dirname, 'electron/main.js') } },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: { index: resolve(__dirname, 'electron/preload.js') } },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: __dirname,
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
      commonjsOptions: {
        include: [/canopen-eds/, /canopen-xdd/, /node_modules/],
      },
    },
    plugins: [react(), injectCsp()],
    optimizeDeps: {
      // See apps/web/vite.config.js — same workspace-source handling.
      include: ['canopen-eds', 'canopen-xdd'],
      exclude: ['@canopen-editor/renderer', '@canopen-editor/core'],
    },
  },
})
