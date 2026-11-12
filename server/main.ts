// Starts the server: `node server/main.ts` (or `npm start`). Runs as TypeScript, no build step.

import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { fetchOnce, lookup } from './reader/http.ts'
import { createRateLimiter } from './reader/safety.ts'

const port = Number(process.env.PORT ?? 8787)
const distDir = fileURLToPath(new URL('../dist/', import.meta.url))

const server = createApp({ distDir, readLink: { lookup, fetchOnce, allow: createRateLimiter() } })
server.listen(port, () => {
  console.log(`DraftHouse on http://localhost:${port}`)
})
