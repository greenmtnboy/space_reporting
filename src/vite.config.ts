import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    vue(),
    // Polyfill Node crypto and stream for trilogy-studio-components
    nodePolyfills({ include: ['crypto', 'stream'] }),
  ],
  base: '/space_reporting/',
})
