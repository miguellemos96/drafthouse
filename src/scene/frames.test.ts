import { describe, expect, it } from 'vitest'
import { createFrameScheduler } from './frames.ts'

/** A stand-in for requestAnimationFrame: callbacks wait until `tick` runs them. */
const fakeFrames = () => {
  let queue: (() => void)[] = []
  return {
    schedule: (callback: () => void) => queue.push(callback),
    waiting: () => queue.length,
    tick: () => {
      const now = queue
      queue = []
      for (const callback of now) callback()
    },
  }
}

describe('createFrameScheduler', () => {
  it('draws nothing until a frame is asked for', () => {
    const raf = fakeFrames()
    let drawn = 0
    const frames = createFrameScheduler(() => (drawn++, false), raf.schedule)
    raf.tick()
    expect(drawn).toBe(0)
    expect(frames.count()).toBe(0)
  })

  it('draws several requests before the frame once', () => {
    const raf = fakeFrames()
    let drawn = 0
    const frames = createFrameScheduler(() => (drawn++, false), raf.schedule)
    frames.requestRender()
    frames.requestRender()
    frames.requestRender()
    expect(raf.waiting()).toBe(1)
    raf.tick()
    expect(drawn).toBe(1)
    expect(frames.count()).toBe(1)
    raf.tick()
    expect(drawn).toBe(1)
  })

  it('keeps drawing while the picture is still moving, then stops', () => {
    const raf = fakeFrames()
    let moving = 3
    const frames = createFrameScheduler(() => moving-- > 0, raf.schedule)
    frames.requestRender()
    for (let i = 0; i < 10; i++) raf.tick()
    expect(frames.count()).toBe(4)
    expect(raf.waiting()).toBe(0)
  })

  it('a request made while drawing asks for the next frame', () => {
    const raf = fakeFrames()
    let first = true
    const frames = createFrameScheduler(() => {
      if (first) frames.requestRender()
      first = false
      return false
    }, raf.schedule)
    frames.requestRender()
    raf.tick()
    expect(raf.waiting()).toBe(1)
    raf.tick()
    expect(frames.count()).toBe(2)
    expect(raf.waiting()).toBe(0)
  })
})
