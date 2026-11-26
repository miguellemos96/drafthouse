// Draws the view on demand: a frame only when something asks for one, never a steady 60 a second.

export type FrameScheduler = {
  /** Asks for a frame. Several requests before it is drawn draw it once. */
  requestRender: () => void
  /** How many frames have been drawn. */
  count: () => number
}

/**
 * `draw` draws one frame and returns true when the picture is still moving (camera damping, a focus
 * move), so another frame follows. `schedule` is `requestAnimationFrame`, passed in for tests.
 */
export const createFrameScheduler = (draw: () => boolean, schedule: (callback: () => void) => unknown): FrameScheduler => {
  let pending = false
  let frames = 0
  const requestRender = () => {
    if (pending) return
    pending = true
    schedule(() => {
      // Cleared first, so a request made while drawing (OrbitControls fires `change` from `update()`) asks for the next frame.
      pending = false
      frames += 1
      if (draw()) requestRender()
    })
  }
  return { requestRender, count: () => frames }
}
