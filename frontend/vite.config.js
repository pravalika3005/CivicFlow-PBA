import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The website calls /api/... on its own address; Vite forwards those calls to the backend.
// 127.0.0.1 (not "localhost") is used on purpose: it is exactly where uvicorn listens,
// so Windows IPv4/IPv6 name resolution cannot get in the way.
const backend = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'
const proxy = { '/api': { target: backend } }

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    css: false,
  },
})
