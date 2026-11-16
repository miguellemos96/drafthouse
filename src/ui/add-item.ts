// The Add item button and the Add from link field: both open the item form, empty or filled from
// the product page, and add the item to the current version in the room the camera is looking at
// (see newItem in src/model/newItem.ts and "Adding a product from a link" in docs/spec.md).
import { t } from '../i18n/index.ts'
import { addItem } from '../model/home.ts'
import type { FloorPoint } from '../model/item.ts'
import { linkPrefill, readLinkResult, type ReadLinkResult } from '../model/linkProduct.ts'
import { newItem } from '../model/newItem.ts'
import type { Store } from '../model/store.ts'
import { createItemForm, type ItemForm } from './item-form.ts'

export type AddItemPanel = { form: ItemForm; render: () => void }

/** Asks the server to read the page. A network failure counts as `fetch-failed`. */
const readLink = async (url: string): Promise<ReadLinkResult> => {
  try {
    const response = await fetch('/api/read-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const json: unknown = await response.json().catch(() => undefined)
    return readLinkResult(response.status, json)
  } catch {
    return { error: 'fetch-failed' }
  }
}

/** `lookPoint` is the floor point under the screen centre, or null when the camera doesn't look at the floor. */
export function mountAddItem(parent: HTMLElement, store: Store, lookPoint: () => FloorPoint | null): AddItemPanel {
  const panel = document.createElement('div')
  panel.id = 'add-item'

  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'add-item-button'

  const linkRow = document.createElement('form')
  linkRow.id = 'add-from-link'
  linkRow.noValidate = true
  const linkInput = document.createElement('input')
  linkInput.type = 'url'
  linkInput.id = 'link-url'
  linkInput.autocomplete = 'off'
  const linkButton = document.createElement('button')
  linkButton.type = 'submit'
  linkButton.id = 'link-button'
  linkRow.append(linkInput, linkButton)

  const form = createItemForm(panel, (values) => {
    const home = store.get()
    store.set(addItem(home, newItem(home.plan, lookPoint(), values)))
  })
  button.addEventListener('click', () => (form.isOpen() ? form.close() : form.open()))

  let loading = false
  const render = () => {
    button.textContent = t('item.add.open')
    linkInput.setAttribute('aria-label', t('link.label'))
    linkInput.placeholder = t('link.label')
    linkButton.textContent = loading ? t('link.loading') : t('link.add')
    linkButton.disabled = loading
    panel.setAttribute('aria-busy', String(loading))
    form.render()
  }

  linkRow.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (loading) return
    const url = linkInput.value.trim()
    form.close()
    loading = true
    render()
    const result = await readLink(url)
    loading = false
    render()
    // The link stays in the field; after an error the form opens empty with only the link.
    form.open('product' in result ? linkPrefill(url, result.product) : { ...linkPrefill(url), error: result.error })
  })

  render()
  panel.append(linkRow, button)
  parent.appendChild(panel)
  return { form, render }
}
