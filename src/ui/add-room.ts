// The Add room panel: a name, width, length and height in cm make a rectangular room (quick start).
// Out-of-range sizes show a translated message and add nothing.
import { t, type StringKey } from '../i18n/index.ts'
import { setPlan } from '../model/home.ts'
import { addQuickRoom, QUICK_ROOM_DEFAULTS, QUICK_ROOM_LIMITS, quickRoomErrors, type QuickRoomField } from '../model/quickRoom.ts'
import type { Store } from '../model/store.ts'

export type AddRoomPanel = { render: () => void }

const FIELDS: QuickRoomField[] = ['width', 'length', 'height']

export function mountAddRoom(parent: HTMLElement, store: Store): AddRoomPanel {
  const form = document.createElement('form')
  form.id = 'add-room'
  form.noValidate = true // our own translated messages, not the browser's

  const title = document.createElement('h2')

  const field = (id: string, type: string, value: string) => {
    const label = document.createElement('label')
    const text = document.createElement('span')
    const input = document.createElement('input')
    input.id = id
    input.name = id
    input.type = type
    input.value = value
    label.append(text, input)
    return { label, text, input }
  }

  const defaultName = () => t('room.defaultName', { n: store.get().plan.rooms.length + 1 })
  const name = field('room-name', 'text', defaultName())
  let nameEdited = false
  name.input.addEventListener('input', () => (nameEdited = true))

  const sizes = Object.fromEntries(
    FIELDS.map((f) => {
      const { min, max } = QUICK_ROOM_LIMITS[f]
      const entry = field(`room-${f}`, 'number', String(QUICK_ROOM_DEFAULTS[f]))
      entry.input.min = String(min)
      entry.input.max = String(max)
      entry.input.step = '1'
      return [f, entry]
    }),
  ) as Record<QuickRoomField, ReturnType<typeof field>>

  const submit = document.createElement('button')
  submit.type = 'submit'

  const message = document.createElement('p')
  message.id = 'add-room-message'
  message.setAttribute('role', 'alert')
  let errors: QuickRoomField[] = []

  const render = () => {
    title.textContent = t('room.add.title')
    name.text.textContent = t('room.add.name')
    if (!nameEdited) name.input.value = defaultName()
    for (const f of FIELDS) sizes[f].text.textContent = t(`room.add.${f}` satisfies StringKey)
    submit.textContent = t('room.add.submit')
    message.textContent = errors.map((f) => t(`room.add.error.${f}` satisfies StringKey, QUICK_ROOM_LIMITS[f])).join(' ')
    message.hidden = errors.length === 0
    for (const f of FIELDS) sizes[f].input.setAttribute('aria-invalid', String(errors.includes(f)))
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    // An empty or non-numeric box reads as NaN, which is out of range.
    const read = (f: QuickRoomField) => (sizes[f].input.value.trim() === '' ? Number.NaN : Number(sizes[f].input.value))
    const size = { width: read('width'), length: read('length'), height: read('height') }
    errors = quickRoomErrors(size)
    if (errors.length === 0) {
      const home = store.get()
      const roomName = name.input.value.trim() || defaultName()
      nameEdited = false
      store.set(setPlan(home, addQuickRoom(home.plan, { name: roomName, ...size })))
    }
    render()
  })

  // Rooms can change elsewhere (import, undo later): keep the suggested name in step.
  store.subscribe(() => render())

  render()
  form.append(title, name.label, ...FIELDS.map((f) => sizes[f].label), submit, message)
  parent.appendChild(form)
  return { render }
}
