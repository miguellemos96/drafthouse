// The panel for the selected door or window: width, height and sill height, each edited in place,
// Flip hinge and Flip swing for a door, and Delete. Each finished edit (on change or Enter) is one
// change through the store, so it's autosaved and one undo step. An edit that breaks a rule
// (see src/model/openings.ts) shows why and isn't saved.
import { t, type StringKey } from '../i18n/index.ts'
import { setPlan } from '../model/home.ts'
import { changeOpening, editOpening, openingProblems, removeOpening, wallOf, type Opening, type OpeningChanges } from '../model/openings.ts'
import { wallHeight } from '../model/plan.ts'
import type { Store } from '../model/store.ts'

export type OpeningPanel = { show: (opening: Opening | null) => void; render: () => void }

const SIZE_FIELDS = ['width', 'height', 'sillHeight'] as const
type SizeField = (typeof SIZE_FIELDS)[number]

export function mountOpeningPanel(parent: HTMLElement, store: Store, onDelete: () => void): OpeningPanel {
  const panel = document.createElement('aside')
  panel.id = 'opening-panel'
  panel.hidden = true

  const title = document.createElement('h2')
  let current: Opening | null = null

  const sizes = Object.fromEntries(
    SIZE_FIELDS.map((f) => {
      const label = document.createElement('label')
      const text = document.createElement('span')
      const input = document.createElement('input')
      input.id = `opening-${f}`
      input.type = 'number'
      input.min = '0'
      input.step = '1'
      label.append(text, input)
      return [f, { label, text, input }]
    }),
  ) as Record<SizeField, { label: HTMLLabelElement; text: HTMLSpanElement; input: HTMLInputElement }>

  const message = document.createElement('p')
  message.id = 'opening-panel-message'
  message.setAttribute('role', 'alert')
  message.hidden = true
  let problems: { keys: StringKey[]; max: number } = { keys: [], max: 0 }

  const button = (id: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.id = id
    b.addEventListener('click', onClick)
    return b
  }

  /** Saves the change as one step, or shows why it's refused. */
  const save = (changes: OpeningChanges, field?: SizeField) => {
    if (!current) return
    const home = store.get()
    const next = editOpening(home.plan, current.id, changes)
    for (const f of SIZE_FIELDS) sizes[f].input.removeAttribute('aria-invalid')
    if (next) {
      problems = { keys: [], max: 0 }
      store.set(setPlan(home, next))
    } else {
      const wall = wallOf(home.plan, current.wall)
      problems = {
        keys: openingProblems(home.plan, changeOpening(current, changes)).map((p) => `opening.error.${p}` satisfies StringKey),
        max: wall ? wallHeight(home.plan, wall) : 0,
      }
      if (field) sizes[field].input.setAttribute('aria-invalid', 'true')
    }
    showMessage()
  }

  const showMessage = () => {
    message.hidden = problems.keys.length === 0
    message.textContent = problems.keys.map((key) => t(key, { max: problems.max })).join(' ')
  }

  for (const f of SIZE_FIELDS) {
    const { input } = sizes[f]
    const commit = () => {
      if (!current) return
      const value = input.value.trim() === '' ? Number.NaN : Number(input.value)
      if (value !== current[f]) save({ [f]: value }, f)
    }
    input.addEventListener('change', commit)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit()
    })
  }

  const flipHinge = button('opening-flip-hinge', () => {
    if (current?.kind === 'door') save({ hinge: current.hinge === 'start' ? 'end' : 'start' })
  })
  const flipSwing = button('opening-flip-swing', () => {
    if (current?.kind === 'door') save({ swing: current.swing === 'in' ? 'out' : 'in' })
  })
  const remove = button('opening-delete', () => {
    if (!current) return
    const home = store.get()
    const id = current.id
    onDelete()
    store.set(setPlan(home, removeOpening(home.plan, id)))
  })
  const buttons = document.createElement('div')
  buttons.className = 'buttons'
  buttons.append(flipHinge, flipSwing, remove)

  const render = () => {
    title.textContent = current?.kind === 'door' ? t('opening.door') : t('opening.window')
    for (const f of SIZE_FIELDS) sizes[f].text.textContent = t(`opening.${f}` satisfies StringKey)
    flipHinge.textContent = t('opening.flipHinge')
    flipSwing.textContent = t('opening.flipSwing')
    remove.textContent = t('opening.delete')
    showMessage()
  }

  const show = (opening: Opening | null) => {
    if (opening?.id !== current?.id) problems = { keys: [], max: 0 }
    current = opening
    panel.hidden = !opening
    if (!opening) return
    for (const f of SIZE_FIELDS) {
      sizes[f].input.value = String(opening[f])
      sizes[f].input.removeAttribute('aria-invalid')
    }
    // A door's sill is always on the floor.
    sizes.sillHeight.input.disabled = opening.kind === 'door'
    flipHinge.hidden = opening.kind !== 'door'
    flipSwing.hidden = opening.kind !== 'door'
    render()
  }

  render()
  panel.append(title, ...SIZE_FIELDS.map((f) => sizes[f].label), message, buttons)
  parent.appendChild(panel)
  return { show, render }
}
