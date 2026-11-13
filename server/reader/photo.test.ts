import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { photoColour } from './photo.ts'

const solid = (format: 'png' | 'jpeg' | 'webp' | 'gif', hex: string) =>
  sharp({ create: { width: 10, height: 10, channels: 3, background: hex } })[format]({ quality: 100 } as never).toBuffer()

/** A red square in the middle of a white image, as a PNG. */
const redOnWhite = async () => {
  const red = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cc0000' } }).png().toBuffer()
  return sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } })
    .composite([{ input: red, left: 35, top: 35 }]).png().toBuffer()
}

const near = (hex: string | undefined, expected: string, tolerance: number) => {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  for (const i of [1, 3, 5]) {
    expect(Math.abs(parseInt(hex!.slice(i, i + 2), 16) - parseInt(expected.slice(i, i + 2), 16)))
      .toBeLessThanOrEqual(tolerance)
  }
}

describe('photoColour', () => {
  it('decodes a PNG', async () => {
    expect(await photoColour(await solid('png', '#336699'))).toBe('#336699')
  })

  it('decodes a JPEG', async () => {
    near(await photoColour(await solid('jpeg', '#336699')), '#336699', 8)
  })

  it('decodes a WebP', async () => {
    near(await photoColour(await solid('webp', '#336699')), '#336699', 8)
  })

  it('a red square on a white background gives red', async () => {
    expect(await photoColour(await redOnWhite())).toBe('#cc0000')
  })

  it('returns undefined for formats other than JPEG, PNG and WebP', async () => {
    expect(await photoColour(await solid('gif', '#336699'))).toBeUndefined()
    expect(await photoColour(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined()
  })

  it('returns undefined for bytes that are not an image', async () => {
    expect(await photoColour(new TextEncoder().encode('<html>not a photo</html>'))).toBeUndefined()
    expect(await photoColour(new Uint8Array())).toBeUndefined()
  })
})
