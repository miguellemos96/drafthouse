// Starts the server: `node server/main.ts` (or `npm start`). Runs as TypeScript, no build step.
//
// Environment:
// - `PORT`: the port to listen on (default 8787). Render sets it.
// - `CLIENT_IP_HEADER`: the header a trusted proxy puts the visitor IP in, for the
//   rate limit (`true-client-ip` on Render). Unset: the socket address is used.

import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { fetchOnce, lookup } from './reader/http.ts'
import { createRateLimiter } from './reader/safety.ts'

const port = Number(process.env.PORT ?? 8787)
const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const clientIpHeader = process.env.CLIENT_IP_HEADER || undefined

const server = createApp({ distDir, clientIpHeader, readLink: { lookup, fetchOnce, allow: createRateLimiter() } })
// No host argument on purpose: Node then listens on every interface, not on localhost
// only, so a host like Render can reach it from outside the container.
server.listen(port, () => {
  console.log(`DraftHouse on http://localhost:${port}`)
})
