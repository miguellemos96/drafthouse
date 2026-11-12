// Safety checks for the link reader. Pure: DNS lookup and the single HTTP request are passed in,
// so tests run without a network. See "Link reader" → "Safety rules" in docs/spec.md.

export type ReadError =
  | 'invalid-url' | 'blocked-address' | 'fetch-failed' | 'too-large' | 'timeout' | 'rate-limited' | 'nothing-found'

export interface Limits {
  maxRedirects: number
  timeoutMs: number
  maxBytes: number
}

export const LIMITS: Limits = { maxRedirects: 3, timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024 }

/** Every address the host name resolves to. */
export type Lookup = (hostname: string) => Promise<string[]>

export interface RawResponse {
  status: number
  /** The raw `Location` header, if any. */
  location?: string
  contentLength?: number
  contentType?: string
  body: AsyncIterable<Uint8Array>
  /** Drops the body without reading it. */
  discard: () => void
}

/** One GET of `url`, connecting to `address` (already checked) and not following redirects. */
export type FetchOnce = (url: URL, address: string, signal: AbortSignal) => Promise<RawResponse>

export interface FetchDeps {
  lookup: Lookup
  fetchOnce: FetchOnce
}

export type FetchResult = { ok: true; url: string; body: string } | { ok: false; error: ReadError }

const ALLOWED_PORTS = new Set(['', '80', '443'])

/** The URL if it is http(s) on a standard port, otherwise undefined. */
export const checkUrl = (raw: unknown): URL | undefined => {
  if (typeof raw !== 'string') return undefined
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (!ALLOWED_PORTS.has(url.port)) return undefined
  return url
}

// --- Addresses -------------------------------------------------------------

export const parseIPv4 = (s: string): number | undefined => {
  const parts = s.split('.')
  if (parts.length !== 4) return undefined
  let n = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const byte = Number(part)
    if (byte > 255) return undefined
    n = n * 256 + byte
  }
  return n
}

