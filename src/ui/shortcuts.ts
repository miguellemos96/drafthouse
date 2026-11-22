// Which keys undo and redo. Undo: Ctrl+Z (⌘Z on Mac). Redo: Ctrl+Y or Ctrl+Shift+Z (⌘⇧Z on Mac).

export type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function historyShortcut(event: KeyPress, mac: boolean): 'undo' | 'redo' | null {
  const command = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!command || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !mac && !event.shiftKey) return 'redo'
  return null
}

/** True for Apple platforms, from `navigator.platform` (or `userAgentData.platform`). */
export const isMacPlatform = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform)

const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

/** True while the focus is in a text field, where the browser's own text undo should win. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type)
}

/** Which keys duplicate and delete the selected item. Duplicate: Ctrl+D (⌘D on Mac). Delete: Delete or Backspace. */
export function itemShortcut(event: KeyPress, mac: boolean): 'duplicate' | 'delete' | null {
  const command = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (event.altKey) return null
  if (command && !event.shiftKey && event.key.toLowerCase() === 'd') return 'duplicate'
  const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey
  if (plain && (event.key === 'Delete' || event.key === 'Backspace')) return 'delete'
  return null
}
