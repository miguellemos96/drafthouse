// Adding a product from a link, the pure parts: reading the /api/read-link response, turning it
// into item form values, assigning unlabeled numbers to sizes, and the confirm rule.
// See "Adding a product from a link" and "Link reader" in docs/spec.md.
import type { Size } from './item.ts'
import type { SizeField } from './newItem.ts'

export const READ_ERRORS = ['invalid-url', 'blocked-address', 'fetch-failed', 'too-large', 'timeout', 'rate-limited', 'nothing-found'] as const
export type ReadError = (typeof READ_ERRORS)[number]

/** The product the server returns. Each field is optional. */
export type LinkProduct = {
  name?: string
  width?: number
  depth?: number
  height?: number
  /** Numbers whose order the reader couldn't tell: the user says which is which. */
  unlabeled?: number[]
  price?: number
  currency?: string
  photoUrl?: string
  colour?: string
  templateGuess?: string
}

export type ReadLinkResult = { product: LinkProduct } | { error: ReadError }

/** What the item form opens with after a read. Sizes from chips are added as the user assigns them. */
export type LinkPrefill = {
  name?: string
  templateId?: string
  size: Partial<Size>
  colour?: string
  price?: number
  currency?: string
  url: string
  photoUrl?: string
  /** Unlabeled numbers, shown as chips. */
  chips: number[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const HEX = /^#[0-9a-f]{6}$/i

const STRING_FIELDS = ['name', 'currency', 'photoUrl', 'colour', 'templateGuess'] as const
const NUMBER_FIELDS = ['width', 'depth', 'height', 'price'] as const

/** The response as a product or an error code. Anything unexpected counts as `fetch-failed`. */
export const readLinkResult = (status: number, json: unknown): ReadLinkResult => {
  if (!isObject(json)) return { error: 'fetch-failed' }
  if (status < 200 || status >= 300 || 'error' in json) {
    const code = READ_ERRORS.find((e) => e === json.error)
    return { error: code ?? 'fetch-failed' }
  }
  const product: LinkProduct = {}
  for (const f of STRING_FIELDS) if (isString(json[f])) product[f] = json[f]
  for (const f of NUMBER_FIELDS) if (isNumber(json[f])) product[f] = json[f]
  if (Array.isArray(json.unlabeled) && json.unlabeled.length > 0 && json.unlabeled.every(isNumber)) product.unlabeled = [...json.unlabeled]
  return { product }
}

/** The form values for a read link: whatever was found, or only the link after an error. */
export const linkPrefill = (url: string, product: LinkProduct = {}): LinkPrefill => {
  const prefill: LinkPrefill = { url, size: {}, chips: product.unlabeled ? [...product.unlabeled] : [] }
  if (product.name) prefill.name = product.name
  if (product.templateGuess) prefill.templateId = product.templateGuess
  for (const f of ['width', 'depth', 'height'] as const) if (product[f] !== undefined) prefill.size[f] = product[f]
  if (product.colour && HEX.test(product.colour)) prefill.colour = product.colour.toLowerCase()
  if (product.price !== undefined) prefill.price = product.price
  if (product.currency) prefill.currency = product.currency
  if (product.photoUrl) prefill.photoUrl = product.photoUrl
  return prefill
}

/** Which size each chip stands for, by chip index. */
export type ChipAssignment = (SizeField | undefined)[]

/** Assigns a chip to a size (or to none). A size belongs to one chip at most, so it leaves any other chip. */
export const assignChip = (assigned: ChipAssignment, index: number, field: SizeField | undefined): ChipAssignment =>
  assigned.map((current, i) => (i === index ? field : field !== undefined && current === field ? undefined : current))

/** The sizes the assigned chips give. */
export const chipSizes = (chips: number[], assigned: ChipAssignment): Partial<Size> => {
  const size: Partial<Size> = {}
  assigned.forEach((field, i) => {
    if (field) size[field] = chips[i]
  })
  return size
}

/**
 * Add is allowed once the user has confirmed the template and the three sizes. This applies to every
 * form opened from a link, even when every value was filled in. Add item without a link needs no confirm.
 */
export const addAllowed = ({ fromLink, confirmed }: { fromLink: boolean; confirmed: boolean }): boolean => !fromLink || confirmed

/** The URL if it is an http or https link, so a saved or imported link can't run script or embed data. */
export const safeHttpUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}
