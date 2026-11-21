// Phones are view only ("Devices" in docs/spec.md): a touch screen narrower than this opens the
// home to look at, with every editing control hidden. A touch laptop with a wide screen stays editable.

/** Viewports narrower than this many CSS pixels count as a phone, when the primary pointer is coarse. */
export const VIEW_ONLY_MAX_WIDTH = 768

export type Device = {
  /** True when `(pointer: coarse)` matches: the primary pointer is a finger, not a mouse or a pen. */
  coarsePointer: boolean
  /** The viewport width in CSS pixels. */
  width: number
}

/** True when the app should open in view-only mode on this device. */
export const isViewOnly = ({ coarsePointer, width }: Device): boolean => coarsePointer && width < VIEW_ONLY_MAX_WIDTH

/** Reads the device from the browser. */
export const currentDevice = (win: Pick<Window, 'matchMedia' | 'innerWidth'> = window): Device => ({
  coarsePointer: win.matchMedia('(pointer: coarse)').matches,
  width: win.innerWidth,
})
