import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    // Polyfill Node crypto and stream for trilogy-studio-components
    nodePolyfills({
      include: ['crypto', 'stream'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  base: '/space_reporting/',
  resolve: {
    alias: {
      // Stub out @motherduck/wasm-client since it's dynamically imported by trilogy-studio-components
      // but not actually used in this project
      '@motherduck/wasm-client': path.resolve(__dirname, 'src/stubs/motherduck-stub.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@motherduck/wasm-client'],
  },
  build: {
    rollupOptions: {
      external: ['@motherduck/wasm-client'],
    },
  },
})
