import { useEffect, useRef, useState } from "react"
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
} from "../utils/annotation-history"
import type { ScreenshotAnnotation } from "../utils/screenshot-annotations"

type Annotations = ScreenshotAnnotation[]

// Heard: undo and redo for the markup, from the toolbar and from the keyboard.
//
// The list of annotations itself belongs to whoever renders the editor; this keeps the steps that
// led to it and hands back the list to show after each undo or redo.
export function useAnnotationHistory(input: {
  annotations: Annotations
  // False while there is nothing to mark up or the report is being sent.
  enabled: boolean
  // True while a shape is being drawn: undo and redo wait until it is finished.
  isDrawing: () => boolean
  onChange: (annotations: Annotations) => void
}): {
  canRedo: boolean
  canUndo: boolean
  // Records a change made by drawing or clearing.
  commit: (annotations: Annotations) => void
  redo: () => void
  undo: () => void
} {
  const [history, setHistory] = useState(() =>
    createAnnotationHistory(input.annotations)
  )
  let current = history
  if (history.present !== input.annotations) {
    // The list was replaced from outside (a new screenshot): its steps go with it.
    current = createAnnotationHistory(input.annotations)
    setHistory(current)
  }

  // What the keyboard handler works with: it outlives a render.
  const latest = useRef({ history: current, input })
  latest.current = { history: current, input }

  const apply = (next: AnnotationHistory<Annotations>) => {
    const now = latest.current
    if (next === now.history) return
    latest.current = { ...now, history: next }
    setHistory(next)
    now.input.onChange(next.present)
  }
  const step = (
    move: (
      from: AnnotationHistory<Annotations>
    ) => AnnotationHistory<Annotations>
  ) => {
    const now = latest.current
    if (!now.input.enabled || now.input.isDrawing()) return
    apply(move(now.history))
  }
  const undo = () => step(undoAnnotation)
  const redo = () => step(redoAnnotation)
  const actions = useRef({ redo, undo })
  actions.current = { redo, undo }

  const { enabled } = input
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = matchAnnotationShortcut(event)
      if (!shortcut || event.defaultPrevented) return
      // Typing has its own undo: leave the shortcut to the field that has focus. The widget is
      // inside a shadow tree, so the event's target seen from here is only the widget's host.
      const target = event.composedPath()[0] as Element | undefined
      if (
        isTextEntryElement(target) ||
        isTextEntryElement(deepActiveElement(document))
      ) {
        return
      }

      // Ours even when there is nothing left to undo: otherwise the browser would undo the last
      // thing typed into the form instead.
      event.preventDefault()
      actions.current[shortcut]()
    }

    // On the window, before the page's own handlers: focus is usually on the page body after
    // drawing (a canvas doesn't take focus), outside the widget's shadow tree.
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [enabled])

  return {
    canRedo: canRedoAnnotation(current),
    canUndo: canUndoAnnotation(current),
    commit: (annotations) => {
      apply(pushAnnotationHistory(latest.current.history, annotations))
    },
    redo,
    undo,
  }
}
