// A select in the corner that changes the interface language and remembers the choice.
import { getLanguage, LANGUAGES, setLanguage, t, type Language } from '../i18n/index.ts'

/** Puts the page title and `<html lang>` in the current language. */
export function applyLanguage(): void {
  document.documentElement.lang = getLanguage()
  document.title = t('app.title')
}

export function mountLanguageSwitcher(parent: HTMLElement, onChange: () => void): void {
  const select = document.createElement('select')
  select.id = 'language'
  const render = () => {
    select.setAttribute('aria-label', t('language.label'))
    select.title = t('language.label')
    select.replaceChildren(
      ...LANGUAGES.map((lang) => {
        const option = document.createElement('option')
        option.value = lang
        option.textContent = t(`language.${lang}`)
        option.selected = lang === getLanguage()
        return option
      }),
    )
  }
  select.addEventListener('change', () => {
    setLanguage(select.value as Language)
    render()
    onChange()
  })
  render()
  parent.appendChild(select)
}
