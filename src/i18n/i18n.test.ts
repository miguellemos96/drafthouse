import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from './en.ts'
import {
  formatLength,
  getLanguage,
  LANGUAGES,
  loadLanguage,
  pickLanguage,
  placeholders,
  setLanguage,
  STRINGS,
  t,
  useLanguage,
  type StringKey,
} from './index.ts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('SecurityError')
  }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

afterEach(() => {
  vi.unstubAllGlobals()
  useLanguage('en')
})

describe('translations', () => {
  const keys = Object.keys(en) as StringKey[]

  for (const lang of LANGUAGES) {
    it(`${lang} has every key from en`, () => {
      const missing = keys.filter((k) => typeof STRINGS[lang][k] !== 'string' || STRINGS[lang][k] === '')
      expect(missing).toEqual([])
    })

    it(`${lang} uses the same placeholders as en`, () => {
      const differing = keys.filter(
        (k) => placeholders(STRINGS[lang][k] ?? '').join() !== placeholders(en[k]).join(),
      )
      expect(differing).toEqual([])
    })
  }

  it('starts with the app title and the language switcher', () => {
    expect(keys).toEqual(
      expect.arrayContaining(['app.title', 'language.label', 'language.en', 'language.es', 'language.pt']),
    )
  })
})

describe('placeholders', () => {
  it('finds each {name} once, sorted', () => {
    expect(placeholders('{width} by {depth}, {width}')).toEqual(['depth', 'width'])
    expect(placeholders('no placeholders')).toEqual([])
  })
})

describe('t', () => {
  it('returns the string in the current language', () => {
    useLanguage('es')
    expect(t('language.label')).toBe('Idioma')
    useLanguage('en')
    expect(t('language.label')).toBe('Language')
  })

  it('fills {name} placeholders from params', () => {
    // No real key has placeholders yet, so add one for the test.
    const strings = STRINGS.pt as Record<string, string>
    strings['test.greeting'] = 'Olá {name}, tens {count} itens'
    try {
      useLanguage('pt')
      expect(t('test.greeting' as StringKey, { name: 'Ana', count: 3 })).toBe('Olá Ana, tens 3 itens')
      expect(t('test.greeting' as StringKey, { name: 'Ana' })).toBe('Olá Ana, tens {count} itens')
    } finally {
      delete strings['test.greeting']
    }
  })
})

describe('pickLanguage', () => {
  it.each([
    [['es-ES'], 'es'],
    [['es-419', 'en'], 'es'],
    [['es'], 'es'],
    [['pt-BR'], 'pt'],
    [['pt-PT'], 'pt'],
    [['PT-br'], 'pt'],
    [['en-GB'], 'en'],
    [['fr-FR', 'de'], 'en'],
    [[], 'en'],
    [['fr-FR', 'pt-PT'], 'pt'],
    [['en-US', 'es-ES'], 'en'],
  ] as const)('%j → %s', (navigatorLanguages, expected) => {
    expect(pickLanguage(navigatorLanguages)).toBe(expected)
  })
})

describe('language choice', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('uses the browser language when nothing is remembered', () => {
    expect(loadLanguage(['pt-BR'])).toBe('pt')
    expect(getLanguage()).toBe('pt')
  })

  it('remembers the user override across loads', () => {
    loadLanguage(['pt-BR'])
    setLanguage('es')
    expect(getLanguage()).toBe('es')
    useLanguage('en')
    expect(loadLanguage(['pt-BR'])).toBe('es')
  })

  it('ignores a remembered value that is not a language', () => {
    localStorage.setItem('drafthouse.language', 'klingon')
    expect(loadLanguage(['es-MX'])).toBe('es')
  })

  it('still works when storage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(loadLanguage(['pt-BR'])).toBe('pt')
    expect(() => setLanguage('es')).not.toThrow()
    expect(getLanguage()).toBe('es')
  })

  it('still works when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadLanguage(['es-AR'])).toBe('es')
    expect(() => setLanguage('en')).not.toThrow()
  })
})

describe('formatLength', () => {
  it.each([
    [83, 'en', '83 cm'],
    [83, 'es', '83 cm'],
    [99, 'pt', '99 cm'],
    [0, 'en', '0 cm'],
    [100, 'en', '1 m'],
    [210, 'en', '2.1 m'],
    [210, 'es', '2,1 m'],
    [210, 'pt', '2,1 m'],
    [255, 'en', '2.55 m'],
    [1234, 'es', '12,34 m'],
    [83.4, 'en', '83 cm'],
    [99.6, 'en', '1 m'],
  ] as const)('%d cm in %s → %s', (cm, lang, expected) => {
    expect(formatLength(cm, lang)).toBe(expected)
  })

  it('uses the current language by default', () => {
    useLanguage('pt')
    expect(formatLength(210)).toBe('2,1 m')
  })
})
