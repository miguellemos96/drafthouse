// A button that switches between the 3D orbit view and the top view.
import { t } from '../i18n/index.ts'

export type ViewToggle = { render: () => void }

export function mountViewToggle(parent: HTMLElement, isTopView: () => boolean, setTopView: (on: boolean) => void): ViewToggle {
  const button = document.createElement('button')
  button.id = 'view-toggle'
  button.type = 'button'
  const render = () => {
    const top = isTopView()
    button.textContent = top ? t('view.orbit') : t('view.top')
    button.setAttribute('aria-pressed', String(top))
  }
  button.addEventListener('click', () => {
    setTopView(!isTopView())
    render()
  })
  render()
  parent.appendChild(button)
  return { render }
}
