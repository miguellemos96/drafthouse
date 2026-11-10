// The HTTP server: the built site from `dist/` and `POST /api/read-link`.

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { readLink, type ReadLinkDeps } from './readLink.ts'

export interface AppOptions {
  distDir: string
  readLink: ReadLinkDeps
}

const MAX_REQUEST_BYTES = 16 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const sendJson = (res: ServerResponse, status: number, json: unknown) => {
  const body = JSON.stringify(json)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** The request body as JSON, or undefined if it is too big or not JSON. */
const readJson = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) return undefined
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

const fileIn = async (dir: string, file: string) => {
  try {
    return (await stat(path.join(dir, file))).isFile() ? path.join(dir, file) : undefined
  } catch {
    return undefined
  }
}

const serveStatic = async (req: IncomingMessage, res: ServerResponse, distDir: string) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  const root = path.resolve(distDir)
  const wanted = path.resolve(root, `.${pathname}`)
  if (wanted !== root && !wanted.startsWith(root + path.sep)) {
    res.writeHead(404).end()
    return
  }
  const relative = path.relative(root, wanted)
  // Unknown paths without an extension are app routes: they get the app.
  const file = (await fileIn(root, relative)) ?? (await fileIn(root, path.join(relative, 'index.html'))) ??
    (path.extname(pathname) === '' ? await fileIn(root, 'index.html') : undefined)
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

export const createApp = (options: AppOptions) =>
  http.createServer((req, res) => {
    const handle = async () => {
      const pathname = (req.url ?? '/').split('?')[0]
      if (pathname === '/api/read-link') {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' }).end()
          return
        }
        const body = await readJson(req)
        const result = await readLink(body, req.socket.remoteAddress ?? 'unknown', options.readLink)
        sendJson(res, result.status, result.json)
        return
      }
      await serveStatic(req, res, options.distDir)
    }
    handle().catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'fetch-failed' })
      else res.destroy()
    })
  })
