// The rooms list: a collapsible panel with one row per room. The eye shows or hides the room, and the
// name selects it. Which rooms are hidden is a view setting kept here, never in the store: it isn't saved
// and isn't an undo step. The rules are in src/model/visibility.ts. See "Looking around" in docs/spec.md.
import { t } from '../i18n/index.ts'
import type { Store } from '../model/store.ts'
import { pruneHidden, type HiddenRooms } from '../model/visibility.ts'

export type RoomsList = {
  /** The ids of the hidden rooms. */
  hidden: () => HiddenRooms
  render: () => void
}

export type RoomsListOptions = {
  parent: HTMLElement
  store: Store
  /** Called whenever the hidden rooms change. */
  onChange: (hidden: HiddenRooms) => void
  /** Called with the room whose name is clicked. */
  onSelect: (id: string) => void
}

export function mountRoomsList({ parent, store, onChange, onSelect }: RoomsListOptions): RoomsList {
  const panel = document.createElement('details')
  panel.id = 'rooms-list'
  const summary = document.createElement('summary')
  const list = document.createElement('ul')
  const empty = document.createElement('p')
  empty.className = 'empty'
  const showAll = document.createElement('button')
  showAll.type = 'button'
  showAll.id = 'rooms-show-all'
  panel.append(summary, list, empty, showAll)
  parent.appendChild(panel)

  let hidden: Set<string> = new Set()

  const setHidden = (next: Set<string>) => {
    hidden = next
    render()
    onChange(hidden)
  }

  const render = () => {
    const { rooms } = store.get().plan
    summary.textContent = t('rooms.title')
    showAll.textContent = t('rooms.showAll')
    showAll.disabled = hidden.size === 0
    empty.textContent = t('rooms.empty')
    empty.hidden = rooms.length > 0
    list.replaceChildren(
      ...rooms.map((room) => {
        const shown = !hidden.has(room.id)
        const row = document.createElement('li')
        row.dataset.room = room.id
        const eye = document.createElement('button')
        eye.type = 'button'
        eye.className = 'eye'
        eye.textContent = shown ? '👁' : '—'
        eye.setAttribute('aria-pressed', String(shown))
        eye.setAttribute('aria-label', t(shown ? 'rooms.hide' : 'rooms.show', { name: room.name }))
        eye.title = eye.getAttribute('aria-label')!
        eye.addEventListener('click', () => {
          const next = new Set(hidden)
          if (shown) next.add(room.id)
          else next.delete(room.id)
          setHidden(next)
        })
        const name = document.createElement('button')
        name.type = 'button'
        name.className = 'name'
        name.textContent = room.name
        name.addEventListener('click', () => onSelect(room.id))
        row.append(eye, name)
        if (!shown) row.classList.add('hidden-room')
        return row
      }),
    )
  }

  showAll.addEventListener('click', () => setHidden(new Set()))

  // Room names change and rooms go away through the store; a deleted room is forgotten.
  store.subscribe((home) => {
    const kept = pruneHidden(home.plan, hidden)
    if (kept.size !== hidden.size) setHidden(kept)
    else render()
  })

  render()
  return { hidden: () => hidden, render }
}
