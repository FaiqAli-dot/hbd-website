import { defineConfig } from 'vite'

// GitHub Pages serves this repo from branch `main` at folder `/` (root),
// under https://faiqali-dot.github.io/hbd-website/
// Built files are copied to the repo root by scripts/publish-root.mjs
export default defineConfig({
  base: '/hbd-website/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
  },
})
