import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { getSeries } from './api/stocks.ts'

/**
 * Dev-only stand-in for the Vercel function at /api/stocks. It runs the same
 * `getSeries` the deployed edge function runs, so `npm run dev` and production
 * return identical payloads — only the caching is real in production.
 */
function stocksDevApi(): Plugin {
  return {
    name: 'stocks-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/stocks', async (req, res) => {
        // Mounted middleware sees the path with '/api/stocks' stripped.
        const params = new URL(req.url ?? '/', 'http://localhost').searchParams
        const { status, cacheControl, body } = await getSeries(params.get('symbol'), params.get('range'))
        res.statusCode = status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', cacheControl)
        res.end(JSON.stringify(body))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), stocksDevApi()],
  build: {
    outDir: 'dist',
    // three.js / globe.gl are large; the warning is expected once the Globe view lands.
    chunkSizeWarningLimit: 1200,
  },
})
