// POST /api/read-link: a URL in, a product (or an error code) out. Never the raw page.

import { extractProduct, type Product } from './reader/extract.ts'
import { photoColour } from './reader/photo.ts'
import { checkUrl, safeFetch, safeFetchBytes, type FetchDeps, type Limits, type ReadError } from './reader/safety.ts'

export interface ReadLinkDeps extends FetchDeps {
  /** Records one request from this visitor and says whether it is allowed. */
  allow: (ip: string) => boolean
  limits?: Limits
}

export type ReadLinkResponse = { status: number; json: Product | { error: ReadError } }

export const STATUS: Record<ReadError, number> = {
  'invalid-url': 400,
  'blocked-address': 403,
  'nothing-found': 422,
  'rate-limited': 429,
  'fetch-failed': 502,
  'too-large': 502,
  timeout: 504,
}

const fail = (error: ReadError): ReadLinkResponse => ({ status: STATUS[error], json: { error } })

export const readLink = async (body: unknown, ip: string, deps: ReadLinkDeps): Promise<ReadLinkResponse> => {
  if (!deps.allow(ip)) return fail('rate-limited')
  const raw = typeof body === 'object' && body !== null ? (body as { url?: unknown }).url : undefined
  const url = checkUrl(raw)
  if (!url) return fail('invalid-url')

  const page = await safeFetch(url, deps, deps.limits)
  if (!page.ok) return fail(page.error)

  const product = extractProduct(page.body, page.url)
  if (Object.keys(product).length === 0) return fail('nothing-found')
  const colour = await colourOf(product.photoUrl, deps)
  return { status: 200, json: colour ? { ...product, colour } : product }
}

/** The photo's main colour, or undefined if it can't be fetched by the same rules or decoded. */
const colourOf = async (photoUrl: string | undefined, deps: ReadLinkDeps): Promise<string | undefined> => {
  const url = checkUrl(photoUrl)
  if (!url) return undefined
  const photo = await safeFetchBytes(url, deps, deps.limits)
  if (!photo.ok) return undefined
  return photoColour(photo.bytes)
}
