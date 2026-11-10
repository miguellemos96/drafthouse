// The real fetchOnce against a local server. safety.ts would refuse 127.0.0.1, so these tests call
// fetchOnce directly: they check the network plumbing, not the rules.

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchOnce } from './http.ts'

let server: http.Server
let port: number

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/redirect') res.writeHead(302, { location: '/page' }).end()
    else if (req.url === '/gzip') res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/html' })
      .end(gzipSync(`<p>${req.headers.host}</p>`))
    else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<p>${req.headers.host}</p>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const text = async (body: AsyncIterable<Uint8Array>) => {
  let out = ''
  for await (const chunk of body) out += Buffer.from(chunk).toString('utf8')
  return out
}

describe('fetchOnce', () => {
  it('connects to the given address, whatever the host name, and keeps the Host header', async () => {
    const response = await fetchOnce(new URL(`http://shop.invalid:${port}/`), '127.0.0.1', new AbortController().signal)
    expect(response.status).toBe(200)
    expect(response.contentType).toBe('text/html; charset=utf-8')
    expect(await text(response.body)).toBe(`<p>shop.invalid:${port}</p>`)
  })

  it('does not follow redirects', async () => {
    const response = await fetchOnce(new URL(`http://shop.invalid:${port}/redirect`), '127.0.0.1', new AbortController().signal)
    expect(response.status).toBe(302)
    expect(response.location).toBe('/page')
    response.discard()
  })

  it('decompresses gzip and does not report the compressed length', async () => {
    const response = await fetchOnce(new URL(`http://shop.invalid:${port}/gzip`), '127.0.0.1', new AbortController().signal)
    expect(response.contentLength).toBeUndefined()
    expect(await text(response.body)).toBe(`<p>shop.invalid:${port}</p>`)
  })
})
