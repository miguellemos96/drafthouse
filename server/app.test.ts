// The server, in-process: listens on a free port on 127.0.0.1 and is closed after each test.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import type { ReadLinkDeps } from './readLink.ts'

let distDir: string
let close: (() => Promise<void>) | undefined

beforeAll(() => {
  distDir = mkdtempSync(path.join(tmpdir(), 'drafthouse-dist-'))
  writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>DraftHouse</title>')
  mkdirSync(path.join(distDir, 'assets'))
  writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log(1)')
})

afterAll(() => rmSync(distDir, { recursive: true, force: true }))

afterEach(async () => {
  await close?.()
  close = undefined
})

async function* body(text: string) {
  yield new TextEncoder().encode(text)
}

const deps: ReadLinkDeps = {
  lookup: async () => ['93.184.215.14'],
  fetchOnce: async () => ({
    status: 200,
    contentType: 'text/html',
    body: body('<meta property="og:title" content="Cama 150x190"><p>RAW</p>'),
    discard: () => {},
  }),
  allow: () => true,
}

const start = async (readLink: ReadLinkDeps = deps) => {
  const server = createApp({ distDir, readLink })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  close = () => new Promise((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const post = (base: string, payload: string) =>
  fetch(`${base}/api/read-link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })

describe('server', () => {
  it('reads a link and returns only the product as JSON', async () => {
    const base = await start()
    const response = await post(base, JSON.stringify({ url: 'https://shop.example/cama' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ name: 'Cama 150x190', templateGuess: 'bed' })
    expect(text).not.toContain('RAW')
  })

  it('returns error codes with their status', async () => {
    const base = await start()
    const blocked = await post(base, JSON.stringify({ url: 'http://127.0.0.1/' }))
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({ error: 'blocked-address' })

    const notJson = await post(base, 'not json')
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toEqual({ error: 'invalid-url' })
  })

  it('rate-limits by the caller address', async () => {
    const seen: string[] = []
    const base = await start({ ...deps, allow: (ip) => (seen.push(ip), false) })
    const response = await post(base, JSON.stringify({ url: 'https://shop.example/cama' }))
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/127\.0\.0\.1$/)
  })

  it('accepts only POST on the API', async () => {
    const base = await start()
    expect((await fetch(`${base}/api/read-link`)).status).toBe(405)
  })

  it('serves the built site from dist/', async () => {
    const base = await start()
    const index = await fetch(`${base}/`)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toContain('text/html')
    expect(await index.text()).toContain('<title>DraftHouse</title>')

    const script = await fetch(`${base}/assets/app.js`)
    expect(script.headers.get('content-type')).toContain('text/javascript')
    expect(await script.text()).toBe('console.log(1)')

    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    expect(await (await fetch(`${base}/some/route`)).text()).toContain('DraftHouse')
  })

  it('never serves files outside dist/', async () => {
    const base = await start()
    for (const attempt of ['/..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%2f..%2fsecret.txt']) {
      const response = await fetch(`${base}${attempt}`)
      expect(response.status).toBe(404)
    }
  })
})
