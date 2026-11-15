// Undo and Redo buttons, and their keyboard shortcuts. The buttons are disabled when there is
// nothing to undo or redo. Shortcuts are ignored while typing in a field, so the browser's own
// text undo still works there.
import { t } from '../i18n/index.ts'
import type { Store } from '../model/store.ts'
import { historyShortcut, isMacPlatform, isTypingTarget } from './shortcuts.ts'

export type UndoRedo = { render: () => void }

export function mountUndoRedo(parent: HTMLElement, store: Store, mac = isMacPlatform(navigator.platform)): UndoRedo {
  const bar = document.createElement('div')
  bar.id = 'history'

  const button = (id: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.id = id
    b.addEventListener('click', onClick)
    return b
  }
  const undo = button('undo', () => store.undo())
  const redo = button('redo', () => store.redo())

  const render = () => {
    undo.textContent = t('history.undo')
    redo.textContent = t('history.redo')
    undo.title = t('history.undo.title', { keys: mac ? '⌘Z' : 'Ctrl+Z' })
    redo.title = t('history.redo.title', { keys: mac ? '⌘⇧Z' : 'Ctrl+Y' })
    undo.disabled = !store.canUndo()
    redo.disabled = !store.canRedo()
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return
    const action = historyShortcut(event, mac)
    if (!action) return
    event.preventDefault()
    if (action === 'undo') store.undo()
    else store.redo()
  })

  store.subscribe(() => render())
  render()
  bar.append(undo, redo)
  parent.appendChild(bar)
  return { render }
}
