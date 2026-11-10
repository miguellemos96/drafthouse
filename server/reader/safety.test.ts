import { describe, expect, it } from 'vitest'
import {
  checkUrl, createRateLimiter, isPublicAddress, safeFetch, type FetchDeps, type FetchOnce, type RawResponse,
} from './safety.ts'

const encoder = new TextEncoder()

async function* chunks(...parts: Uint8Array[]) {
  for (const part of parts) yield part
}

const page = (html: string, extra: Partial<RawResponse> = {}): RawResponse => ({
  status: 200, contentType: 'text/html; charset=utf-8', body: chunks(encoder.encode(html)), discard: () => {}, ...extra,
})

const redirect = (location: string): RawResponse => ({ status: 302, location, body: chunks(), discard: () => {} })

const PUBLIC = '93.184.215.14'

/** Fake DNS: every name resolves to a public address unless listed. */
const fakeLookup = (names: Record<string, string[]> = {}) => async (host: string) => names[host] ?? [PUBLIC]

/** Fake network: responses by URL; records what was fetched and where it connected. */
const fakeNetwork = (pages: Record<string, () => RawResponse>) => {
  const calls: { url: string; address: string }[] = []
  const fetchOnce: FetchOnce = async (url, address) => {
    calls.push({ url: url.href, address })
    const respond = pages[url.href]
    if (!respond) return { status: 404, body: chunks(), discard: () => {} }
    return respond()
  }
  return { fetchOnce, calls }
}

const deps = (pages: Record<string, () => RawResponse>, names?: Record<string, string[]>) => {
  const network = fakeNetwork(pages)
  const fetchDeps: FetchDeps = { lookup: fakeLookup(names), fetchOnce: network.fetchOnce }
  return { ...fetchDeps, calls: network.calls }
}

describe('checkUrl', () => {
  it.each(['http://example.com/', 'https://example.com/a?b=c', 'http://example.com:80/', 'https://example.com:443/'])(
    'accepts %s', (url) => expect(checkUrl(url)?.href).toBeDefined(),
  )

  it.each([
    'ftp://example.com/x', 'http://example.com:8080/', 'https://example.com:8443/', 'file:///etc/passwd',
    'javascript:alert(1)', 'not a url', '', 'example.com',
  ])('refuses %s', (url) => expect(checkUrl(url)).toBeUndefined())

  it('refuses anything that is not a string', () => {
    expect(checkUrl(undefined)).toBeUndefined()
    expect(checkUrl(42)).toBeUndefined()
  })
})

describe('isPublicAddress', () => {
  it.each(['93.184.215.14', '8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0',
    '2606:4700::1111', '2a00:1450:4003:80e::200e', '::ffff:8.8.8.8', '64:ff9b::808:808'])(
    'allows %s', (ip) => expect(isPublicAddress(ip)).toBe(true),
  )

  it.each([
    // loopback
    '127.0.0.1', '127.255.255.254', '::1',
    // private
    '10.0.0.5', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    // link-local
    '169.254.169.254', 'fe80::1', 'febf:ffff::1',
    // unique local
    'fc00::1', 'fd12:3456::1',
    // this network, CGNAT
    '0.0.0.0', '0.1.2.3', '100.64.0.1', '100.127.255.255',
    // multicast
    '224.0.0.1', '239.255.255.250', 'ff02::1', 'ff0e::1',
    // other reserved
    '255.255.255.255', '240.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '192.0.0.8',
    '::', '2001:db8::1', '2002:c0a8:101::1', '2001::1', '3fff::1', '100::1', '::127.0.0.1',
    // IPv4-mapped and NAT64 forms of blocked IPv4
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.5', '::ffff:169.254.169.254', '::ffff:192.168.1.1',
    '0:0:0:0:0:ffff:7f00:1', '64:ff9b::7f00:1', '64:ff9b::a00:5',
    // not addresses at all
    'localhost', 'example.com', '', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1::2::3', 'gggg::1',
  ])('refuses %s', (ip) => expect(isPublicAddress(ip)).toBe(false))
})

