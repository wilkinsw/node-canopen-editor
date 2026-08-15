import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Set base to '/node-canopen-editor/' for GitHub Pages deployment.
// Override with VITE_BASE env var if hosting at a different path.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? './',
  optimizeDeps: {
    // canopen-eds / canopen-xdd are pulled in through the workspace renderer
    // package; pre-bundle them. Exclude the renderer itself so Vite serves its
    // source (JSX + CSS modules) through the normal plugin pipeline.
    include: ['canopen-eds', 'canopen-xdd'],
    exclude: ['@canopen-editor/renderer', '@canopen-editor/core'],
  },
})
