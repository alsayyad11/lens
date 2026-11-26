import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
// `vite build` -> dist/ (for hosting). `vite build --mode single` -> one self-contained LENS.html that opens by double-click.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 900 },
}))
