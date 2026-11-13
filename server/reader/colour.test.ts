import { describe, expect, it } from 'vitest'
import { mainColour } from './colour.ts'

type Rgba = [number, number, number, number]

const pixels = (...runs: [count: number, colour: Rgba][]) =>
  new Uint8Array(runs.flatMap(([count, colour]) => Array.from({ length: count }, () => colour).flat()))

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

describe('mainColour', () => {
  it('a 10 × 10 image that is all #336699 gives #336699', () => {
    expect(mainColour(pixels([100, [0x33, 0x66, 0x99, 255]]))).toBe('#336699')
  })

  it('a red square on a white background gives red, not white', () => {
    const colour = mainColour(pixels([900, [255, 255, 255, 255]], [100, [220, 20, 30, 255]]))
    expect(colour).toBe('#dc141e')
  })

  it('ignores almost-white pixels, all channels at 240 or above', () => {
    expect(mainColour(pixels([50, [240, 245, 250, 255]], [10, [0, 0, 0, 255]]))).toBe('#000000')
  })

  it('counts a light colour with one channel below 240', () => {
    expect(mainColour(pixels([50, [250, 250, 200, 255]], [10, [0, 0, 0, 255]]))).toBe('#fafac8')
  })

  it('ignores transparent pixels', () => {
    expect(mainColour(pixels([50, [0, 0, 255, 0]], [10, [0, 128, 0, 255]]))).toBe('#008000')
  })

  it('groups colours that round to the same level, so noise does not split the main colour', () => {
    const noisy = pixels([20, [100, 50, 50, 255]], [20, [102, 52, 54, 255]], [30, [10, 200, 10, 255]])
    const [r, g, b] = channels(mainColour(noisy)!)
    expect(r).toBeGreaterThanOrEqual(96)
    expect(r).toBeLessThan(104)
    expect(g).toBeGreaterThanOrEqual(48)
    expect(b).toBeLessThan(56)
  })

  it('returns undefined when nothing counts', () => {
    expect(mainColour(pixels([10, [255, 255, 255, 255]], [10, [0, 0, 0, 0]]))).toBeUndefined()
    expect(mainColour(new Uint8Array())).toBeUndefined()
  })
})
