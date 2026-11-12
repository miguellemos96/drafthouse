// Turns a product page's HTML into a product. Pure: no network.
// Sources, earliest wins per field: JSON-LD Product, then meta tags, then the visible text.
// See "Link reader" in docs/spec.md.

import { parse, type HTMLElement } from 'node-html-parser'
import { parseDimensions } from './dimensions.ts'

/** Template ids for the v1 templates in docs/spec.md ("Items"). */
export type TemplateGuess =
  | 'sofa' | 'armchair' | 'chair' | 'table' | 'desk' | 'bed' | 'wardrobe' | 'shelf' | 'tv-unit' | 'rug'
  | 'lamp'
  | 'toilet' | 'bidet' | 'sink' | 'shower-tray' | 'bathtub'
  | 'hob' | 'oven' | 'cooker-hood' | 'fridge' | 'washer'
  | 'wall-panel'

export interface Product {
  name?: string
  width?: number
  depth?: number
  height?: number
  /** Numbers from a bare "210x95x83 cm": the user decides which is which. */
  unlabeled?: number[]
  price?: number
  currency?: string
  photoUrl?: string
  /** Main colour of the photo as `#rrggbb`. Added by readLink after fetching the photo, never by extraction. */
  colour?: string
  templateGuess?: TemplateGuess
}

type Json = unknown
type JsonObject = Record<string, Json>
const SIZE_FIELDS = ['width', 'depth', 'height'] as const

export const extractProduct = (html: string, pageUrl: string): Product => {
  const root = parse(html)
  const product: Product = {}
  const fill = (fields: Partial<Product>) => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (product as Record<string, unknown>)[key] ??= value
    }
  }

  for (const item of jsonLdProducts(root)) fill(fromJsonLd(item))
  fill(fromMeta(root))
  fill(fromPage(root))

  if (SIZE_FIELDS.some((f) => product[f] === undefined)) {
    const { unlabeled, ...sized } = parseDimensions(visibleText(root))
    fill(sized)
    if (SIZE_FIELDS.some((f) => product[f] === undefined)) fill({ unlabeled })
  }

  if (product.photoUrl !== undefined) {
    const photoUrl = resolveUrl(product.photoUrl, pageUrl)
    if (photoUrl) product.photoUrl = photoUrl
    else delete product.photoUrl
  }
  if (product.name) fill({ templateGuess: guessTemplate(product.name) })
  return product
}

// ── JSON-LD ─────────────────────────────────────────────────────────

const isObject = (value: Json): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const first = (value: Json): Json => (Array.isArray(value) ? value[0] : value)

const isProduct = (node: JsonObject) => {
  const types = [node['@type']].flat()
  return types.some((t) => typeof t === 'string' && t.replace(/^.*[/:#]/, '') === 'Product')
}

/** Every Product node, in page order, from top-level objects, arrays and `@graph`. */
const jsonLdProducts = (root: HTMLElement): JsonObject[] => {
  const products: JsonObject[] = []
  const visit = (node: Json) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isObject(node)) return
    if (isProduct(node)) products.push(node)
    if (node['@graph']) visit(node['@graph'])
  }
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.rawText))
    } catch {
      // Broken JSON-LD: skip the block.
    }
  }
  return products
}

const text = (value: Json): string | undefined => {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  return value.trim() || undefined
}

const number = (value: Json): number | undefined => {
  const raw = text(value)?.replace(/\s/g, '')
  if (!raw) return undefined
  // "1.299,00" and "1,299.00": the last separator is the decimal one. "349,99" is 349.99.
  const decimal = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.'
  const thousands = decimal === ',' ? '.' : ','
  const result = Number(raw.replaceAll(thousands, '').replace(decimal, '.'))
  return Number.isFinite(result) ? result : undefined
}

