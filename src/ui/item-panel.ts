// The panel for the selected item's product: the photo as a thumbnail, loaded straight from the shop,
// and a link that opens the product page in a new tab. Hidden for items without a product link or photo.
import { t } from '../i18n/index.ts'
import type { Item } from '../model/item.ts'
import { safeHttpUrl } from '../model/linkProduct.ts'

export type ItemPanel = { show: (item: Item | null) => void; render: () => void }

export function mountItemPanel(parent: HTMLElement): ItemPanel {
  const panel = document.createElement('aside')
  panel.id = 'item-panel'
  panel.hidden = true

  const name = document.createElement('h2')
  const photo = document.createElement('img')
  photo.id = 'item-photo'
  photo.referrerPolicy = 'no-referrer'
  // A photo that fails to load just hides.
  photo.addEventListener('error', () => (photo.hidden = true))
  const link = document.createElement('a')
  link.id = 'item-link'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'

  let shownPhoto: string | undefined

  const render = () => {
    photo.alt = t('item.panel.photo')
    link.textContent = t('item.panel.link')
  }

  const show = (item: Item | null) => {
    const url = safeHttpUrl(item?.product?.url)
    const photoUrl = safeHttpUrl(item?.product?.photoUrl)
    panel.hidden = !item || (!url && !photoUrl)
    if (!item || panel.hidden) return
    name.textContent = item.name
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
  panel.append(name, photo, link)
  parent.appendChild(panel)
  return { show, render }
}