describe('safeFetch', () => {
  it('returns the page body and connects to the checked address', async () => {
    const d = deps({ 'https://shop.example/p/1': () => page('<h1>Sofa</h1>') })
    expect(await safeFetch(new URL('https://shop.example/p/1'), d)).toEqual({
      ok: true, url: 'https://shop.example/p/1', body: '<h1>Sofa</h1>',
    })
    expect(d.calls).toEqual([{ url: 'https://shop.example/p/1', address: PUBLIC }])
  })

  it.each(['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/', 'http://10.0.0.5/', 'http://localhost/',
    'http://[::ffff:127.0.0.1]/', 'http://0x7f.1/', 'http://2130706433/'])(
    'refuses %s without fetching', async (url) => {
      const d = deps({})
      expect(await safeFetch(new URL(url), d)).toEqual({ ok: false, error: 'blocked-address' })
      expect(d.calls).toEqual([])
    },
  )

  it('refuses a host name that resolves to a private address', async () => {
    const d = deps({}, { 'intranet.example': ['10.1.2.3'] })
    expect(await safeFetch(new URL('http://intranet.example/'), d)).toEqual({ ok: false, error: 'blocked-address' })
    expect(d.calls).toEqual([])
  })

  it('refuses a host name when any of its addresses is private', async () => {
    const d = deps({}, { 'mixed.example': [PUBLIC, '::1'] })
    expect(await safeFetch(new URL('http://mixed.example/'), d)).toEqual({ ok: false, error: 'blocked-address' })
  })

  it('refuses a public page that redirects to a private address', async () => {
    const d = deps({ 'http://shop.example/': () => redirect('http://192.168.1.1/') })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({ ok: false, error: 'blocked-address' })
    expect(d.calls.map((c) => c.url)).toEqual(['http://shop.example/'])
  })

  it('refuses a redirect to a host name that resolves to a private address', async () => {
    const d = deps({ 'http://shop.example/': () => redirect('http://evil.example/') }, { 'evil.example': ['127.0.0.1'] })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({ ok: false, error: 'blocked-address' })
  })

  it('refuses a redirect to another scheme or port', async () => {
    const d = deps({
      'http://a.example/': () => redirect('ftp://a.example/'),
      'http://b.example/': () => redirect('http://b.example:8080/'),
    })
    expect(await safeFetch(new URL('http://a.example/'), d)).toEqual({ ok: false, error: 'invalid-url' })
    expect(await safeFetch(new URL('http://b.example/'), d)).toEqual({ ok: false, error: 'invalid-url' })
  })

  it('follows up to 3 redirects, including relative ones', async () => {
    const d = deps({
      'http://shop.example/': () => redirect('https://shop.example/1'),
      'https://shop.example/1': () => redirect('/2'),
      'https://shop.example/2': () => redirect('https://www.shop.example/3'),
      'https://www.shop.example/3': () => page('done'),
    })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({
      ok: true, url: 'https://www.shop.example/3', body: 'done',
    })
  })

  it('stops at the 4th redirect', async () => {
    const d = deps({
      'http://shop.example/': () => redirect('/1'),
      'http://shop.example/1': () => redirect('/2'),
      'http://shop.example/2': () => redirect('/3'),
      'http://shop.example/3': () => redirect('/4'),
      'http://shop.example/4': () => page('too far'),
    })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({ ok: false, error: 'fetch-failed' })
    expect(d.calls).toHaveLength(4)
  })

  it('returns too-large for a 6 MB page that announces its size', async () => {
    let discarded = false
    const d = deps({
      'http://shop.example/': () => page('', { contentLength: 6 * 1024 * 1024, discard: () => { discarded = true } }),
    })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({ ok: false, error: 'too-large' })
    expect(discarded).toBe(true)
  })

  it('returns too-large for a 6 MB page that does not announce its size, without reading all of it', async () => {
    let sent = 0
    async function* sixMegabytes() {
      for (let i = 0; i < 6; i++) {
        sent++
        yield new Uint8Array(1024 * 1024)
      }
    }
    const d = deps({ 'http://shop.example/': () => page('', { body: sixMegabytes() }) })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toEqual({ ok: false, error: 'too-large' })
    expect(sent).toBe(6)
  })

  it('accepts a page of exactly 5 MB', async () => {
    const d = deps({ 'http://shop.example/': () => page('', { body: chunks(new Uint8Array(5 * 1024 * 1024)) }) })
    expect((await safeFetch(new URL('http://shop.example/'), d)).ok).toBe(true)
  })

  it('times out', async () => {
    let aborted = false
    const fetchOnce: FetchOnce = (_url, _address, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted'))
      }))
    const limits = { maxRedirects: 3, timeoutMs: 20, maxBytes: 100 }
    expect(await safeFetch(new URL('http://slow.example/'), { lookup: fakeLookup(), fetchOnce }, limits))
      .toEqual({ ok: false, error: 'timeout' })
    expect(aborted).toBe(true)
  })

  it('times out even if the request ignores the abort', async () => {
    const fetchOnce: FetchOnce = () => new Promise(() => {})
    const limits = { maxRedirects: 3, timeoutMs: 20, maxBytes: 100 }
    expect(await safeFetch(new URL('http://slow.example/'), { lookup: fakeLookup(), fetchOnce }, limits))
      .toEqual({ ok: false, error: 'timeout' })
  })

  it('returns fetch-failed for an error status, a failed lookup or a network error', async () => {
    const d = deps({ 'http://shop.example/gone': () => ({ status: 410, body: chunks(), discard: () => {} }) })
    expect(await safeFetch(new URL('http://shop.example/gone'), d)).toEqual({ ok: false, error: 'fetch-failed' })

    const noDns: FetchDeps = { lookup: async () => { throw new Error('ENOTFOUND') }, fetchOnce: d.fetchOnce }
    expect(await safeFetch(new URL('http://nowhere.example/'), noDns)).toEqual({ ok: false, error: 'fetch-failed' })

    const noAddress: FetchDeps = { lookup: async () => [], fetchOnce: d.fetchOnce }
    expect(await safeFetch(new URL('http://nowhere.example/'), noAddress)).toEqual({ ok: false, error: 'fetch-failed' })

    const reset: FetchDeps = { lookup: fakeLookup(), fetchOnce: async () => { throw new Error('ECONNRESET') } }
    expect(await safeFetch(new URL('http://shop.example/'), reset)).toEqual({ ok: false, error: 'fetch-failed' })
  })

  it('decodes the charset the page declares', async () => {
    const latin1 = new Uint8Array([0x53, 0x6f, 0x66, 0xe1]) // "Sofá" in ISO-8859-1
    const d = deps({
      'http://shop.example/': () => page('', { contentType: 'text/html; charset=ISO-8859-1', body: chunks(latin1) }),
    })
    expect(await safeFetch(new URL('http://shop.example/'), d)).toMatchObject({ ok: true, body: 'Sofá' })
  })
})

describe('createRateLimiter', () => {
  it('allows 20 requests per IP in 10 minutes and refuses the 21st', () => {
    let now = 0
    const allow = createRateLimiter(20, 10 * 60_000, () => now)
    for (let i = 0; i < 20; i++) {
      now += 1000
      expect(allow('203.0.113.1')).toBe(true)
    }
    expect(allow('203.0.113.1')).toBe(false)
    expect(allow('198.51.100.2')).toBe(true)
  })

  it('allows requests again once the window has passed', () => {
    let now = 0
    const allow = createRateLimiter(20, 10 * 60_000, () => now)
    for (let i = 0; i < 21; i++) allow('a')
    expect(allow('a')).toBe(false)
    now += 10 * 60_000 + 1
    expect(allow('a')).toBe(true)
  })
})
