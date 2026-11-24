import { describe, expect, it } from "bun:test"
import {
  type AnnotationHistory,
  canRedoAnnotation,
  canUndoAnnotation,
  createAnnotationHistory,
  deepActiveElement,
  isTextEntryElement,
  matchAnnotationShortcut,
  pushAnnotationHistory,
  redoAnnotation,
  undoAnnotation,
} from "../src/ui/capture-widget/utils/annotation-history"

type Marks = string[]

const key = (
  input: Partial<Parameters<typeof matchAnnotationShortcut>[0]> & {
    key: string
  }
) =>
  matchAnnotationShortcut({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...input,
  })

function draw(history: AnnotationHistory<Marks>, mark: string) {
  return pushAnnotationHistory(history, [...history.present, mark])
}

describe("annotation history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = createAnnotationHistory<Marks>([])

    expect(canUndoAnnotation(history)).toBe(false)
    expect(canRedoAnnotation(history)).toBe(false)
    expect(undoAnnotation(history)).toBe(history)
    expect(redoAnnotation(history)).toBe(history)
  })

  it("undoes one annotation at a time, back to the bare screenshot", () => {
    let history = createAnnotationHistory<Marks>([])
    history = draw(history, "arrow")
    history = draw(history, "box")

    history = undoAnnotation(history)
    expect(history.present).toEqual(["arrow"])
    history = undoAnnotation(history)
    expect(history.present).toEqual([])
    expect(canUndoAnnotation(history)).toBe(false)
  })

  it("redoes what was undone, in order", () => {
    let history = createAnnotationHistory<Marks>([])
    history = draw(history, "arrow")
    history = draw(history, "box")
    history = undoAnnotation(undoAnnotation(history))

    history = redoAnnotation(history)
    expect(history.present).toEqual(["arrow"])
    history = redoAnnotation(history)
    expect(history.present).toEqual(["arrow", "box"])
    expect(canRedoAnnotation(history)).toBe(false)
  })

  it("drops the redo steps once something new is drawn", () => {
    let history = createAnnotationHistory<Marks>([])
    history = draw(history, "arrow")
    history = draw(history, "box")
    history = undoAnnotation(history)
    history = draw(history, "highlight")

    expect(history.present).toEqual(["arrow", "highlight"])
    expect(canRedoAnnotation(history)).toBe(false)
    expect(undoAnnotation(history).present).toEqual(["arrow"])
  })

  it("makes clearing everything a step that can be undone and redone", () => {
    let history = createAnnotationHistory<Marks>([])
    history = draw(history, "arrow")
    history = draw(history, "box")
    history = pushAnnotationHistory(history, [])
    expect(history.present).toEqual([])

    history = undoAnnotation(history)
    expect(history.present).toEqual(["arrow", "box"])
    history = redoAnnotation(history)
    expect(history.present).toEqual([])
  })

  it("hands back the same lists rather than copies", () => {
    const first: Marks = ["arrow"]
    const second: Marks = ["arrow", "box"]
    let history = createAnnotationHistory<Marks>([])
    history = pushAnnotationHistory(history, first)
    history = pushAnnotationHistory(history, second)

    expect(undoAnnotation(history).present).toBe(first)
    expect(redoAnnotation(undoAnnotation(history)).present).toBe(second)
  })

  it("ignores a change that changes nothing", () => {
    const history = draw(createAnnotationHistory<Marks>([]), "arrow")

    expect(pushAnnotationHistory(history, history.present)).toBe(history)
  })

  it("forgets the oldest steps beyond the limit", () => {
    let history = createAnnotationHistory<Marks>([])
    for (const mark of ["a", "b", "c", "d"]) {
      history = pushAnnotationHistory(history, [...history.present, mark], 2)
    }

    expect(history.past).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
    ])
    history = undoAnnotation(undoAnnotation(history))
    expect(history.present).toEqual(["a", "b"])
    expect(canUndoAnnotation(history)).toBe(false)
  })
})

describe("annotation shortcuts", () => {
  it("undoes on Cmd+Z and Ctrl+Z", () => {
    expect(key({ key: "z", metaKey: true })).toBe("undo")
    expect(key({ key: "z", ctrlKey: true })).toBe("undo")
    expect(key({ key: "Z", ctrlKey: true })).toBe("undo")
  })

  it("redoes on Cmd+Shift+Z, Ctrl+Shift+Z and Ctrl+Y", () => {
    expect(key({ key: "Z", metaKey: true, shiftKey: true })).toBe("redo")
    expect(key({ key: "z", ctrlKey: true, shiftKey: true })).toBe("redo")
    expect(key({ key: "y", ctrlKey: true })).toBe("redo")
  })

  it("leaves other keys and modifiers alone", () => {
    expect(key({ key: "z" })).toBeNull()
    expect(key({ key: "y" })).toBeNull()
    expect(key({ key: "z", metaKey: true, altKey: true })).toBeNull()
    // Cmd+Y opens the browser's history on a Mac.
    expect(key({ key: "y", metaKey: true })).toBeNull()
    expect(key({ key: "s", metaKey: true })).toBeNull()
  })
})

describe("text fields keep their own undo", () => {
  it("recognises fields that take typed text", () => {
    expect(isTextEntryElement({ tagName: "TEXTAREA" })).toBe(true)
    expect(isTextEntryElement({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(isTextEntryElement({ tagName: "INPUT", type: "email" })).toBe(true)
    expect(isTextEntryElement({ tagName: "INPUT" })).toBe(true)
    expect(
      isTextEntryElement({ tagName: "DIV", isContentEditable: true })
    ).toBe(true)
  })

  it("does not count buttons, selects, the canvas or the page body", () => {
    expect(isTextEntryElement(null)).toBe(false)
    expect(isTextEntryElement({ tagName: "BODY" })).toBe(false)
    expect(isTextEntryElement({ tagName: "CANVAS" })).toBe(false)
    expect(isTextEntryElement({ tagName: "BUTTON", type: "button" })).toBe(
      false
    )
    expect(isTextEntryElement({ tagName: "SELECT", type: "select-one" })).toBe(
      false
    )
    expect(isTextEntryElement({ tagName: "INPUT", type: "checkbox" })).toBe(
      false
    )
  })

  it("finds the focused field inside the widget's shadow tree", () => {
    const title = { tagName: "INPUT", type: "text", shadowRoot: null }
    const host = { tagName: "DIV", shadowRoot: { activeElement: title } }
    const page = { activeElement: host } as unknown as Document

    expect(deepActiveElement(page)).toBe(title as unknown as Element)
    expect(isTextEntryElement(deepActiveElement(page) as HTMLElement)).toBe(
      true
    )
  })

  it("stops at the page when focus is not inside a shadow tree", () => {
    const body = { tagName: "BODY", shadowRoot: null }

    expect(
      deepActiveElement({ activeElement: body } as unknown as Document)
    ).toBe(body as unknown as Element)
    expect(deepActiveElement({ activeElement: null })).toBeNull()
  })
})
