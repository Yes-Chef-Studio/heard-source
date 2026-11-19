import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const launcherCssPath = fileURLToPath(
  new URL("../src/ui/launcher.css", import.meta.url)
)
const widgetCssPath = fileURLToPath(
  new URL("../src/ui/widget.css", import.meta.url)
)

const sharedLauncherRules = [
  "right: 0;",
  "top: 50%;",
  "writing-mode: vertical-rl;",
  "transform: translateY(-50%) rotate(180deg);",
  "border-radius: 0 10px 10px 0;",
  "background: var(--heard-launcher-bg, var(--primary));",
  "color: var(--heard-launcher-fg, var(--primary-foreground));",
  "font-size: 14px;",
  "font-weight: 600;",
  "white-space: nowrap;",
  "padding-left: 14px;",
  "outline: 2px solid var(--ring);",
  "opacity: 0.6;",
] as const

const readCss = (path: string): string => readFileSync(path, "utf8")

describe("capture SDK styles", () => {
  it("defines shared widget theme tokens only inside the widget root", () => {
    const widgetCss = readCss(widgetCssPath)

    expect(widgetCss).toContain(":host {")
    expect(widgetCss).toContain("color-scheme: light dark;")
    expect(widgetCss).toContain("@media (prefers-color-scheme: dark)")
    expect(widgetCss).toContain(".heard-capture-root {")
    expect(widgetCss).toContain("--foreground:")
    expect(widgetCss).toContain('--font-sans: "Inter Variable", sans-serif;')
    expect(widgetCss).not.toContain(":root {")
    expect(widgetCss).not.toContain("--crikket-capture-")
  })

  it("ships app-style launcher theme tokens inside the launcher shadow root", () => {
    const launcherCss = readCss(launcherCssPath)

    expect(launcherCss).toContain(":host {")
    expect(launcherCss).toContain("color-scheme: light dark;")
    expect(launcherCss).toContain("@media (prefers-color-scheme: dark)")
    expect(launcherCss).toContain("--primary:")
    expect(launcherCss).toContain('--font-sans: "Inter Variable", sans-serif;')
    expect(launcherCss).toContain(
      "background: var(--heard-launcher-bg, var(--primary));"
    )
    expect(launcherCss).not.toContain(":root {")
  })

  it("keeps the lazy launcher and widget launcher visually aligned", () => {
    const launcherCss = readCss(launcherCssPath)
    const widgetCss = readCss(widgetCssPath)

    for (const rule of sharedLauncherRules) {
      expect(launcherCss).toContain(rule)
      expect(widgetCss).toContain(rule)
    }
  })
})

describe("launcher colour", () => {
  it("picks readable text for light and dark tab colours", async () => {
    const { readableTextOn } = await import("../src/ui/launcher-color")
    expect(readableTextOn("#111111")).toBe("#ffffff")
    expect(readableTextOn("#2563eb")).toBe("#ffffff")
    expect(readableTextOn("#ea580c")).toBe("#ffffff")
    expect(readableTextOn("#ffffff")).toBe("#111111")
    expect(readableTextOn("#facc15")).toBe("#111111")
  })
})
