import { describe, expect, it } from 'vitest'
import { currentDevice, isViewOnly, VIEW_ONLY_MAX_WIDTH } from './device.ts'

describe('isViewOnly', () => {
  it('is view only on a 390 px wide touch screen', () => {
    expect(isViewOnly({ coarsePointer: true, width: 390 })).toBe(true)
  })

  it('stays editable on a 1280 px wide touch screen', () => {
    expect(isViewOnly({ coarsePointer: true, width: 1280 })).toBe(false)
  })

  it('stays editable with a mouse, however narrow the window', () => {
    expect(isViewOnly({ coarsePointer: false, width: 390 })).toBe(false)
  })

  it('switches at 768 px: narrower is a phone, 768 and wider is not', () => {
    expect(VIEW_ONLY_MAX_WIDTH).toBe(768)
    expect(isViewOnly({ coarsePointer: true, width: 767 })).toBe(true)
    expect(isViewOnly({ coarsePointer: true, width: 768 })).toBe(false)
  })
})

describe('currentDevice', () => {
  it('reads the pointer from the coarse media query and the width from the window', () => {
    const queries: string[] = []
    const win = {
      innerWidth: 412,
      matchMedia: (query: string) => {
        queries.push(query)
        return { matches: true } as MediaQueryList
      },
    }
    expect(currentDevice(win)).toEqual({ coarsePointer: true, width: 412 })
    expect(queries).toEqual(['(pointer: coarse)'])
  })
})