export const parseIPv6 = (input: string): bigint | undefined => {
  let s = input.includes('%') ? input.slice(0, input.indexOf('%')) : input
  const lastColon = s.lastIndexOf(':')
  if (lastColon < 0) return undefined
  const last = s.slice(lastColon + 1)
  if (last.includes('.')) {
    const v4 = parseIPv4(last)
    if (v4 === undefined) return undefined
    s = `${s.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return undefined
  const groupsOf = (h: string) => (h === '' ? [] : h.split(':'))
  const head = groupsOf(halves[0])
  let groups = head
  if (halves.length === 2) {
    const tail = groupsOf(halves[1])
    if (head.length + tail.length > 7) return undefined
    groups = [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail]
  }
  if (groups.length !== 8) return undefined
  let n = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return undefined
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

type V4Range = [base: string, bits: number]
type V6Range = [base: string, bits: number]

// IANA IPv4 Special-Purpose Address Registry, plus multicast and the old class E.
const V4_BLOCKED: V4Range[] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.31.196.0', 24], // AS112
  ['192.52.193.0', 24], // AMT
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['192.175.48.0', 24], // AS112
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including broadcast
]

// Only global unicast (2000::/3) is allowed, minus these special ranges inside it.
const V6_GLOBAL: V6Range = ['2000::', 3]
const V6_BLOCKED: V6Range[] = [
  ['2001::', 23], // IETF protocol assignments, including Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4: can wrap any IPv4 address
  ['3fff::', 20], // documentation
]
// These carry an IPv4 address in their low 32 bits, which is checked instead.
const V6_EMBEDS_V4: V6Range[] = [
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // NAT64
]

const inV4 = (n: number, [base, bits]: V4Range) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((n & mask) >>> 0) === ((parseIPv4(base)! & mask) >>> 0)
}

const inV6 = (n: bigint, [base, bits]: V6Range) => {
  const shift = BigInt(128 - bits)
  return n >> shift === parseIPv6(base)! >> shift
}

const isPublicV4 = (n: number) => !V4_BLOCKED.some((range) => inV4(n, range))

/** True only for an IP address that is safe to connect to. Host names and garbage are false. */
export const isPublicAddress = (ip: string): boolean => {
  const v4 = parseIPv4(ip)
  if (v4 !== undefined) return isPublicV4(v4)
  const v6 = parseIPv6(ip)
  if (v6 === undefined) return false
  if (V6_EMBEDS_V4.some((range) => inV6(v6, range))) return isPublicV4(Number(v6 & 0xffffffffn))
  return inV6(v6, V6_GLOBAL) && !V6_BLOCKED.some((range) => inV6(v6, range))
}

const isIpLiteral = (host: string) => parseIPv4(host) !== undefined || parseIPv6(host) !== undefined

/** The address to connect to for `url`, or the reason not to. */
const resolveHost = async (url: URL, lookup: Lookup): Promise<{ address: string } | { error: ReadError }> => {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  if (isIpLiteral(host)) return isPublicAddress(host) ? { address: host } : { error: 'blocked-address' }
  const name = host.toLowerCase().replace(/\.$/, '')
  if (name === 'localhost' || name.endsWith('.localhost')) return { error: 'blocked-address' }
  let addresses: string[]
  try {
    addresses = await lookup(host)
  } catch {
    return { error: 'fetch-failed' }
  }
  if (addresses.length === 0) return { error: 'fetch-failed' }
  if (!addresses.every(isPublicAddress)) return { error: 'blocked-address' }
  return { address: addresses[0] }
}

// --- Fetching --------------------------------------------------------------

class Stop extends Error {
  readonly code: ReadError
  constructor(code: ReadError) {
    super(code)
    this.code = code
  }
}

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status)

const charsetOf = (contentType: string | undefined) => /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]

const decode = (bytes: Uint8Array, contentType: string | undefined) => {
  try {
    return new TextDecoder(charsetOf(contentType) ?? 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

const readBody = async (response: RawResponse, maxBytes: number): Promise<Uint8Array> => {
  if (response.contentLength !== undefined && response.contentLength > maxBytes) {
    response.discard()
    throw new Stop('too-large')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maxBytes) {
      response.discard()
      throw new Stop('too-large')
    }
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const follow = async (start: URL, deps: FetchDeps, limits: Limits, signal: AbortSignal): Promise<FetchResult> => {
  let url = start
  for (let redirects = 0; ; redirects++) {
    const target = await resolveHost(url, deps.lookup)
    if ('error' in target) return { ok: false, error: target.error }
    const response = await deps.fetchOnce(url, target.address, signal)

    if (isRedirect(response.status) && response.location !== undefined) {
      response.discard()
      if (redirects >= limits.maxRedirects) return { ok: false, error: 'fetch-failed' }
      let next: URL | undefined
      try {
        next = checkUrl(new URL(response.location, url).href)
      } catch {
        next = undefined
      }
      if (!next) return { ok: false, error: 'invalid-url' }
      url = next
      continue
    }
    if (response.status < 200 || response.status > 299) {
      response.discard()
      return { ok: false, error: 'fetch-failed' }
    }
    const bytes = await readBody(response, limits.maxBytes)
    return { ok: true, url: url.href, body: decode(bytes, response.contentType) }
  }
}

/**
 * Fetches a page by the safety rules: public addresses only (checked again on every redirect),
 * at most `maxRedirects` redirects, `timeoutMs` in all and `maxBytes` per response.
 */
export const safeFetch = async (url: URL, deps: FetchDeps, limits: Limits = LIMITS): Promise<FetchResult> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<FetchResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ ok: false, error: 'timeout' })
    }, limits.timeoutMs)
  })
  const work = follow(url, deps, limits, controller.signal).catch((error: unknown): FetchResult => {
    if (error instanceof Stop) return { ok: false, error: error.code }
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'fetch-failed' }
  })
  try {
    return await Promise.race([work, timedOut])
  } finally {
    clearTimeout(timer)
  }
}

// --- Rate limit ------------------------------------------------------------

/**
 * A sliding-window counter kept in memory (fine for one instance).
 * Returns a function that records one request for `key` and says whether it is allowed.
 */
export const createRateLimiter = (limit = 20, windowMs = 10 * 60_000, now: () => number = Date.now) => {
  const hits = new Map<string, number[]>()
  return (key: string): boolean => {
    const t = now()
    if (hits.size > 10_000) {
      for (const [k, times] of hits) if (times[times.length - 1] <= t - windowMs) hits.delete(k)
    }
    const recent = (hits.get(key) ?? []).filter((time) => time > t - windowMs)
    recent.push(t)
    hits.set(key, recent)
    return recent.length <= limit
  }
}
