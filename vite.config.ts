import { defineConfig } from 'vite'

export default defineConfig({
  base: '/hbd-website/',
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: true,
  },
})
