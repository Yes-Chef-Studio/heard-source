// Heard: undo and redo for the markup on a screenshot.
//
// Each entry is the whole list of annotations as it stood after a change (drawing a shape,
// clearing them all). The lists are never mutated, so keeping one per step costs a reference, not
// a copy.

// More steps than anyone marks up one screenshot with; older ones fall off the end.
export const ANNOTATION_HISTORY_LIMIT = 200

export interface AnnotationHistory<T> {
  // Earlier states, oldest first.
  past: T[]
  present: T
  // States that were undone, next to redo first.
  future: T[]
}

export function createAnnotationHistory<T>(present: T): AnnotationHistory<T> {
  return { past: [], present, future: [] }
}

// Records a change. Anything that had been undone can no longer be redone.
export function pushAnnotationHistory<T>(
  history: AnnotationHistory<T>,
  next: T,
  limit = ANNOTATION_HISTORY_LIMIT
): AnnotationHistory<T> {
  if (next === history.present) return history
  const past = [...history.past, history.present]
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  }
}

export function canUndoAnnotation<T>(history: AnnotationHistory<T>): boolean {
  return history.past.length > 0
}

export function canRedoAnnotation<T>(history: AnnotationHistory<T>): boolean {
  return history.future.length > 0
}

export function undoAnnotation<T>(
  history: AnnotationHistory<T>
): AnnotationHistory<T> {
  const previous = history.past.at(-1)
  if (history.past.length === 0 || previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoAnnotation<T>(
  history: AnnotationHistory<T>
): AnnotationHistory<T> {
  const [next, ...future] = history.future
  if (history.future.length === 0 || next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future,
  }
}

export type AnnotationShortcut = "undo" | "redo"

// Cmd+Z / Ctrl+Z undo; Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y redo.
export function matchAnnotationShortcut(event: {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}): AnnotationShortcut | null {
  if (event.altKey || !(event.metaKey || event.ctrlKey)) return null
  const key = event.key.toLowerCase()
  if (key === "z") return event.shiftKey ? "redo" : "undo"
  // Cmd+Y belongs to the browser on a Mac (history), so only Ctrl+Y redoes.
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return "redo"
  }
  return null
}

// Input types that take typed text, where Cmd+Z should undo the typing.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

// True for an element with its own text undo: a text input, a textarea, or editable content.
export function isTextEntryElement(
  element:
    | {
        isContentEditable?: boolean
        tagName?: string
        type?: string
      }
    | null
    | undefined
): boolean {
  if (!element) return false
  if (element.isContentEditable) return true
  const tagName = element.tagName?.toLowerCase()
  if (tagName === "textarea") return true
  if (tagName !== "input") return false
  return !NON_TEXT_INPUT_TYPES.has((element.type ?? "text").toLowerCase())
}

// The element that really has keyboard focus. `document.activeElement` stops at the host of a
// shadow tree (the widget lives in one), so follow the focus down through each open root.
export function deepActiveElement(root: {
  activeElement: Element | null
}): Element | null {
  let active = root.activeElement
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active
}
