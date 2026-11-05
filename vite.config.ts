import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  resolve: {
    alias: { '@aimux/ipc': fileURLToPath(new URL('../src/ipc/protocol.ts', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] }, port: 1420, strictPort: true },
})
