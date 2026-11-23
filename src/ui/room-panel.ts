// The panel for the selected room: its name, wall height and area, its finishes (floor material and colour, and a
// colour per wall, in the current version), a Focus button, and a Delete room button that asks first, in the app,
// how many items go with it. The walls fold open; hovering a wall's row highlights that wall in the view. Each finished edit is one change through the
// store. The rules are in src/model/room.ts. See "Rooms" in docs/spec.md.
import { getLanguage, t } from '../i18n/index.ts'
import { FLOOR_MATERIALS, floorOf, roomWalls, setFloor, setWallColour, wallColourOf, type FloorMaterial } from '../model/finishes.ts'
import { currentVersion, setPlan } from '../model/home.ts'
import { roomArea, type Point, type Room } from '../model/plan.ts'
import { itemsGoingWith, removeRoom, ROOM_HEIGHT_LIMITS, roomHeightError, updateRoom } from '../model/room.ts'
import type { Store } from '../model/store.ts'

export type RoomPanel = { show: (room: Room | null) => void; render: () => void }

export function mountRoomPanel(
  parent: HTMLElement,
  store: Store,
  focus: (room: Room) => void = () => {},
  highlightWall: (wall: { a: Point; b: Point } | null) => void = () => {},
): RoomPanel {
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

  const floorLabel = document.createElement('label')
  const floorText = document.createElement('span')
  const floorMaterial = document.createElement('select')
  floorMaterial.id = 'room-panel-floor'
  floorMaterial.name = floorMaterial.id
  const materialOptions = FLOOR_MATERIALS.map((m) => {
    const option = document.createElement('option')
    option.value = m
    return option
  })
  floorMaterial.append(...materialOptions)
  floorLabel.append(floorText, floorMaterial)
  const floorColour = field('room-panel-floor-colour', 'color')

  // The walls fold away, closed at first, so the panel stays short and leaves the view free to work in.
  const wallsSection = document.createElement('details')
  wallsSection.id = 'room-panel-walls-section'
  const wallsTitle = document.createElement('summary')
  const wallList = document.createElement('ul')
  wallList.id = 'room-panel-walls'
  wallList.className = 'walls'
  // One row per wall: its label and a colour input. Rebuilt when the room's outline changes.
  let wallRows: { a: Point; b: Point; length: number; text: HTMLSpanElement; input: HTMLInputElement }[] = []
  let wallsShape = ''

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

  const focusButton = document.createElement('button')
  focusButton.type = 'button'
  focusButton.id = 'room-panel-focus'
  focusButton.addEventListener('click', () => {
    if (room) focus(room)
  })

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
    floorText.textContent = t('room.panel.floor')
    materialOptions.forEach((option, i) => (option.textContent = t(`room.panel.floor.${FLOOR_MATERIALS[i]}`)))
    floorColour.text.textContent = t('room.panel.floorColour')
    wallsTitle.textContent = t('room.panel.walls')
    wallRows.forEach((row, i) => {
      row.text.textContent = t('room.panel.wall', { n: i + 1, length: Math.round(row.length) })
      row.input.setAttribute('aria-label', row.text.textContent)
    })
    focusButton.textContent = t('room.panel.focus')
    focusButton.title = t('room.panel.focus.title')
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
    if (room) showFinishes(room)
    else if (wallsShape !== '') {
      wallsShape = ''
      wallList.replaceChildren()
      wallRows = []
      highlightWall(null)
    }
    render()
  }

  const showFinishes = (room: Room) => {
    const { finishes } = currentVersion(store.get())
    const floor = floorOf(finishes, room.id)
    floorMaterial.value = floor.material
    floorColour.input.value = floor.colour
    const walls = roomWalls(room)
    const shape = `${room.id}:${JSON.stringify(room.corners)}`
    if (shape !== wallsShape) {
      wallsShape = shape
      highlightWall(null)
      const rows = walls.map((wall) => {
        const row = document.createElement('li')
        const label = document.createElement('label')
        const text = document.createElement('span')
        const input = document.createElement('input')
        input.type = 'color'
        label.append(text, input)
        row.append(label)
        row.addEventListener('pointerenter', () => highlightWall(wall))
        row.addEventListener('pointerleave', () => highlightWall(null))
        input.addEventListener('change', () => {
          const home = store.get()
          if (input.value !== wallColourOf(currentVersion(home).finishes, room.id, wall.a, wall.b)) store.set(setWallColour(home, room.id, wall.a, wall.b, input.value))
        })
        return { row, entry: { ...wall, text, input } }
      })
      wallList.replaceChildren(...rows.map((r) => r.row))
      wallRows = rows.map((r) => r.entry)
    }
    for (const row of wallRows) row.input.value = wallColourOf(finishes, room.id, row.a, row.b)
  }

  floorMaterial.addEventListener('change', () => {
    if (!room) return
    const home = store.get()
    const material = floorMaterial.value as FloorMaterial
    if (material !== floorOf(currentVersion(home).finishes, room.id).material) store.set(setFloor(home, room.id, { material }))
  })

  floorColour.input.addEventListener('change', () => {
    if (!room) return
    const home = store.get()
    const colour = floorColour.input.value
    if (colour !== floorOf(currentVersion(home).finishes, room.id).colour) store.set(setFloor(home, room.id, { colour }))
  })

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

  wallsSection.append(wallsTitle, wallList)
  render()
  const buttons = document.createElement('div')
  buttons.className = 'buttons'
  buttons.append(focusButton, remove)
  panel.append(title, name.label, height.label, message, area, floorLabel, floorColour.label, wallsSection, buttons, confirm)
  parent.appendChild(panel)
  return { show, render }
}
