import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['**/dist', '**/out', '**/node_modules']),
  // Renderer / browser code (React)
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['apps/desktop/electron/**', 'apps/cli/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Node-context files: build configs + Electron main / preload + CLI
  {
    files: [
      '**/*.config.{js,mjs,cjs}',
      'apps/desktop/electron/**/*.{js,cjs,mjs}',
      'apps/cli/**/*.{js,cjs,mjs}',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
