// The panel for the selected room: its name, wall height and area, and a Delete room button that
// asks first, in the app, how many items go with it. Each finished edit is one change through the
// store. The rules are in src/model/room.ts. See "Rooms" in docs/spec.md.
import { getLanguage, t } from '../i18n/index.ts'
import { setPlan } from '../model/home.ts'
import { roomArea, type Room } from '../model/plan.ts'
import { itemsGoingWith, removeRoom, ROOM_HEIGHT_LIMITS, roomHeightError, updateRoom } from '../model/room.ts'
import type { Store } from '../model/store.ts'

export type RoomPanel = { show: (room: Room | null) => void; render: () => void }

export function mountRoomPanel(parent: HTMLElement, store: Store): RoomPanel {
  const panel = document.createElement('aside')
  panel.id = 'room-panel'
  panel.hidden = true

  const title = document.createElement('h2')

  const field = (id: string, type: string) => {
    const label = document.createElement('label')
    const text = document.createElement('span')
    const input = document.createElement('input')
    input.id = id
    input.name = id
    input.type = type
    label.append(text, input)
    return { label, text, input }
  }
  const name = field('room-panel-name', 'text')
  const height = field('room-panel-height', 'number')
  height.input.min = String(ROOM_HEIGHT_LIMITS.min)
  height.input.max = String(ROOM_HEIGHT_LIMITS.max)
  height.input.step = '1'

  const area = document.createElement('p')
  area.className = 'area'
  const areaLabel = document.createElement('span')
  const areaValue = document.createElement('output')
  areaValue.id = 'room-panel-area'
  area.append(areaLabel, areaValue)

  const message = document.createElement('p')
  message.id = 'room-panel-message'
  message.setAttribute('role', 'alert')
  message.hidden = true

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.id = 'room-panel-delete'

  const confirm = document.createElement('div')
  confirm.id = 'room-panel-confirm'
  confirm.setAttribute('role', 'alertdialog')
  confirm.hidden = true
  const question = document.createElement('p')
  question.id = 'room-panel-question'
  confirm.setAttribute('aria-labelledby', question.id)
  const yes = document.createElement('button')
  yes.type = 'button'
  const no = document.createElement('button')
  no.type = 'button'
  const answers = document.createElement('div')
  answers.className = 'buttons'
  answers.append(yes, no)
  confirm.append(question, answers)

  let room: Room | null = null
  let heightError = false

  const render = () => {
    title.textContent = t('room.panel.title')
    name.text.textContent = t('room.panel.name')
    height.text.textContent = t('room.panel.height')
    areaLabel.textContent = t('room.panel.area')
    remove.textContent = t('room.panel.delete')
    yes.textContent = t('room.panel.confirm.yes')
    no.textContent = t('room.panel.confirm.no')
    message.textContent = heightError ? t('room.add.error.height', ROOM_HEIGHT_LIMITS) : ''
    message.hidden = !heightError
    height.input.setAttribute('aria-invalid', String(heightError))
    if (!room) return
    const m2 = new Intl.NumberFormat(getLanguage(), { maximumFractionDigits: 2 }).format(roomArea(room))
    areaValue.textContent = `${m2} m²`
    if (!confirm.hidden) {
      const n = itemsGoingWith(store.get(), room.id)
      question.textContent = t(n === 0 ? 'room.panel.confirm.none' : n === 1 ? 'room.panel.confirm.one' : 'room.panel.confirm.many', { name: room.name, n })
    }
  }

  const show = (next: Room | null) => {
    const changedRoom = next?.id !== room?.id
    room = next
    panel.hidden = !room
    if (changedRoom) {
      heightError = false
      confirm.hidden = true
    }
    // A field being typed in keeps what the user typed until they finish.
    if (room && (changedRoom || document.activeElement !== name.input)) name.input.value = room.name
    if (room && (changedRoom || document.activeElement !== height.input)) height.input.value = String(room.height)
    render()
  }

  name.input.addEventListener('change', () => {
    if (!room) return
    const value = name.input.value.trim()
    // An empty name changes nothing.
    if (value === '' || value === room.name) {
      name.input.value = room.name
      return
    }
    const home = store.get()
    store.set(setPlan(home, updateRoom(home.plan, room.id, { name: value })))
  })

  height.input.addEventListener('change', () => {
    if (!room) return
    const value = height.input.value.trim() === '' ? Number.NaN : Number(height.input.value)
    heightError = roomHeightError(value)
    if (!heightError && value !== room.height) {
      const home = store.get()
      store.set(setPlan(home, updateRoom(home.plan, room.id, { height: value })))
    }
    render()
  })

  remove.addEventListener('click', () => {
    confirm.hidden = false
    render()
    no.focus()
  })
  no.addEventListener('click', () => {
    confirm.hidden = true
  })
  yes.addEventListener('click', () => {
    if (!room) return
    confirm.hidden = true
    store.set(removeRoom(store.get(), room.id))
  })

  render()
  panel.append(title, name.label, height.label, message, area, remove, confirm)
  parent.appendChild(panel)
  return { show, render }
}
