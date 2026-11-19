import { LAUNCHER_ICON_SVG } from "../../launcher-color"

// Same markup as the lazy launcher (mount-capture-launcher.ts): a vertical tab on the right edge.
export function CaptureLauncherButton(props: {
  disabled: boolean
  onClick: () => void
  onIntent: () => void
  onPress: () => void
  zIndex: number
}): React.JSX.Element {
  return (
    <button
      aria-label="Report an issue"
      className="capture-launcher"
      disabled={props.disabled}
      onClick={props.onClick}
      onFocus={props.onIntent}
      onPointerDown={(event) => {
        // Mouse only: a finger going down may be the start of a scroll.
        if (event.button === 0 && event.pointerType === "mouse") {
          props.onPress()
        }
      }}
      onPointerEnter={props.onIntent}
      style={{ ["--capture-z-index" as string]: String(props.zIndex) }}
      type="button"
    >
      <span className="capture-launcher-label">Report issue</span>
      <span
        className="capture-launcher-icon-wrap"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static icon markup from this package
        dangerouslySetInnerHTML={{ __html: LAUNCHER_ICON_SVG }}
      />
    </button>
  )
}
