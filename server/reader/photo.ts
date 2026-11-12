// Decodes a product photo (JPEG, PNG or WebP) to a small RGBA thumbnail and returns its main colour.
// The image stays in memory only for this call: it is never stored or returned.

import sharp from 'sharp'
import { mainColour } from './colour.ts'

const FORMATS = new Set(['jpeg', 'png', 'webp'])
/** Refuse images that would decode to more pixels than this (decompression bombs). */
const MAX_INPUT_PIXELS = 50_000_000
/** The colour is counted on a thumbnail at most this many pixels on a side. */
const THUMBNAIL = 200

/** The main colour of the photo in `bytes`, or undefined if it isn't a JPEG, PNG or WebP that decodes. */
export const photoColour = async (bytes: Uint8Array): Promise<string | undefined> => {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    const { format } = await image.metadata()
    if (!format || !FORMATS.has(format)) return undefined
    const pixels = await image
      .ensureAlpha()
      // Nearest neighbour keeps real pixel colours instead of blending edges into new ones.
      .resize(THUMBNAIL, THUMBNAIL, { fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
      .raw()
      .toBuffer()
    return mainColour(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength))
  } catch {
    return undefined
  }
}
