import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { CaptureUiState } from "../../types"
import {
  clampAnnotationPoint,
  drawScreenshotAnnotations,
  loadDecodedImage,
  type ScreenshotAnnotation,
  type ScreenshotAnnotationColor,
  screenshotAnnotationColorOptions,
} from "../utils/screenshot-annotations"
import {
  ArrowIcon,
  DrawIcon,
  HighlightIcon,
  RectangleIcon,
  ResetIcon,
  UndoIcon,
} from "./icons"
import { Button } from "./primitives/button"
import { cn } from "./primitives/cn"

type AnnotationTool = "arrow" | "draw" | "highlight" | "rectangle"

const DEFAULT_TOOL: AnnotationTool = "draw"
const DEFAULT_COLOR = screenshotAnnotationColorOptions[0].value

export function ScreenshotAnnotationEditor(props: {
  annotations: ScreenshotAnnotation[]
  disabled: boolean
  onChange: (annotations: ScreenshotAnnotation[]) => void
  // Tries the screenshot again after it failed.
  onRetry: () => void
  // Height / width of the screenshot that is on its way.
  placeholderAspectRatio: number | null
  // Null until the screenshot exists: a placeholder is shown in its place.
  src: string | null
  status: CaptureUiState["screenshotStatus"]
}): React.JSX.Element {
  const annotationsRef = useRef(props.annotations)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rectangleOriginRef = useRef<{ x: number; y: number } | null>(null)
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<AnnotationTool>(DEFAULT_TOOL)
  const [color, setColor] = useState<ScreenshotAnnotationColor>(DEFAULT_COLOR)
  const [draftAnnotation, setDraftAnnotation] =
    useState<ScreenshotAnnotation | null>(null)
  const draftAnnotationRef = useRef<ScreenshotAnnotation | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)

  useEffect(() => {
    annotationsRef.current = props.annotations
  }, [props.annotations])

  useEffect(() => {
    draftAnnotationRef.current = draftAnnotation
  }, [draftAnnotation])

  useEffect(() => {
    let active = true
    if (!props.src) {
      setLoadedImage(null)
      return
    }

    loadDecodedImage(props.src)
      .then((image) => {
        if (active) setLoadedImage(image)
      })
      .catch(() => {
        if (active) setLoadedImage(null)
      })

    return () => {
      active = false
    }
  }, [props.src])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setCanvasWidth(Math.floor(entry.contentRect.width))
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  const aspectRatio =
    loadedImage && loadedImage.naturalWidth > 0
      ? loadedImage.naturalHeight / loadedImage.naturalWidth
      : (props.placeholderAspectRatio ?? 9 / 16)
  const displayWidth = Math.max(canvasWidth, 1)
  const displayHeight = Math.max(Math.round(displayWidth * aspectRatio), 1)
  const renderedAnnotations = useMemo(() => {
    return draftAnnotation
      ? [...props.annotations, draftAnnotation]
      : props.annotations
  }, [draftAnnotation, props.annotations])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!(canvas && loadedImage)) {
      return
    }

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    const devicePixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.round(displayWidth * devicePixelRatio)
    canvas.height = Math.round(displayHeight * devicePixelRatio)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    drawScreenshotAnnotations({
      annotations: renderedAnnotations,
      context,
      height: displayHeight,
      image: loadedImage,
      width: displayWidth,
    })
  }, [displayHeight, displayWidth, loadedImage, renderedAnnotations])

  const commitDraftAnnotation = (annotation: ScreenshotAnnotation | null) => {
    if (!annotation) {
      return
    }

    props.onChange([...annotationsRef.current, annotation])
    setDraftAnnotation(null)
    draftAnnotationRef.current = null
    rectangleOriginRef.current = null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (props.disabled || !loadedImage || event.button !== 0) {
      return
    }

    const point = toCanvasPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === "arrow") {
      setDraftAnnotation({
        kind: "arrow",
        color,
        start: point,
        end: point,
      })
      return
    }

    if (tool === "rectangle") {
      rectangleOriginRef.current = point
      setDraftAnnotation({
        kind: "rectangle",
        color,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      })
      return
    }

    setDraftAnnotation({
      color,
      kind: "stroke",
      points: [point],
      tool,
    })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!(draftAnnotation && loadedImage)) {
      return
    }

    const point = toCanvasPoint(event)
    if (draftAnnotation.kind === "arrow") {
      setDraftAnnotation({ ...draftAnnotation, end: point })
      return
    }

    if (draftAnnotation.kind === "rectangle") {
      const origin = rectangleOriginRef.current ?? {
        x: draftAnnotation.x,
        y: draftAnnotation.y,
      }
      setDraftAnnotation({
        color: draftAnnotation.color,
        kind: "rectangle",
        x: Math.min(origin.x, point.x),
        y: Math.min(origin.y, point.y),
        width: Math.abs(point.x - origin.x),
        height: Math.abs(point.y - origin.y),
      })
      return
    }

    setDraftAnnotation({
      ...draftAnnotation,
      points: [...draftAnnotation.points, point],
    })
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const activeDraft = draftAnnotationRef.current
    if (!activeDraft) {
      return
    }

    const point = toCanvasPoint(event)
    let finalizedDraft: ScreenshotAnnotation = activeDraft
    if (activeDraft.kind === "stroke") {
      finalizedDraft = {
        ...activeDraft,
        points: [...activeDraft.points, point],
      }
    } else if (activeDraft.kind === "arrow") {
      finalizedDraft = { ...activeDraft, end: point }
    }

    // A click without a drag leaves no arrow.
    if (
      finalizedDraft.kind === "arrow" &&
      Math.hypot(
        finalizedDraft.end.x - finalizedDraft.start.x,
        finalizedDraft.end.y - finalizedDraft.start.y
      ) < 0.01
    ) {
      setDraftAnnotation(null)
      draftAnnotationRef.current = null
      return
    }

    if (
      finalizedDraft.kind === "rectangle" &&
      (finalizedDraft.width < 0.01 || finalizedDraft.height < 0.01)
    ) {
      setDraftAnnotation(null)
      draftAnnotationRef.current = null
      rectangleOriginRef.current = null
      return
    }

    commitDraftAnnotation(finalizedDraft)
  }

  const hasAnnotations = props.annotations.length > 0
  // Nothing to draw on until the screenshot is here.
  const toolsDisabled = props.disabled || !loadedImage

  return (
    <div className="grid min-h-full grid-rows-[auto_1fr]">
      <div className="grid gap-2 pb-4">
        <p className="m-0 text-muted-foreground text-sm">
          Draw on the screenshot to show us where the issue is.
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-1.5 shadow-sm">
          <div
            aria-label="Markup tools"
            className="flex flex-wrap items-center gap-1"
            role="toolbar"
          >
            <ToolButton
              active={tool === "draw"}
              disabled={toolsDisabled}
              icon={<DrawIcon className="h-4 w-4" />}
              label="Draw"
              onClick={() => {
                setTool("draw")
              }}
            />
            <ToolButton
              active={tool === "arrow"}
              disabled={toolsDisabled}
              icon={<ArrowIcon className="h-4 w-4" />}
              label="Arrow"
              onClick={() => {
                setTool("arrow")
              }}
            />
            <ToolButton
              active={tool === "highlight"}
              disabled={toolsDisabled}
              icon={<HighlightIcon className="h-4 w-4" />}
              label="Highlight"
              onClick={() => {
                setTool("highlight")
              }}
            />
            <ToolButton
              active={tool === "rectangle"}
              disabled={toolsDisabled}
              icon={<RectangleIcon className="h-4 w-4" />}
              label="Rectangle"
              onClick={() => {
                setTool("rectangle")
              }}
            />
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            {screenshotAnnotationColorOptions.map((option) => (
              <ColorButton
                active={color === option.value}
                color={option.value}
                disabled={toolsDisabled}
                key={option.value}
                label={option.label}
                onClick={() => {
                  setColor(option.value)
                }}
              />
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              aria-label="Undo"
              className="gap-2 border-0"
              disabled={toolsDisabled || !hasAnnotations}
              onClick={() => {
                props.onChange(props.annotations.slice(0, -1))
              }}
              size="icon"
              title="Undo"
              type="button"
              variant="outline"
            >
              <UndoIcon className="h-4 w-4" />
            </Button>
            <Button
              aria-label="Clear all markup"
              className="gap-2 border-0"
              disabled={toolsDisabled || !hasAnnotations}
              onClick={() => {
                props.onChange([])
                setDraftAnnotation(null)
              }}
              size="icon"
              title="Clear all"
              type="button"
              variant="outline"
            >
              <ResetIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-auto">
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-[960px]" ref={containerRef}>
            {loadedImage ? (
              <canvas
                aria-label="Screenshot annotation editor"
                className={cn(
                  "heard-fade-in block w-full rounded-xl bg-white shadow-sm",
                  props.disabled ? "cursor-default" : "cursor-crosshair"
                )}
                data-heard-screenshot="ready"
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                ref={canvasRef}
                style={{
                  touchAction: "none",
                }}
              />
            ) : (
              <ScreenshotPlaceholder
                aspectRatio={aspectRatio}
                onRetry={props.onRetry}
                status={props.status}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  function toCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): {
    x: number
    y: number
  } {
    const rect = event.currentTarget.getBoundingClientRect()
    return clampAnnotationPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }
}

// Stands where the screenshot will be, at the size it will be, while it is on its way.
function ScreenshotPlaceholder(props: {
  aspectRatio: number
  onRetry: () => void
  status: CaptureUiState["screenshotStatus"]
}): React.JSX.Element {
  const failed = props.status === "failed"

  return (
    <div
      aria-live="polite"
      className={cn(
        "grid w-full place-items-center rounded-xl border border-border/70 bg-muted/60 p-6 text-center",
        failed ? null : "heard-placeholder-pulse"
      )}
      data-heard-screenshot={failed ? "failed" : "pending"}
      style={{ aspectRatio: String(1 / props.aspectRatio) }}
    >
      {failed ? (
        <div className="grid max-w-sm justify-items-center gap-3">
          <div className="grid gap-1">
            <p className="m-0 font-semibold text-base">
              The screenshot couldn't be taken
            </p>
            <p className="m-0 text-muted-foreground text-sm">
              What you've written is still here. Try again, or use Retake to
              record a video instead.
            </p>
          </div>
          <Button onClick={props.onRetry} type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3">
          <svg
            aria-hidden="true"
            className="h-7 w-7 animate-spin text-foreground"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              opacity="0.2"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M22 12a10 10 0 0 0-10-10"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
          </svg>
          <div className="grid gap-1">
            <p className="m-0 font-semibold text-base">Taking screenshot…</p>
            <p className="m-0 text-muted-foreground text-sm">
              {props.status === "fallback"
                ? "We couldn't capture the page automatically. Choose this tab in your browser's prompt to share it instead."
                : "You can describe the issue while it loads."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton(props: {
  active: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      aria-pressed={props.active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        props.active
          ? "bg-foreground text-background shadow-sm"
          : "text-foreground hover:bg-muted"
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

function ColorButton(props: {
  active: boolean
  color: string
  disabled: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.active}
      className={cn(
        "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        props.active
          ? "scale-110 border-background ring-2 ring-foreground"
          : "border-transparent"
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        backgroundColor: props.color,
      }}
      type="button"
    />
  )
}