// UN/CEFACT codes used by schema.org's QuantitativeValue.unitCode.
const UNIT_CODES: Record<string, string> = { CMT: 'cm', MMT: 'mm', MTR: 'm', INH: 'in' }

const size = (value: Json): number | undefined => {
  const node = first(value)
  if (isObject(node)) {
    const unit = UNIT_CODES[String(node.unitCode ?? '').toUpperCase()] ?? text(node.unitText)
    const amount = number(node.value)
    return amount === undefined || !unit ? undefined : sizeFromText(`${amount} ${unit}`)
  }
  const raw = text(node)
  return raw === undefined ? undefined : sizeFromText(raw)
}

/** "80 cm", "400 mm", "0.75 m" → cm. Reuses the text parser's units by labelling the value. */
const sizeFromText = (raw: string) => parseDimensions(`Width: ${raw}`).width

const image = (value: Json): string | undefined => {
  const node = first(value)
  return isObject(node) ? text(node.url) ?? text(node.contentUrl) : text(node)
}

const fromJsonLd = (item: JsonObject): Partial<Product> => {
  const offer = first(item.offers)
  const offerFields = isObject(offer)
    ? { price: number(offer.price) ?? number(offer.lowPrice), currency: text(offer.priceCurrency) }
    : {}
  return {
    name: text(item.name),
    width: size(item.width),
    depth: size(item.depth),
    height: size(item.height),
    ...offerFields,
    photoUrl: image(item.image),
  }
}

// ── Meta tags ───────────────────────────────────────────────────────

const fromMeta = (root: HTMLElement): Partial<Product> => {
  const meta = (key: string) => {
    for (const tag of root.querySelectorAll('meta')) {
      if ((tag.getAttribute('property') ?? tag.getAttribute('name')) === key) {
        const content = text(tag.getAttribute('content'))
        if (content) return content
      }
    }
    return undefined
  }
  return {
    name: meta('og:title') ?? pageTitle(meta('title')),
    price: number(meta('product:price:amount')),
    currency: meta('product:price:currency'),
    photoUrl: meta('og:image'),
  }
}

// ── Page title and visible price ────────────────────────────────────

/**
 * Amazon has no og:title, and its titles end in " : Amazon.es: Home & Kitchen".
 * The product name is what comes before. Other shops' titles are not used.
 */
const AMAZON_TITLE = /^(.*?)\s+:\s+Amazon\.[a-z.]+(?::.*)?$/is
const pageTitle = (title: string | undefined) => text(AMAZON_TITLE.exec(title ?? '')?.[1])

const CURRENCY_SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '$': 'USD' }

/** Amazon's visible price ("€55.90"), from the price block at the top of the page. */
const visiblePrice = (root: HTMLElement): Partial<Product> => {
  const raw = text(root.querySelector('#corePrice_feature_div .a-offscreen')?.text)
  const price = number(raw?.replace(/[^\d.,]/g, ''))
  if (price === undefined) return {}
  const symbol = Object.keys(CURRENCY_SYMBOLS).find((s) => raw!.includes(s))
  return { price, currency: symbol && CURRENCY_SYMBOLS[symbol] }
}

const fromPage = (root: HTMLElement): Partial<Product> => ({
  name: pageTitle(root.querySelector('title')?.text),
  ...visiblePrice(root),
})

// ── Text ────────────────────────────────────────────────────────────

// Sections with the package's size, not the item's, such as IKEA's "Peso e medidas da embalagem".
const PACKAGING = '[id*="packaging"], [class*="__package"]'

const visibleText = (root: HTMLElement): string => {
  const body = root.querySelector('body') ?? root
  for (const hidden of body.querySelectorAll(`script, style, noscript, template, ${PACKAGING}`)) hidden.remove()
  return body.structuredText
}

const resolveUrl = (url: string, pageUrl: string): string | undefined => {
  try {
    const resolved = new URL(url, pageUrl)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : undefined
  } catch {
    return undefined
  }
}

