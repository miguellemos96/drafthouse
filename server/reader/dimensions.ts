// Finds an item's width, depth and height (in cm) in product-page text.
// English, Spanish and Portuguese. Pure: no I/O. See "Link reader" in docs/spec.md.

export interface Dimensions {
  width?: number
  depth?: number
  height?: number
  /** Numbers from a bare "210x95x83 cm": the user decides which is which. */
  unlabeled?: number[]
}

type Axis = 'width' | 'depth' | 'height'

// Full words: valid anywhere ("Width: 210 cm").
const LONG_LABELS: Record<string, Axis> = {
  width: 'width', largura: 'width', ancho: 'width', anchura: 'width',
  depth: 'depth', profundidade: 'depth', profundidad: 'depth', fondo: 'depth',
  height: 'height', altura: 'height', alto: 'height',
}
// Abbreviations: only inside an "a x b x c" sequence ("L 80 x P 40 x A 75 cm").
const SHORT_LABELS: Record<string, Axis> = {
  w: 'width', l: 'width', an: 'width',
  d: 'depth', p: 'depth', f: 'depth',
  h: 'height', a: 'height', al: 'height',
}
// English letters after a value ("273D x 175W x 66H") or after a sequence ("(L x W x H)").
// Here L is length, which is depth, as "Comprimento" is on IKEA's pages.
const LETTER_LABELS: Record<string, Axis> = { w: 'width', d: 'depth', l: 'depth', h: 'height' }
// Words that may sit next to a label without making it some other measurement
// ("Overall width", "Altura total"). Anything else ("Seat height") is ignored.
const QUALIFIERS = new Set(['overall', 'total', 'max', 'maximum', 'máx', 'máxima', 'máximo', 'product', 'external', 'exterior', 'outer'])
// Headings that introduce the item's own size ("Dimensões do produto: L 80 x ...").
// Any other word before a size ("Seat:", "Package dimensions:") makes it some other measurement.
const HEADINGS = new Set([
  'size', 'dimensions', 'dimension', 'measurements', 'item', 'of', 'the',
  'medidas', 'medida', 'tamanho', 'dimensões', 'dimensão', 'produto', 'do', 'da',
  'tamaño', 'dimensiones', 'producto', 'del', 'de',
])
const ALLOWED_BEFORE = new Set([...QUALIFIERS, ...HEADINGS, ...Object.keys(LONG_LABELS)])

const alternation = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join('|')
const LONG = alternation(Object.keys(LONG_LABELS))
const ANY_LABEL = alternation([...Object.keys(LONG_LABELS), ...Object.keys(SHORT_LABELS)])
const NUM = String.raw`\d+(?:[.,]\d+)?`
// Spelled-out units are tried first, so "centimetres" isn't read as "cm" plus letters.
const UNIT_WORDS = [
  'millimetres', 'millimeters', 'millimetre', 'millimeter', 'milímetros', 'milimetros',
  'centimetres', 'centimeters', 'centimetre', 'centimeter', 'centímetros', 'centimetros',
  'metres', 'meters', 'metre', 'meter', 'metros',
]
const UNIT = String.raw`(?:${alternation(UNIT_WORDS)}|mm|cm|m|inches|inch|in|"|″)(?![\p{L}\d²³])` // not m², m2, m³
const LETTER = String.raw`[dwhl](?!\p{L})`
const QUALIFIER = alternation([...QUALIFIERS])

// A value has a label before it ("L 80") or a letter after it ("80W"), never both.
const ITEM = String.raw`(?:(?<!\p{L})(?:${ANY_LABEL})\s*:?\s*${NUM}|${NUM}(?:${LETTER})?)\s*(?:${UNIT})?`
const SEP = String.raw`\s*[x×]\s*`
const SEQUENCE = new RegExp(String.raw`${ITEM}(?:${SEP}${ITEM}){1,2}`, 'giu')
const SEQUENCE_PART = new RegExp(String.raw`^(?:(${ANY_LABEL})\s*:?\s*)?(${NUM})(${LETTER})?\s*(${UNIT})?$`, 'iu')
// "(L x W x H)" right after a sequence.
const TRAILING_LABELS = /^\s*\(\s*(\p{L})\s*[x×]\s*(\p{L})(?:\s*[x×]\s*(\p{L}))?\s*\)/u
// "Width: 210 cm", or a table row with the unit in its label: "Largura (em cm)", then "241".
const SINGLE = new RegExp(
  String.raw`(?<!\p{L})(${LONG})(?:\s+(?:${QUALIFIER}))?\s*` +
  String.raw`(?:\(\s*(?:em|en|in)\s+(${UNIT})\s*\)\s*:?\s*(${NUM})(?![\p{L}\d])|:?\s*(${NUM})\s*(${UNIT}))`,
  'giu',
)
const VALUE_WITH_UNIT = new RegExp(String.raw`${NUM}\s*${UNIT}`, 'giu')

