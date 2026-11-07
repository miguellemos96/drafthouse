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
// Words that may sit next to a label without making it some other measurement
// ("Overall width", "Altura total"). Anything else ("Seat height") is ignored.
const QUALIFIERS = new Set(['overall', 'total', 'max', 'maximum', 'máx', 'máxima', 'máximo', 'product', 'external', 'exterior', 'outer'])

const alternation = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join('|')
const LONG = alternation(Object.keys(LONG_LABELS))
const ANY_LABEL = alternation([...Object.keys(LONG_LABELS), ...Object.keys(SHORT_LABELS)])
const NUM = String.raw`\d+(?:[.,]\d+)?`
const UNIT = String.raw`(?:mm|cm|m|inches|inch|in|"|″)(?![\p{L}])`
const QUALIFIER = alternation([...QUALIFIERS])

const ITEM = String.raw`(?:(?<!\p{L})(?:${ANY_LABEL})\s*:?\s*)?${NUM}\s*(?:${UNIT})?`
const SEP = String.raw`\s*[x×]\s*`
const SEQUENCE = new RegExp(String.raw`${ITEM}(?:${SEP}${ITEM}){1,2}`, 'giu')
const SEQUENCE_PART = new RegExp(String.raw`^(?:(${ANY_LABEL})\s*:?\s*)?(${NUM})\s*(${UNIT})?$`, 'iu')
const SINGLE = new RegExp(String.raw`(?<!\p{L})(${LONG})(?:\s+(?:${QUALIFIER}))?\s*:?\s*(${NUM})\s*(${UNIT})`, 'giu')
const VALUE_WITH_UNIT = new RegExp(String.raw`${NUM}\s*(?:${UNIT})?`, 'giu')

const toCm = (number: string, unit: string): number => {
  const value = Number(number.replace(',', '.'))
  const factor = { mm: 0.1, cm: 1, m: 100 }[unit.toLowerCase()] ?? 2.54 // the rest are inches
  return Math.round(value * factor * 10) / 10
}

const labelAxis = (label: string): Axis | undefined => {
  const key = label.toLowerCase()
  return LONG_LABELS[key] ?? SHORT_LABELS[key]
}

/** Reads "a x b [x c] unit" sequences. Fully labelled ones set axes; others become `unlabeled`. */
const readSequences = (text: string, result: Dimensions) => {
  for (const [span] of text.matchAll(SEQUENCE)) {
    const parts = span.split(new RegExp(SEP, 'iu')).map((part) => SEQUENCE_PART.exec(part.trim()))
    if (parts.some((p) => !p)) continue
    const trailingUnit = parts.at(-1)![3]
    if (!trailingUnit && parts.every((p) => !p![3])) continue // no unit: not a size
    const values = parts.map((p) => ({ axis: p![1] ? labelAxis(p![1]) : undefined, cm: toCm(p![2], p![3] ?? trailingUnit) }))

    const axes = values.map((v) => v.axis)
    if (axes.every(Boolean) && new Set(axes).size === axes.length) {
      for (const v of values) result[v.axis!] ??= v.cm
    } else {
      result.unlabeled ??= values.map((v) => v.cm)
    }
  }
}

/** Is the label plain, or only qualified by allowed words? "Seat height" is not. */
const isPlain = (text: string, labelStart: number): boolean => {
  const clauseStart = Math.max(...['\n', ',', ';', '|', ':', '.'].map((s) => text.lastIndexOf(s, labelStart - 1))) + 1
  const words = text.slice(clauseStart, labelStart).replace(VALUE_WITH_UNIT, ' ').match(/\p{L}+/gu) ?? []
  return words.every((w) => QUALIFIERS.has(w.toLowerCase()))
}

/** Reads "Width: 210 cm"-style values. The first plain one per axis wins. */
const readSingles = (text: string, result: Dimensions) => {
  for (const match of text.matchAll(SINGLE)) {
    const [, label, number, unit] = match
    if (!isPlain(text, match.index)) continue
    result[labelAxis(label)!] ??= toCm(number, unit)
  }
}

export const parseDimensions = (text: string): Dimensions => {
  const result: Dimensions = {}
  const normalised = text.replaceAll(String.fromCharCode(0xa0), ' ') // non-breaking spaces
  readSequences(normalised, result)
  readSingles(normalised, result)
  return result
}
