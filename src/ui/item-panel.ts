// The panel for the selected item: its name, width, depth, height and colour, each edited in place,
// and Duplicate and Delete buttons. For an item with a product it also shows the photo as a thumbnail,
// loaded straight from the shop, and a link that opens the product page in a new tab.
// Each finished edit (on change or Enter, not on every keystroke) is one change through the store,
// so it's autosaved and one undo step. A size out of 1–1000 cm shows a message and isn't saved.
import { t } from '../i18n/index.ts'
import { isValidSize, resizeItem } from '../model/editItem.ts'
import { updateItem } from '../model/home.ts'
import type { Item, Mount } from '../model/item.ts'
import { safeHttpUrl } from '../model/linkProduct.ts'
import { changeMount, placeOnMount } from '../model/mounts.ts'
import { ITEM_SIZE_LIMITS, SIZE_FIELDS, type SizeField } from '../model/newItem.ts'
import type { Store } from '../model/store.ts'
import { isMacPlatform } from './shortcuts.ts'

export type ItemPanel = { show: (item: Item | null) => void; render: () => void }

const PANEL_MOUNTS = ['floor', 'wall', 'ceiling'] as const
type PanelMount = (typeof PANEL_MOUNTS)[number]

export type ItemPanelActions ={ duplicate: () => void; remove: () => void }

