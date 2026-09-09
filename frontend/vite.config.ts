/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'

/** GitHub project pages use https://<user>.github.io/<repo>/ - base must match */
function pagesBase(): string {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH
  const name = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return name ? `./${name}/` : './'
}

// In dev, proxy API calls to FastAPI
export default defineConfig(() => ({
    base: pagesBase(),
    plugins: [
      react(),
    ],
    // Ketcher internally references Node.js globals (global, process.env)
    // that don't exist in browser / Vite environments.
    define: {
      'process.env.PUBLIC_URL': JSON.stringify(''),
      'process.env.MODE': JSON.stringify('standalone'),
      'global': 'window',
    },
    resolve: {
      alias: {
        // Force all references to raphael to point to the actual module
        'raphael': 'raphael/raphael.js',
      },
    },
    optimizeDeps: {
      include: ['ketcher-react', 'ketcher-standalone', 'raphael'],
      esbuildOptions: {
        define: { global: 'globalThis' },
        plugins: [
          NodeGlobalsPolyfillPlugin({ process: true, buffer: true }),
        ],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          nmrglueGUI: 'nmrglueGUI.html',
        },
      },
      commonjsOptions: {
        // Ketcher's lazy-loaded chunk contains raw require() calls.
        // This tells Rollup's CJS plugin to transform every node_modules
        // file (including dynamic chunks) into proper ESM.
        transformMixedEsModules: true,
        include: [/raphael/, /node_modules/],
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        },
        '/examples': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        },
        '/references': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        },
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    },
}))