const toCm = (number: string, unit: string): number => {
  const value = Number(number.replace(',', '.'))
  return Math.round(value * unitFactor(unit.toLowerCase()) * 10) / 10
}

const unitFactor = (unit: string): number => {
  if (unit === 'mm' || unit.startsWith('mil')) return 0.1
  if (unit === 'cm' || unit.startsWith('cent')) return 1
  if (unit === 'm' || unit.startsWith('met')) return 100
  return 2.54 // the rest are inches
}

const labelAxis = (label: string): Axis | undefined => {
  const key = label.toLowerCase()
  return LONG_LABELS[key] ?? SHORT_LABELS[key]
}

/** Reads "a x b [x c] unit" sequences. Fully labelled ones set axes; others become `unlabeled`. */
const readSequences = (text: string, result: Dimensions) => {
  for (const match of text.matchAll(SEQUENCE)) {
    const span = match[0]
    if (!isPlain(text, match.index)) continue
    const parts = span.split(new RegExp(SEP, 'iu')).map((part) => SEQUENCE_PART.exec(part.trim()))
    if (parts.some((p) => !p)) continue
    const trailingUnit = parts.at(-1)![4]
    if (!trailingUnit && parts.every((p) => !p![4])) continue // no unit: not a size
    const values = parts.map((p) => ({
      axis: p![1] ? labelAxis(p![1]) : p![3] ? LETTER_LABELS[p![3].toLowerCase()] : undefined,
      cm: toCm(p![2], p![4] ?? trailingUnit),
    }))
    const trailing = TRAILING_LABELS.exec(text.slice(match.index + span.length))?.slice(1).filter(Boolean)
    if (trailing?.length === values.length && values.every((v) => !v.axis)) {
      trailing.forEach((letter, i) => (values[i].axis = LETTER_LABELS[letter.toLowerCase()]))
    }

    const axes = values.map((v) => v.axis)
    if (axes.every(Boolean) && new Set(axes).size === axes.length) {
      for (const v of values) result[v.axis!] ??= v.cm
    } else {
      result.unlabeled ??= values.map((v) => v.cm)
    }
  }
}

/**
 * Is the size at `start` the item's own, or some other measurement? Looks at the words
 * before it in the same clause: since the last line break or list separator, or the
 * last value with a unit. "Seat height" and "Package dimensions:" are not plain.
 */
const isPlain = (text: string, start: number): boolean => {
  const clauseStart = Math.max(...['\n', ',', ';', '|', '. '].map((s) => text.lastIndexOf(s, start - 1))) + 1
  let clause = text.slice(clauseStart, start)
  const lastValue = [...clause.matchAll(VALUE_WITH_UNIT)].at(-1)
  if (lastValue) clause = clause.slice(lastValue.index + lastValue[0].length)
  const words = clause.match(/\p{L}+/gu) ?? []
  return words.every((w) => ALLOWED_BEFORE.has(w.toLowerCase()))
}

/** Reads "Width: 210 cm"-style values. The first plain one per axis wins. */
const readSingles = (text: string, result: Dimensions) => {
  for (const match of text.matchAll(SINGLE)) {
    const [, label, rowUnit, rowNumber, number, unit] = match
    if (!isPlain(text, match.index)) continue
    result[labelAxis(label)!] ??= rowUnit ? toCm(rowNumber, rowUnit) : toCm(number, unit)
  }
}

export const parseDimensions = (text: string): Dimensions => {
  const result: Dimensions = {}
  const normalised = text.replaceAll(String.fromCharCode(0xa0), ' ') // non-breaking spaces
  readSequences(normalised, result)
  readSingles(normalised, result)
  return result
}