export function mountItemPanel(parent: HTMLElement, store: Store, actions: ItemPanelActions, mac = isMacPlatform(navigator.platform)): ItemPanel {
  const panel = document.createElement('aside')
  panel.id = 'item-panel'
  panel.hidden = true

  let current: Item | null = null

  const field = (id: string, type: string) => {
    const label = document.createElement('label')
    const text = document.createElement('span')
    const input = document.createElement('input')
    input.id = id
    input.type = type
    label.append(text, input)
    return { label, text, input }
  }

  const name = field('item-panel-name', 'text')
  const sizes = Object.fromEntries(
    SIZE_FIELDS.map((f) => {
      const entry = field(`item-panel-${f}`, 'number')
      entry.input.min = String(ITEM_SIZE_LIMITS.min)
      entry.input.max = String(ITEM_SIZE_LIMITS.max)
      entry.input.step = '1'
      return [f, entry]
    }),
  ) as Record<SizeField, ReturnType<typeof field>>
  const colour = field('item-panel-colour', 'color')

  // The mount, and for a wall item its height on the wall. Each change re-places the item by its mount's rule.
  const mountLabel = document.createElement('label')
  const mountText = document.createElement('span')
  const mountSelect = document.createElement('select')
  mountSelect.id = 'item-panel-mount'
  const mountOptions = PANEL_MOUNTS.map((value) => {
    const option = document.createElement('option')
    option.value = value
    return option
  })
  mountSelect.append(...mountOptions)
  mountLabel.append(mountText, mountSelect)
  const elevation = field('item-panel-elevation', 'number')
  elevation.input.min = '0'
  elevation.input.step = '1'

  const message = document.createElement('p')
  message.id = 'item-panel-message'
  message.setAttribute('role', 'alert')
  message.hidden = true

  const button = (id: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.id = id
    b.addEventListener('click', onClick)
    return b
  }
  const duplicate = button('item-duplicate', () => actions.duplicate())
  const remove = button('item-delete', () => actions.remove())
  const buttons = document.createElement('div')
  buttons.className = 'buttons'
  buttons.append(duplicate, remove)

  const photo = document.createElement('img')
  photo.id = 'item-photo'
  photo.referrerPolicy = 'no-referrer'
  photo.hidden = true
  // A photo that fails to load just hides.
  photo.addEventListener('error', () => (photo.hidden = true))
  const link = document.createElement('a')
  link.id = 'item-link'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  let shownPhoto: string | undefined

  const save = (changes: Partial<Omit<Item, 'id'>>) => {
    if (current) store.set(updateItem(store.get(), current.id, changes))
  }

  /** Saves an edited item, re-placed by its mount's rule (a resized wall item stays flush and on its wall). */
  const saveItem = (edited: Item) => {
    const { position, rotation, elevation, mount, size } = placeOnMount(store.get().plan, edited)
    save({ position, rotation, elevation, mount, size })
  }

  /** Runs `commit` on change, and on Enter (which some browsers don't count as a change). */
  const onCommit = (input: HTMLInputElement, commit: () => void) => {
    input.addEventListener('change', commit)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit()
    })
  }

  onCommit(name.input, () => {
    if (!current) return
    const value = name.input.value.trim()
    // An empty name isn't saved; the field goes back to the item's name.
    if (!value) name.input.value = current.name
    else if (value !== current.name) save({ name: value })
  })

  const showSizeError = () => {
    const invalid = SIZE_FIELDS.filter((f) => sizes[f].input.getAttribute('aria-invalid') === 'true')
    message.hidden = invalid.length === 0
    message.textContent = t('item.form.error.size', { min: ITEM_SIZE_LIMITS.min, max: ITEM_SIZE_LIMITS.max })
  }

  for (const f of SIZE_FIELDS) {
    const { input } = sizes[f]
    onCommit(input, () => {
      if (!current) return
      const value = input.value.trim() === '' ? NaN : Number(input.value)
      const valid = isValidSize(value)
      input.setAttribute('aria-invalid', String(!valid))
      showSizeError()
      if (valid && value !== current.size[f]) saveItem(resizeItem(current, { [f]: value }))
    })
  }

  mountSelect.addEventListener('change', () => {
    const mount = mountSelect.value as Mount
    if (current && mount !== current.mount) saveItem(changeMount(store.get().plan, current, mount))
  })

  onCommit(elevation.input, () => {
    if (!current) return
    const value = elevation.input.value.trim() === '' ? NaN : Number(elevation.input.value)
    // Kept on the wall: from 0 to the wall height minus the item's height.
    const placed = Number.isFinite(value) ? placeOnMount(store.get().plan, { ...current, elevation: value }) : current
    elevation.input.value = String(placed.elevation)
    if (placed.elevation !== current.elevation) saveItem(placed)
  })

  colour.input.addEventListener('change', () => {
    if (current && colour.input.value !== current.colour) save({ colour: colour.input.value })
  })

  const render = () => {
    name.text.textContent = t('item.form.name')
    for (const f of SIZE_FIELDS) sizes[f].text.textContent = t(`item.form.${f}`)
    colour.text.textContent = t('item.form.colour')
    mountText.textContent = t('item.panel.mount')
    for (const option of mountOptions) option.textContent = t(`item.mount.${option.value as PanelMount}`)
    elevation.text.textContent = t('item.panel.elevation')
    duplicate.textContent = t('item.panel.duplicate')
    duplicate.title = t('item.panel.duplicate.title', { keys: mac ? '⌘D' : 'Ctrl+D' })
    remove.textContent = t('item.panel.delete')
    remove.title = t('item.panel.delete.title')
    photo.alt = t('item.panel.photo')
    link.textContent = t('item.panel.link')
    if (!message.hidden) showSizeError()
  }

  const show = (item: Item | null) => {
    current = item
    panel.hidden = !item
    if (!item) return
    name.input.value = item.name
    for (const f of SIZE_FIELDS) {
      sizes[f].input.value = String(item.size[f])
      sizes[f].input.removeAttribute('aria-invalid')
    }
    message.hidden = true
    colour.input.value = item.colour
    // An item on another item has no option here, so the select shows none.
    mountSelect.value = item.mount
    elevation.label.hidden = item.mount !== 'wall'
    elevation.input.value = String(item.elevation)

    const url = safeHttpUrl(item.product?.url)
    const photoUrl = safeHttpUrl(item.product?.photoUrl)
    if (url) link.href = url
    link.hidden = !url
    // Only reload (and un-hide) the photo when it changes, so a failed one stays hidden.
    if (photoUrl !== shownPhoto) {
      shownPhoto = photoUrl
      photo.hidden = !photoUrl
      if (photoUrl) photo.src = photoUrl
      else photo.removeAttribute('src')
    }
  }

  render()
  panel.append(name.label, sizes.width.label, sizes.depth.label, sizes.height.label, colour.label, mountLabel, elevation.label, message, photo, link, buttons)
  parent.appendChild(panel)
  return { show, render }
}
