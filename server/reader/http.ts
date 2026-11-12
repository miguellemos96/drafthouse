// The real network side of the link reader: DNS lookup and one HTTP GET pinned to a checked address.
// The rules live in safety.ts; this file only talks to the network.

import { promises as dns } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import zlib from 'node:zlib'
import type { FetchOnce, Lookup } from './safety.ts'

export const lookup: Lookup = async (hostname) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; DraftHouse/0.1; link reader)',
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  'accept-encoding': 'gzip, deflate, br',
}

const decoderFor = (encoding: string | undefined) => {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip': return zlib.createGunzip()
    case 'deflate': return zlib.createInflate()
    case 'br': return zlib.createBrotliDecompress()
    default: return undefined
  }
}

/**
 * Connects to `address` whatever the host name resolves to now, so the address checked
 * by safety.ts is the one used (no DNS rebinding). TLS still verifies the host name.
 */
export const fetchOnce: FetchOnce = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const family = address.includes(':') ? 6 : 4
    const pinned = ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
      if (options.all) callback(null, [{ address, family }])
      else callback(null, address, family)
    }) as LookupFunction
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(url, { method: 'GET', headers: HEADERS, lookup: pinned, signal }, (response) => {
      const decoder = decoderFor(response.headers['content-encoding'])
      const body: Readable = decoder ? pipeline(response, decoder, () => {}) : response
      const length = Number(response.headers['content-length'])
      resolve({
        status: response.statusCode ?? 0,
        location: response.headers.location,
        // A compressed length says nothing about the decoded size, so only trust a plain one.
        contentLength: decoder || !Number.isFinite(length) ? undefined : length,
        contentType: response.headers['content-type'],
        body,
        discard: () => {
          response.destroy()
          decoder?.destroy()
        },
      })
    })
    request.on('error', reject)
    request.end()
  })
