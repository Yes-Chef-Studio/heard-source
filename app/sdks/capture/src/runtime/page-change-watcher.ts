// Heard: tells whether the page still looks the way it did when it was copied for a screenshot.
//
// A screenshot is started the moment the "Report issue" tab is clicked, before the reviewer has
// picked "Take screenshot" (see speculative-capture.ts). That head start is only usable if the
// page hasn't moved on in the meantime: scrolled, been resized, typed into, or had its content
// change somewhere the screenshot would show it.
import type { CopiedPage } from "../media/lazy-capture-media"

const WIDGET_SELECTOR = "[data-heard-widget]"
// More distinct elements changing than this and the page has plainly moved on; stop tracking.
const MAX_SUSPECTS = 150

// Elements that never draw anything themselves.
const UNRENDERED_TAGS = new Set([
  "SCRIPT",
  "NOSCRIPT",
  "TEMPLATE",
  "META",
  "TITLE",
  "BASE",
  "HEAD",
])

// Inline-style properties that script-driven animation rewrites many times a second (tickers,
// parallax, fades). A page that is only animating hasn't changed in any way a second screenshot
// would capture better than the first.
const ANIMATION_PROPERTIES =
  /^(transform|transform-origin|transform-style|translate|rotate|scale|opacity|filter|backdrop-filter|will-change|transition(-[a-z-]+)?|animation(-[a-z-]+)?)$/

export interface PageChangeWatcher {
  hasChanged: () => boolean
  stop: () => void
}

function parseInlineStyle(text: string | null): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const declaration of (text ?? "").split(";")) {
    const colon = declaration.indexOf(":")
    if (colon === -1) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    if (property)
      declarations.set(property, declaration.slice(colon + 1).trim())
  }
  return declarations
}

export function isAnimationOnlyStyleChange(
  before: string | null,
  after: string | null
): boolean {
  const previous = parseInlineStyle(before)
  const current = parseInlineStyle(after)
  for (const property of new Set([...previous.keys(), ...current.keys()])) {
    if (previous.get(property) === current.get(property)) continue
    if (!ANIMATION_PROPERTIES.test(property)) return false
  }
  return true
}

function isStylesheet(node: Node): boolean {
  if (node.nodeName === "STYLE") return true
  return (
    node.nodeName === "LINK" &&
    (node as HTMLLinkElement).rel.toLowerCase().includes("stylesheet")
  )
}

function inWidget(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement
  return Boolean(element?.closest(WIDGET_SELECTOR))
}

// Could this node show up in a screenshot at all?
function canRender(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.nodeValue?.trim())
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  if (UNRENDERED_TAGS.has(node.nodeName)) return false
  if (node.nodeName === "LINK") return isStylesheet(node)
  return !inWidget(node)
}

function inViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  )
}

// "shown": counts only if it is on screen now (something added).
// "any": also counts if it has no box now, since it may just have been hidden or emptied.
type SuspectKind = "shown" | "any"

export function watchPageChanges(page: CopiedPage): PageChangeWatcher {
  let changed = false
  let stopped = false
  const suspects = new Map<Element, SuspectKind>()

  const suspect = (node: Node | null, kind: SuspectKind) => {
    const element = node instanceof Element ? node : node?.parentElement
    if (!element || changed) return
    if (suspects.get(element) !== "any") suspects.set(element, kind)
    if (suspects.size > MAX_SUSPECTS) markChanged()
  }

  const checkChildList = (record: MutationRecord) => {
    for (const node of record.addedNodes) {
      if (!canRender(node)) continue
      if (isStylesheet(node)) return markChanged()
      suspect(node, "shown")
    }
    for (const node of record.removedNodes) {
      if (!canRender(node)) continue
      if (isStylesheet(node)) return markChanged()
      suspect(record.target, "any")
    }
  }

  const checkAttribute = (record: MutationRecord) => {
    const target = record.target as Element
    const name = record.attributeName ?? ""
    const value = target.getAttribute(name)
    if (value === record.oldValue) return
    if (UNRENDERED_TAGS.has(target.nodeName)) return
    if (name === "style" && isAnimationOnlyStyleChange(record.oldValue, value))
      return
    if (isStylesheet(target)) return markChanged()
    suspect(target, "any")
  }

  const checkText = (record: MutationRecord) => {
    const parent = record.target.parentElement
    if (!parent || record.target.nodeValue === record.oldValue) return
    if (parent.nodeName === "STYLE") return markChanged()
    if (UNRENDERED_TAGS.has(parent.nodeName)) return
    suspect(parent, "any")
  }

  const review = (records: MutationRecord[]) => {
    for (const record of records) {
      if (changed) return
      if (inWidget(record.target)) continue
      if (record.type === "childList") checkChildList(record)
      else if (record.type === "attributes") checkAttribute(record)
      else checkText(record)
    }
  }
  const observer = new MutationObserver(review)

  const onScroll = (event: Event) => {
    if (event.target === document || event.target === window) {
      const moved =
        Math.abs(window.scrollX - page.scrollX) > 1 ||
        Math.abs(window.scrollY - page.scrollY) > 1
      if (moved) markChanged()
      return
    }
    // Something inside the page scrolled (a panel, a carousel).
    if (!inWidget(event.target as Node)) markChanged()
  }
  const onResize = () => {
    if (
      window.innerWidth !== page.viewportWidth ||
      window.innerHeight !== page.viewportHeight
    )
      markChanged()
  }
  // Typing or picking a value in the page's own fields doesn't touch the DOM tree.
  const onInput = (event: Event) => {
    if (!inWidget(event.target as Node)) markChanged()
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    observer.disconnect()
    suspects.clear()
    document.removeEventListener("scroll", onScroll, true)
    window.removeEventListener("resize", onResize)
    document.removeEventListener("input", onInput, true)
    document.removeEventListener("change", onInput, true)
  }

  function markChanged(): void {
    changed = true
    stop()
  }

  observer.observe(document, {
    attributeOldValue: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  })
  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  })
  window.addEventListener("resize", onResize, { passive: true })
  document.addEventListener("input", onInput, { capture: true, passive: true })
  document.addEventListener("change", onInput, { capture: true, passive: true })

  // Where the changed elements are is only worked out when someone asks, in one go, so a page
  // that is busy animating isn't made to recompute its layout on every change.
  const suspectsOnScreen = (): boolean => {
    for (const [element, kind] of suspects) {
      if (!element.isConnected) {
        if (kind === "any") return true
        continue
      }
      const rect = element.getBoundingClientRect()
      const hasBox = rect.width > 0 || rect.height > 0
      if (hasBox ? inViewport(rect) : kind === "any") return true
    }
    return false
  }

  return {
    hasChanged: () => {
      if (changed) return true
      review(observer.takeRecords())
      if (changed) return true
      if (location.href !== page.href || suspectsOnScreen()) markChanged()
      else suspects.clear()
      return changed
    },
    stop,
  }
}
