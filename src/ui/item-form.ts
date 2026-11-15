// The item form: name, template, width, depth and height in cm, colour, and an optional price and currency.
// Reusable: Add item opens it empty, and adding from a link (#34) opens it pre-filled.
// The sizes follow the chosen template's default size, except the ones the user typed (or that came pre-filled).
import { t, type StringKey } from '../i18n/index.ts'
import type { Size } from '../model/item.ts'
import { ITEM_SIZE_LIMITS, itemFormErrors, SIZE_FIELDS, type ItemFormField, type ItemFormValues, type SizeField } from '../model/newItem.ts'
import { templateFor } from '../model/placement.ts'
import { templateIds } from '../model/templates.ts'

export type ItemFormPrefill = Partial<Omit<ItemFormValues, 'size'>> & { size?: Partial<Size> }

export type ItemForm = {
  element: HTMLFormElement
  /** Shows the form, empty or with the given values. */
  open: (prefill?: ItemFormPrefill) => void
  close: () => void
  isOpen: () => boolean
  /** Redraws the labels in the current language. */
  render: () => void
}

const DEFAULT_TEMPLATE = 'box'
const DEFAULT_COLOUR = '#8c8c8c'
const DEFAULT_CURRENCY = 'EUR'

export function createItemForm(parent: HTMLElement, onSubmit: (values: ItemFormValues) => void): ItemForm {
  const form = document.createElement('form')
  form.id = 'item-form'
  form.noValidate = true // our own translated messages, not the browser's
  form.hidden = true

  const title = document.createElement('h2')

  const labelled = <T extends HTMLElement>(id: string, input: T) => {
    const label = document.createElement('label')
    const text = document.createElement('span')
    input.id = id
    input.setAttribute('name', id)
    label.append(text, input)
    return { label, text, input }
  }
  const inputField = (id: string, type: string) => {
    const input = document.createElement('input')
    input.type = type
    return labelled(id, input)
  }

  const name = inputField('item-name', 'text')
  const template = labelled('item-template', document.createElement('select'))
  for (const id of templateIds) {
    const option = document.createElement('option')
    option.value = id
    template.input.append(option)
  }
  const sizes = Object.fromEntries(
    SIZE_FIELDS.map((f) => {
      const entry = inputField(`item-${f}`, 'number')
      entry.input.min = String(ITEM_SIZE_LIMITS.min)
      entry.input.max = String(ITEM_SIZE_LIMITS.max)
      entry.input.step = '1'
      return [f, entry]
    }),
  ) as Record<SizeField, ReturnType<typeof inputField>>
  const colour = inputField('item-colour', 'color')
  const price = inputField('item-price', 'number')
  price.input.min = '0'
  price.input.step = '0.01'
  const currency = inputField('item-currency', 'text')
  currency.input.maxLength = 3
  currency.input.autocapitalize = 'characters'

  const submit = document.createElement('button')
  submit.type = 'submit'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  const buttons = document.createElement('div')
  buttons.className = 'buttons'
  buttons.append(submit, cancel)

  const message = document.createElement('p')
  message.id = 'item-form-message'
  message.setAttribute('role', 'alert')

  let errors: ItemFormField[] = []
  // Sizes the user typed (or that came pre-filled) stay when the template changes.
  const typed = new Set<SizeField>()

  const fillDefaultSizes = () => {
    const { defaultSize } = templateFor(template.input.value)
    for (const f of SIZE_FIELDS) if (!typed.has(f)) sizes[f].input.value = String(defaultSize[f])
  }
  for (const f of SIZE_FIELDS) sizes[f].input.addEventListener('input', () => typed.add(f))
  template.input.addEventListener('change', fillDefaultSizes)

  const render = () => {
    title.textContent = t('item.form.title')
    name.text.textContent = t('item.form.name')
    name.input.placeholder = t(`template.${template.input.value}` as StringKey)
    template.text.textContent = t('item.form.template')
    for (const option of template.input.options) option.textContent = t(`template.${option.value}` as StringKey)
    for (const f of SIZE_FIELDS) sizes[f].text.textContent = t(`item.form.${f}` satisfies StringKey)
    colour.text.textContent = t('item.form.colour')
    price.text.textContent = t('item.form.price')
    currency.text.textContent = t('item.form.currency')
    submit.textContent = t('item.form.submit')
    cancel.textContent = t('item.form.cancel')
    const sizeError = errors.some((f) => f !== 'price')
    message.textContent = [sizeError ? t('item.form.error.size', ITEM_SIZE_LIMITS) : '', errors.includes('price') ? t('item.form.error.price') : '']
      .filter(Boolean)
      .join(' ')
    message.hidden = errors.length === 0
    for (const f of SIZE_FIELDS) sizes[f].input.setAttribute('aria-invalid', String(errors.includes(f)))
    price.input.setAttribute('aria-invalid', String(errors.includes('price')))
  }
  template.input.addEventListener('change', render) // the name's placeholder follows the template

  const open = (prefill: ItemFormPrefill = {}) => {
    errors = []
    typed.clear()
    name.input.value = prefill.name ?? ''
    template.input.value = prefill.templateId && templateIds.includes(prefill.templateId as never) ? prefill.templateId : DEFAULT_TEMPLATE
    for (const f of SIZE_FIELDS) {
      const value = prefill.size?.[f]
      if (value !== undefined) {
        typed.add(f)
        sizes[f].input.value = String(value)
      }
    }
    fillDefaultSizes()
    colour.input.value = prefill.colour ?? DEFAULT_COLOUR
    price.input.value = prefill.price === undefined ? '' : String(prefill.price)
    currency.input.value = prefill.currency ?? DEFAULT_CURRENCY
    render()
    form.hidden = false
    name.input.focus()
  }

  const close = () => {
    form.hidden = true
  }
  cancel.addEventListener('click', close)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    // An empty or non-numeric box reads as NaN, which is out of range.
    const read = (input: HTMLInputElement) => (input.value.trim() === '' ? Number.NaN : Number(input.value))
    const size = { width: read(sizes.width.input), depth: read(sizes.depth.input), height: read(sizes.height.input) }
    const priceValue = price.input.value.trim() === '' && price.input.validity.valid ? undefined : read(price.input)
    errors = itemFormErrors({ size, price: priceValue })
    render()
    if (errors.length > 0) return
    const currencyValue = currency.input.value.trim().toUpperCase()
    const values: ItemFormValues = {
      name: name.input.value.trim() || t(`template.${template.input.value}` as StringKey),
      templateId: template.input.value,
      size,
      colour: colour.input.value,
    }
    if (priceValue !== undefined) values.price = priceValue
    if (currencyValue) values.currency = currencyValue
    close()
    onSubmit(values)
  })

  render()
  form.append(title, name.label, template.label, ...SIZE_FIELDS.map((f) => sizes[f].label), colour.label, price.label, currency.label, buttons, message)
  parent.appendChild(form)
  return { element: form, open, close, isOpen: () => !form.hidden, render }
}
