import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://wolfomania.github.io/chip-supply-chain/
  base: '/chip-supply-chain/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // three.js / globe.gl are large; the warning is expected once the Globe view lands.
    chunkSizeWarningLimit: 1200,
  },
})