// ── Template guess ──────────────────────────────────────────────────

// Keywords in English, Spanish and Portuguese, written without accents.
// The earliest keyword in the name wins; at the same spot, the longer one ("table lamp" over "table").
const KEYWORDS: Record<TemplateGuess, string[]> = {
  sofa: ['sofa', 'couch', 'settee', 'chaise longue'],
  armchair: ['armchair', 'sillon', 'butaca', 'poltrona', 'cadeirao'],
  chair: ['chair', 'stool', 'silla', 'taburete', 'cadeira', 'banqueta'],
  table: ['table', 'mesa', 'mesita', 'nightstand'],
  desk: ['desk', 'escritorio', 'secretaria'],
  bed: ['bed', 'cama', 'canape'],
  wardrobe: ['wardrobe', 'cabinet', 'cupboard', 'dresser', 'chest of drawers', 'armario', 'comoda', 'roupeiro', 'guarda-roupa', 'aparador', 'sideboard'],
  shelf: ['shelf', 'shelving', 'bookcase', 'bookshelf', 'estanteria', 'estante', 'libreria', 'prateleira'],
  'tv-unit': ['tv unit', 'tv stand', 'tv bench', 'tv cabinet', 'media unit', 'mueble tv', 'mueble de tv', 'movel tv', 'movel de tv', 'rack tv'],
  rug: ['rug', 'carpet', 'alfombra', 'tapete', 'tapis'],
  lamp: ['lamp', 'table lamp', 'desk lamp', 'chandelier', 'pendant light', 'ceiling light', 'lampara', 'plafon', 'candeeiro', 'luminaria', 'lustre'],
  toilet: ['toilet', 'wc', 'sanita', 'inodoro', 'retrete', 'vaso sanitario'],
  bidet: ['bidet', 'bide'],
  sink: ['sink', 'washbasin', 'basin', 'lavabo', 'fregadero', 'lavatorio', 'lava-loica', 'pia'],
  'shower-tray': ['shower tray', 'plato de ducha', 'base de duche', 'base de chuveiro'],
  bathtub: ['bathtub', 'bath tub', 'banera', 'banheira'],
  hob: ['hob', 'cooktop', 'stovetop', 'placa de induccion', 'placa vitroceramica', 'placa de coccion', 'vitroceramica', 'placa de inducao'],
  oven: ['oven', 'microwave', 'horno', 'microondas', 'forno', 'micro-ondas'],
  'cooker-hood': ['cooker hood', 'range hood', 'extractor fan', 'extractor hood', 'campana', 'exaustor'],
  fridge: ['fridge', 'refrigerator', 'frigorifico', 'nevera', 'geladeira'],
  washer: ['washing machine', 'washer', 'dryer', 'tumble dryer', 'lavadora', 'secadora', 'maquina de lavar', 'maquina de secar', 'lavadoura'],
  'wall-panel': ['mirror', 'picture', 'painting', 'poster', 'wall shelf', 'espejo', 'cuadro', 'espelho', 'quadro', 'estante de pared'],
}

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const KEYWORD_PATTERNS = Object.entries(KEYWORDS).flatMap(([template, words]) =>
  words.map((word) => ({
    template: template as TemplateGuess,
    length: word.length,
    // Whole words, with an optional plural ending ("sofas", "camas", "lamparas").
    pattern: new RegExp(String.raw`(?<![\p{L}\d])${escape(word)}(?:e?s)?(?![\p{L}\d])`, 'u'),
  })),
)

export const guessTemplate = (name: string): TemplateGuess | undefined => {
  const folded = fold(name)
  let best: { index: number, length: number, template: TemplateGuess } | undefined
  for (const { template, length, pattern } of KEYWORD_PATTERNS) {
    const index = folded.search(pattern)
    if (index < 0) continue
    if (!best || index < best.index || (index === best.index && length > best.length)) best = { index, length, template }
  }
  return best?.template
}
