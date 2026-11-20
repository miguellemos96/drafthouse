import { describe, expect, it } from 'vitest'
import { historyShortcut, isMacPlatform, itemShortcut } from './shortcuts.ts'

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
})

describe('historyShortcut', () => {
  it.each([
    [key('z', { ctrl: true }), 'undo'],
    [key('Z', { ctrl: true, shift: true }), 'redo'],
    [key('y', { ctrl: true }), 'redo'],
    [key('z'), null],
    [key('z', { meta: true }), null],
    [key('z', { ctrl: true, alt: true }), null],
    [key('x', { ctrl: true }), null],
  ] as const)('Windows and Linux: %j → %s', (event, expected) => {
    expect(historyShortcut(event, false)).toBe(expected)
  })

  it.each([
    [key('z', { meta: true }), 'undo'],
    [key('z', { meta: true, shift: true }), 'redo'],
    [key('Z', { meta: true, shift: true }), 'redo'],
    [key('z', { ctrl: true }), null],
    [key('y', { meta: true }), null],
  ] as const)('Mac: %j → %s', (event, expected) => {
    expect(historyShortcut(event, true)).toBe(expected)
  })
})

describe('isMacPlatform', () => {
  it.each([
    ['MacIntel', true],
    ['macOS', true],
    ['iPhone', true],
    ['iPad', true],
    ['Win32', false],
    ['Linux x86_64', false],
    ['', false],
  ])('%s → %s', (platform, expected) => {
    expect(isMacPlatform(platform)).toBe(expected)
  })
})

describe('itemShortcut', () => {
  it.each([
    [key('d', { ctrl: true }), false, 'duplicate'],
    [key('D', { ctrl: true }), false, 'duplicate'],
    [key('d', { meta: true }), true, 'duplicate'],
    [key('d', { meta: true }), false, null],
    [key('d', { ctrl: true }), true, null],
    [key('d'), false, null],
    [key('d', { ctrl: true, shift: true }), false, null],
    [key('Delete'), false, 'delete'],
    [key('Backspace'), false, 'delete'],
    [key('Backspace'), true, 'delete'],
    [key('Delete', { ctrl: true }), false, null],
    [key('Delete', { alt: true }), false, null],
  ] as const)('%j, mac %s → %s', (event, mac, expected) => {
    expect(itemShortcut(event, mac)).toBe(expected)
  })
})
