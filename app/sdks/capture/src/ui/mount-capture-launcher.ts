import { applyLauncherColor, LAUNCHER_ICON_SVG } from "./launcher-color"

interface MountedCaptureLauncher {
  setLoading: (loading: boolean) => void
  unmount: () => void
}

interface MountCaptureLauncherOptions {
  zIndex: number
  // The project's tab colour (#rrggbb), or null for the default.
  color: string | null
  onOpen: () => void
  onPrefetch: () => void
}

const CAPTURE_LAUNCHER_CSS_PLACEHOLDER = "__CRIKKET_CAPTURE_LAUNCHER_CSS__"

export function mountCaptureLauncher(
  target: HTMLElement,
  options: MountCaptureLauncherOptions
): MountedCaptureLauncher {
  const hostElement = document.createElement("div")
  // Heard: excluded from DOM snapshots (see media/capture-snapshot.ts).
  hostElement.setAttribute("data-heard-widget", "")
  applyLauncherColor(hostElement, options.color)
  const shadowRoot = hostElement.attachShadow({
    mode: "open",
  })
  const styleElement = document.createElement("style")
  styleElement.textContent = CAPTURE_LAUNCHER_CSS_PLACEHOLDER

  const button = document.createElement("button")
  button.className = "capture-launcher"
  button.style.setProperty("--capture-z-index", String(options.zIndex))
  button.type = "button"
  // A vertical tab on the right edge: label first, icon after (the tab is turned so the label
  // reads bottom to top, which puts the icon at the top).
  const label = document.createElement("span")
  label.className = "capture-launcher-label"
  label.textContent = "Report issue"
  button.append(label)
  button.insertAdjacentHTML("beforeend", LAUNCHER_ICON_SVG)
  button.setAttribute("aria-label", "Report an issue")

  button.addEventListener("click", options.onOpen)
  button.addEventListener("pointerenter", options.onPrefetch, {
    once: true,
    passive: true,
  })
  button.addEventListener("focus", options.onPrefetch, {
    once: true,
    passive: true,
  })

  shadowRoot.append(styleElement, button)
  target.append(hostElement)

  return {
    setLoading: (loading) => {
      button.disabled = loading
      label.textContent = loading ? "Loading…" : "Report issue"
    },
    unmount: () => {
      button.removeEventListener("click", options.onOpen)
      hostElement.remove()
    },
  }
}
