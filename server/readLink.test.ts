import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readLink, type ReadLinkDeps } from './readLink.ts'
import { createRateLimiter, type FetchOnce, type RawResponse } from './reader/safety.ts'

const fixture = (name: string) => readFileSync(new URL(`./reader/fixtures/${name}`, import.meta.url), 'utf8')

async function* chunks(...parts: Uint8Array[]) {
  for (const part of parts) yield part
}

const html = (text: string): RawResponse =>
  ({ status: 200, contentType: 'text/html', body: chunks(new TextEncoder().encode(text)), discard: () => {} })

const fakeDeps = (pages: Record<string, () => RawResponse>, extra: Partial<ReadLinkDeps> = {}): ReadLinkDeps => {
  const fetchOnce: FetchOnce = async (url) =>
    pages[url.href]?.() ?? { status: 404, body: chunks(), discard: () => {} }
  return {
    lookup: async (host) => (host === 'localhost' ? ['127.0.0.1', '::1'] : ['93.184.215.14']),
    fetchOnce,
    allow: () => true,
    ...extra,
  }
}

const IP = '203.0.113.7'

describe('readLink', () => {
  describe('acceptance scenarios', () => {
    it.each(['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/', 'http://10.0.0.5/'])(
      '%s returns blocked-address', async (url) => {
        expect(await readLink({ url }, IP, fakeDeps({}))).toEqual({ status: 403, json: { error: 'blocked-address' } })
      },
    )

    it.each(['ftp://example.com/x', 'http://example.com:8080/'])('%s returns invalid-url', async (url) => {
      expect(await readLink({ url }, IP, fakeDeps({}))).toEqual({ status: 400, json: { error: 'invalid-url' } })
    })

    it('a public page that redirects to http://192.168.1.1/ returns blocked-address', async () => {
      const deps = fakeDeps({
        'https://shop.example/p/1': () => ({ status: 301, location: 'http://192.168.1.1/', body: chunks(), discard: () => {} }),
        'http://192.168.1.1/': () => html(fixture('json-ld.html')),
      })
      expect(await readLink({ url: 'https://shop.example/p/1' }, IP, deps))
        .toEqual({ status: 403, json: { error: 'blocked-address' } })
    })

    it('a fake page of 6 MB returns too-large', async () => {
      const big = '<html><body>' + 'x'.repeat(6 * 1024 * 1024) + '</body></html>'
      const deps = fakeDeps({ 'https://shop.example/big': () => html(big) })
      expect(await readLink({ url: 'https://shop.example/big' }, IP, deps))
        .toEqual({ status: 502, json: { error: 'too-large' } })
    })

    it('the 21st request from one IP within 10 minutes returns rate-limited', async () => {
      let now = 0
      const deps = fakeDeps({}, { allow: createRateLimiter(20, 10 * 60_000, () => now) })
      for (let i = 0; i < 20; i++) {
        now += 25_000
        expect((await readLink({ url: 'ftp://x/' }, IP, deps)).json).toEqual({ error: 'invalid-url' })
      }
      expect(await readLink({ url: 'https://shop.example/p/1' }, IP, deps))
        .toEqual({ status: 429, json: { error: 'rate-limited' } })
      expect((await readLink({ url: 'ftp://x/' }, '198.51.100.9', deps)).json).toEqual({ error: 'invalid-url' })
    })
  })

  it('returns the product extracted from the page, and nothing else', async () => {
    const page = '<meta property="og:title" content="Sofá de 3 plazas"><meta property="og:image" content="/img/s.jpg">' +
      '<p>SECRET-PAGE-TEXT</p>'
    const deps = fakeDeps({ 'https://shop.example/p/1': () => html(page) })
    const result = await readLink({ url: 'https://shop.example/p/1' }, IP, deps)
    expect(result).toEqual({
      status: 200,
      json: { name: 'Sofá de 3 plazas', photoUrl: 'https://shop.example/img/s.jpg', templateGuess: 'sofa' },
    })
    expect(JSON.stringify(result)).not.toContain('SECRET-PAGE-TEXT')
  })

  it('resolves the photo against the page it was redirected to', async () => {
    const deps = fakeDeps({
      'https://shop.example/p/1': () => ({ status: 302, location: 'https://www.shop.example/p/1', body: chunks(), discard: () => {} }),
      'https://www.shop.example/p/1': () => html('<meta property="og:title" content="Sofa"><meta property="og:image" content="/s.jpg">'),
    })
    expect((await readLink({ url: 'https://shop.example/p/1' }, IP, deps)).json)
      .toMatchObject({ photoUrl: 'https://www.shop.example/s.jpg' })
  })

  it('returns nothing-found for a page with no product data', async () => {
    const deps = fakeDeps({ 'https://shop.example/p/1': () => html(fixture('nothing.html')) })
    expect(await readLink({ url: 'https://shop.example/p/1' }, IP, deps))
      .toEqual({ status: 422, json: { error: 'nothing-found' } })
  })

  it('returns fetch-failed when the shop answers with an error', async () => {
    expect(await readLink({ url: 'https://shop.example/missing' }, IP, fakeDeps({})))
      .toEqual({ status: 502, json: { error: 'fetch-failed' } })
  })

  it('returns timeout with a 504', async () => {
    const deps = fakeDeps({}, {
      fetchOnce: () => new Promise(() => {}),
      limits: { maxRedirects: 3, timeoutMs: 20, maxBytes: 1000 },
    })
    expect(await readLink({ url: 'https://shop.example/slow' }, IP, deps))
      .toEqual({ status: 504, json: { error: 'timeout' } })
  })

  it.each([undefined, null, 'https://shop.example/', {}, { url: 42 }])('returns invalid-url for the body %j', async (body) => {
    expect(await readLink(body, IP, fakeDeps({}))).toEqual({ status: 400, json: { error: 'invalid-url' } })
  })
})
