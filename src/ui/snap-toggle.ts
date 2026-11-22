// The Snap button and its `S` key. Off by default; the choice is remembered per browser.
import { t } from '../i18n/index.ts'
import { loadSnap, saveSnap } from '../model/snap.ts'
import { isTypingTarget } from './shortcuts.ts'

export type SnapToggle = { isOn: () => boolean; render: () => void }

export function mountSnapToggle(parent: HTMLElement): SnapToggle {
  let on = loadSnap()
  const button = document.createElement('button')
  button.id = 'snap-toggle'
  button.type = 'button'

  const render = () => {
    button.textContent = t('snap.label')
    button.title = t('snap.title', { key: 'S' })
    button.setAttribute('aria-pressed', String(on))
  }
  const toggle = () => {
    on = !on
    saveSnap(on)
    render()
  }

  button.addEventListener('click', toggle)
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() !== 's') return
    event.preventDefault()
    toggle()
  })

  render()
  parent.appendChild(button)
  return { isOn: () => on, render }
}
