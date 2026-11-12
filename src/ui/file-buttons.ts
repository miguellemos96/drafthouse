// Export and Import buttons: download the home as a .drafthouse.json file, or open one.
// A file that can't be opened shows a message and leaves the current home as it was.
import { t, type StringKey } from '../i18n/index.ts'
import { fileName, fromFile, toFile, type FileError } from '../model/saveFile.ts'
import type { Store } from '../model/store.ts'

export type FileButtons = { render: () => void }

export function mountFileButtons(parent: HTMLElement, store: Store): FileButtons {
  const bar = document.createElement('div')
  bar.id = 'file-buttons'

  const exportButton = document.createElement('button')
  exportButton.type = 'button'
  exportButton.id = 'export'
  exportButton.addEventListener('click', () => {
    const home = store.get()
    const url = URL.createObjectURL(new Blob([toFile(home)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName(home)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.hidden = true

  const importButton = document.createElement('button')
  importButton.type = 'button'
  importButton.id = 'import'
  importButton.addEventListener('click', () => input.click())

  const message = document.createElement('p')
  message.id = 'file-message'
  message.setAttribute('role', 'alert')
  let error: FileError | 'unreadable' | null = null

  const render = () => {
    exportButton.textContent = t('file.export')
    importButton.textContent = t('file.import')
    message.textContent = error ? t(`file.error.${error}` satisfies StringKey) : ''
    message.hidden = error === null
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = '' // so choosing the same file again fires another change
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      error = 'unreadable'
      render()
      return
    }
    const result = fromFile(text)
    error = result.ok ? null : result.error
    if (result.ok) store.set(result.home)
    render()
  })

  render()
  bar.append(exportButton, importButton, input, message)
  parent.appendChild(bar)
  return { render }
}
