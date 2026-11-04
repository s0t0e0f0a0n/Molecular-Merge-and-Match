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
      'global': 'globalThis', //  Changed from 'window' to 'globalThis'
},
    resolve: {
      alias: {
        // Force all references to raphael to point to the actual module
        'raphael': 'raphael/raphael.js',
      },
    },
    optimizeDeps: {
      include: [
        'ketcher-react',
        'ketcher-standalone',
        'raphael',
        'classnames',
        'lodash/debounce.js',
        'lodash/throttle.js',
        'lodash/set.js',
        'lodash/merge.js',
        'lodash/mergeWith.js',
        'lodash/has.js',
        'lodash/cloneDeep.js',
        'lodash/isEqual.js',
        'lodash/map.js',
        'lodash.escaperegexp',
        'lodash.debounce',
        '@emotion/react',
        '@emotion/styled',
        '@hookform/resolvers',
        'dlv',
        'eventemitter3',
        'file-saver',
        'immer',
        'mf-parser',
        'ml-tree-similarity',
        'numeral',
        'papaparse',
        'react-dropzone',
        'react-hook-form',
        'react-icons',
        'react-rnd',
        'yup',
      ],
      exclude: ['nmrium'],
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
          NMRium: 'NMRium.html',
          NMRiumF8: 'NMRiumF8.html',
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
        '/nmrium-temp': {
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
