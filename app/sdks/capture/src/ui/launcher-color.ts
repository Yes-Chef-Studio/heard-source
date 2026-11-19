// Paints the "Report issue" tab in the project's colour. The variables are set on the widget's
// host element and inherit into its shadow root; the CSS falls back to Heard's default without them.
export function applyLauncherColor(
  hostElement: HTMLElement,
  color: string | null
): void {
  if (!color) {
    hostElement.style.removeProperty("--heard-launcher-bg")
    hostElement.style.removeProperty("--heard-launcher-fg")
    return
  }
  hostElement.style.setProperty("--heard-launcher-bg", color)
  hostElement.style.setProperty("--heard-launcher-fg", readableTextOn(color))
}

// Black or white, whichever reads better on the colour (WCAG relative luminance).
export function readableTextOn(hex: string): string {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  // White unless it would be hard to read (under 3:1, fine for this short bold label); brand
  // colours like orange keep white text, pale colours (yellow, light grey) get near-black.
  const onWhite = 1.05 / (luminance + 0.05)
  return onWhite >= 3 ? "#ffffff" : "#111111"
}

// Pencil icon (Lucide "pencil-line", ISC licence), drawn upright inside the vertical tab.
export const LAUNCHER_ICON_SVG =
  '<svg aria-hidden="true" class="capture-launcher-icon" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/><path d="m15 5 3 3"/></svg>'
