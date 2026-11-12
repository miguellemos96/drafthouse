// The main colour of a product photo. Pure: RGBA pixels in, a hex colour out.
// See "Link reader" → "How it extracts" step 5 in docs/spec.md.

/** Levels per channel when grouping similar colours: 256 / 32 = 8 values per level. */
const LEVELS = 32
const STEP = 256 / LEVELS
/** A pixel with every channel at or above this is background white, not the product. */
const NEAR_WHITE = 240
/** A pixel with alpha below this is transparent background. */
const OPAQUE = 128

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/**
 * The most common colour in `rgba` (4 bytes per pixel) after rounding each channel to 32 levels,
 * ignoring almost-white and transparent pixels. Returns the average of the pixels in the winning
 * group as `#rrggbb`, or undefined when no pixel counts.
 */
export const mainColour = (rgba: Uint8Array): string | undefined => {
  const groups = new Map<number, { count: number; r: number; g: number; b: number }>()
  let best: { count: number; r: number; g: number; b: number } | undefined
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    if (rgba[i + 3] < OPAQUE) continue
    if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) continue
    const key = (Math.floor(r / STEP) * LEVELS + Math.floor(g / STEP)) * LEVELS + Math.floor(b / STEP)
    let group = groups.get(key)
    if (!group) {
      group = { count: 0, r: 0, g: 0, b: 0 }
      groups.set(key, group)
    }
    group.count++
    group.r += r
    group.g += g
    group.b += b
    if (!best || group.count > best.count) best = group
  }
  if (!best) return undefined
  return `#${hex(best.r / best.count)}${hex(best.g / best.count)}${hex(best.b / best.count)}`
}
