// Holds the current Home. The UI and the scene read from it and subscribe to its changes.
import type { Home } from './home.ts'

export type Listener = (home: Home) => void

export type Store = {
  get: () => Home
  set: (home: Home) => void
  /** Calls `listener` after each `set`. Returns a function that unsubscribes it. */
  subscribe: (listener: Listener) => () => void
}

export const createStore = (initial: Home): Store => {
  let home = initial
  const listeners = new Set<Listener>()
  return {
    get: () => home,
    set: (next) => {
      home = next
      for (const listener of [...listeners]) listener(home)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
