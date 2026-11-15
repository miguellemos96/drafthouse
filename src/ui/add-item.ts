// The Add item button: opens the item form empty, and adds the item to the current version
// in the room the camera is looking at (see newItem in src/model/newItem.ts).
import { t } from '../i18n/index.ts'
import { addItem } from '../model/home.ts'
import type { FloorPoint } from '../model/item.ts'
import { newItem } from '../model/newItem.ts'
import type { Store } from '../model/store.ts'
import { createItemForm, type ItemForm } from './item-form.ts'

export type AddItemPanel = { form: ItemForm; render: () => void }

/** `lookPoint` is the floor point under the screen centre, or null when the camera doesn't look at the floor. */
export function mountAddItem(parent: HTMLElement, store: Store, lookPoint: () => FloorPoint | null): AddItemPanel {
  const panel = document.createElement('div')
  panel.id = 'add-item'

  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'add-item-button'

  const form = createItemForm(panel, (values) => {
    const home = store.get()
    store.set(addItem(home, newItem(home.plan, lookPoint(), values)))
  })
  button.addEventListener('click', () => (form.isOpen() ? form.close() : form.open()))

  const render = () => {
    button.textContent = t('item.add.open')
    form.render()
  }

  render()
  panel.append(button)
  parent.appendChild(panel)
  return { form, render }
}
