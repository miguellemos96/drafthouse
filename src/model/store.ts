// Holds the current Home. The UI and the scene read from it and subscribe to its changes.
// It also keeps the undo history of this session: every `set` is one step. The history lives
// only in memory, so a reload starts fresh from the saved home. See "Saving" in docs/spec.md.
import type { Home } from './home.ts'

export type Listener = (home: Home) => void

/** The most undo steps kept; older ones are dropped. */
export const HISTORY_LIMIT = 200

export type Store = {
  get: () => Home
  /** Replaces the home as one undo step, and clears any steps that could be redone. */
  set: (home: Home) => void
  /** Steps back one change. Does nothing when there is nothing to undo. */
  undo: () => void
  /** Steps forward again after an undo. Does nothing when there is nothing to redo. */
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Calls `listener` after each `set`, `undo` and `redo`. Returns a function that unsubscribes it. */
  subscribe: (listener: Listener) => () => void
}

export const createStore = (initial: Home): Store => {
  let home = initial
  const past: Home[] = []
  const future: Home[] = []
  const listeners = new Set<Listener>()
  const show = (next: Home) => {
    home = next
    for (const listener of [...listeners]) listener(home)
  }
  return {
    get: () => home,
    set: (next) => {
      past.push(home)
      if (past.length > HISTORY_LIMIT) past.shift()
      future.length = 0
      show(next)
    },
    undo: () => {
      const previous = past.pop()
      if (previous === undefined) return
      future.push(home)
      show(previous)
    },
    redo: () => {
      const next = future.pop()
      if (next === undefined) return
      past.push(home)
      show(next)
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
