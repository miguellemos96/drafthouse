// The version bar: a selector of the home's versions, and Duplicate, Rename and Delete for the
// current one. Each action is one store change, so it is autosaved and undone in one step.
// Rename opens a name field in the bar; Delete asks for confirmation in the bar first.
// With `canEdit: false` (phones, view only) the bar is just the selector.
// See "Versions and prices" in docs/spec.md; the rules are in src/model/home.ts.
import { t } from '../i18n/index.ts'
import { canDeleteVersion, currentVersion, deleteVersion, duplicateVersion, renameVersion, switchVersion } from '../model/home.ts'
import type { Store } from '../model/store.ts'

export type VersionBar = { render: () => void }

type Mode = 'idle' | 'renaming' | 'confirming'

export function mountVersionBar(parent: HTMLElement, store: Store, { canEdit = true }: { canEdit?: boolean } = {}): VersionBar {
  const bar = document.createElement('div')
  bar.id = 'versions'

  const button = (id: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.id = id
    b.addEventListener('click', onClick)
    return b
  }

  // A label beside the selector, not around it, so its name is only "Version".
  const selectRow = document.createElement('div')
  selectRow.className = 'row'
  const selectText = document.createElement('label')
  const select = document.createElement('select')
  select.id = 'version-select'
  selectText.htmlFor = select.id
  selectRow.append(selectText, select)
  select.addEventListener('change', () => {
    if (select.value !== store.get().currentVersionId) store.set(switchVersion(store.get(), select.value))
  })

  const duplicate = button('version-duplicate', () => {
    mode = 'idle'
    store.set(duplicateVersion(store.get(), crypto.randomUUID()))
  })
  const rename = button('version-rename', () => {
    mode = 'renaming'
    nameInput.value = currentVersion(store.get()).name
    nameInput.removeAttribute('aria-invalid')
    render()
    nameInput.focus()
    nameInput.select()
  })
  const remove = button('version-delete', () => {
    mode = 'confirming'
    render()
    confirmYes.focus()
  })
  const actions = document.createElement('div')
  actions.className = 'buttons'
  actions.append(duplicate, rename, remove)

  // Rename: a name field with Save and Cancel. Enter saves, Escape cancels.
  const renameForm = document.createElement('form')
  renameForm.id = 'version-rename-form'
  const nameLabel = document.createElement('label')
  const nameText = document.createElement('span')
  const nameInput = document.createElement('input')
  nameInput.id = 'version-name'
  nameInput.type = 'text'
  nameInput.maxLength = 80
  nameLabel.append(nameText, nameInput)
  const save = document.createElement('button')
  save.type = 'submit'
  const cancelRename = button('version-rename-cancel', () => close())
  const renameButtons = document.createElement('div')
  renameButtons.className = 'buttons'
  renameButtons.append(save, cancelRename)
  renameForm.append(nameLabel, renameButtons)
  renameForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (nameInput.value.trim() === '') {
      nameInput.setAttribute('aria-invalid', 'true')
      return
    }
    const home = store.get()
    const renamed = renameVersion(home, home.currentVersionId, nameInput.value)
    mode = 'idle'
    if (currentVersion(renamed).name !== currentVersion(home).name) store.set(renamed)
    else render()
  })

  // Delete: asks first, in the bar.
  const confirm = document.createElement('div')
  confirm.id = 'version-confirm'
  confirm.setAttribute('role', 'alertdialog')
  const question = document.createElement('p')
  question.id = 'version-confirm-text'
  confirm.setAttribute('aria-describedby', question.id)
  const confirmYes = button('version-delete-yes', () => {
    mode = 'idle'
    const home = store.get()
    const next = deleteVersion(home, home.currentVersionId)
    if (next !== home) store.set(next)
    else render()
  })
  const confirmNo = button('version-delete-cancel', () => close())
  const confirmButtons = document.createElement('div')
  confirmButtons.className = 'buttons'
  confirmButtons.append(confirmYes, confirmNo)
  confirm.append(question, confirmButtons)

  let mode: Mode = 'idle'
  const close = () => {
    mode = 'idle'
    render()
  }
  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode !== 'idle') {
      event.stopPropagation()
      close()
    }
  })

  const render = () => {
    const home = store.get()
    const current = currentVersion(home)
    selectText.textContent = t('version.label')
    select.replaceChildren(
      ...home.versions.map((v) => {
        const option = document.createElement('option')
        option.value = v.id
        option.textContent = v.name
        return option
      }),
    )
    select.value = home.currentVersionId
    duplicate.textContent = t('version.duplicate')
    duplicate.title = t('version.duplicate.title')
    rename.textContent = t('version.rename')
    remove.textContent = t('version.delete')
    const deletable = canDeleteVersion(home)
    remove.disabled = !deletable
    remove.title = deletable ? '' : t('version.delete.last')
    nameText.textContent = t('version.rename.name')
    save.textContent = t('version.rename.save')
    cancelRename.textContent = t('version.cancel')
    question.textContent = t('version.delete.confirm', { name: current.name })
    confirmYes.textContent = t('version.delete.yes')
    confirmNo.textContent = t('version.cancel')
    if (mode === 'confirming' && !deletable) mode = 'idle'
    renameForm.hidden = mode !== 'renaming'
    confirm.hidden = mode !== 'confirming'
    actions.hidden = mode !== 'idle'
    select.disabled = mode !== 'idle'
  }

  // Any change to the home (an undo, say) closes an open rename or confirmation, so it never acts on a stale version.
  store.subscribe(() => {
    mode = 'idle'
    render()
  })
  render()
  bar.append(selectRow, ...(canEdit ? [actions, renameForm, confirm] : []))
  parent.appendChild(bar)
  return { render }
}
