// English strings. This file is the source of the keys: es.ts and pt.ts must have every key here,
// with the same {placeholders}. Later issues add their own keys.
export const en = {
  'app.title': 'DraftHouse',
  'language.label': 'Language',
  'language.en': 'English',
  'language.es': 'Español',
  'language.pt': 'Português',
  'view.top': 'Top view',
  'view.orbit': '3D view',
}

export type StringKey = keyof typeof en
export type Strings = Record<StringKey, string>
