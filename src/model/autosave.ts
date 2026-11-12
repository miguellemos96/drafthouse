// Keeps the Home in the browser's localStorage. A blocked or missing storage never throws:
// the home then lasts until the page closes. See "Saving" in docs/spec.md.
import type { Home } from './home.ts'
import { fromFile, toFile } from './saveFile.ts'

export const HOME_KEY = 'drafthouse.home'

/** The saved home if there is one and it reads cleanly; otherwise `fallback()`. */
export function loadHome(fallback: () => Home): Home {
  let text: string | null = null
  try {
    text = localStorage.getItem(HOME_KEY)
  } catch {
    // Storage blocked or unavailable.
  }
  if (text === null) return fallback()
  const result = fromFile(text)
  return result.ok ? result.home : fallback()
}

export function saveHome(home: Home): void {
  try {
    localStorage.setItem(HOME_KEY, toFile(home))
  } catch {
    // Storage blocked, unavailable or full: keep going without saving.
  }
}
