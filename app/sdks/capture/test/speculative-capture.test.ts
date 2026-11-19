import { afterEach, describe, expect, it } from "bun:test"

import type { CopiedPage } from "../src/media/capture-snapshot"
import { isAnimationOnlyStyleChange } from "../src/runtime/page-change-watcher"
import {
  SPECULATIVE_CAPTURE_MAX_AGE_MS,
  SpeculativeCapture,
  type SpeculativeCaptureDeps,
} from "../src/runtime/speculative-capture"

const config = {
  host: "https://api.example.test",
  key: "crk_test",
  submitPath: "/api/embed/bug-reports",
  zIndex: 1,
}
const page: CopiedPage = {
  href: "https://example.test/",
  scrollX: 0,
  scrollY: 0,
  viewportHeight: 720,
  viewportWidth: 1280,
}

const created: SpeculativeCapture[] = []

afterEach(() => {
  // Clears each capture's expiry timer.
  for (const speculation of created.splice(0)) speculation.discard()
})

function setup(options?: { copied?: boolean; fail?: boolean }) {
  const state = {
    aborted: 0,
    changed: false,
    now: 1000,
    watcherStops: 0,
    watching: 0,
  }
  let copied: (value: CopiedPage | null) => void = () => undefined
  let settle: { resolve: (blob: Blob) => void; reject: (e: Error) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  }
  const result = new Promise<Blob>((resolve, reject) => {
    settle = { resolve, reject }
  })
  result.catch(() => undefined)
  const deps: SpeculativeCaptureDeps = {
    now: () => state.now,
    start: () => ({
      result,
      pageCopied: new Promise((resolve) => {
        copied = resolve
      }),
      abort: () => {
        state.aborted += 1
      },
    }),
    watch: () => {
      state.watching += 1
      return {
        hasChanged: () => state.changed,
        stop: () => {
          state.watcherStops += 1
        },
      }
    },
  }
  const speculation = new SpeculativeCapture(config, undefined, deps)
  created.push(speculation)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    state,
    speculation,
    flush,
    copyPage: async () => {
      copied(page)
      await flush()
    },
    fail: async () => {
      settle.reject(new Error("Snapshot render failed (502)."))
      await flush()
    },
  }
}

describe("SpeculativeCapture", () => {
  it("is usable before the page has been copied", () => {
    const { speculation, state } = setup()
    expect(speculation.isUsable()).toBe(true)
    expect(state.watching).toBe(0)
  })

  it("stays usable while the page is unchanged, and stops once it changes", async () => {
    const { speculation, state, copyPage } = setup()
    await copyPage()
    expect(state.watching).toBe(1)
    expect(speculation.isUsable()).toBe(true)

    state.changed = true
    expect(speculation.isUsable()).toBe(false)
  })

  it("expires", async () => {
    const { speculation, state, copyPage } = setup()
    await copyPage()
    state.now += SPECULATIVE_CAPTURE_MAX_AGE_MS
    expect(speculation.isUsable()).toBe(true)
    state.now += 1
    expect(speculation.isUsable()).toBe(false)
  })

  it("is not usable once the render has failed", async () => {
    const { speculation, fail, copyPage } = setup()
    await copyPage()
    expect(speculation.hasFailed()).toBe(false)
    await fail()
    expect(speculation.isUsable()).toBe(false)
    expect(speculation.hasFailed()).toBe(true)
  })

  it("aborts the request and stops watching when discarded", async () => {
    const { speculation, state, copyPage } = setup()
    await copyPage()
    speculation.discard()
    speculation.discard()
    expect(state.aborted).toBe(1)
    expect(state.watcherStops).toBe(1)
    expect(speculation.isUsable()).toBe(false)
  })

  it("hands the request over untouched when taken", async () => {
    const { speculation, state, copyPage } = setup()
    await copyPage()
    const capture = speculation.take()
    expect(capture.result).toBeInstanceOf(Promise)
    expect(state.aborted).toBe(0)
    expect(state.watcherStops).toBe(1)

    // Discarding afterwards must not cancel what the caller now owns.
    speculation.discard()
    expect(state.aborted).toBe(0)
  })

  it("does not start watching a page copied after it was discarded", async () => {
    const { speculation, state, copyPage } = setup()
    speculation.discard()
    await copyPage()
    expect(state.watching).toBe(0)
  })
})

describe("isAnimationOnlyStyleChange", () => {
  it("ignores the properties script-driven animation rewrites", () => {
    expect(
      isAnimationOnlyStyleChange(
        "transform: translateX(10px); opacity: 0.4",
        "transform: translateX(12px); opacity: 0.5;"
      )
    ).toBe(true)
    expect(
      isAnimationOnlyStyleChange(
        null,
        "will-change: transform; transition-duration: 0.3s"
      )
    ).toBe(true)
    expect(isAnimationOnlyStyleChange("color: red", "color:red;")).toBe(true)
  })

  it("notices anything else", () => {
    expect(isAnimationOnlyStyleChange("display: none", "display: block")).toBe(
      false
    )
    expect(
      isAnimationOnlyStyleChange("opacity: 1", "opacity: 1; height: 0")
    ).toBe(false)
    expect(isAnimationOnlyStyleChange("width: 10px", null)).toBe(false)
    expect(
      isAnimationOnlyStyleChange("transform: none", "transform: none; top: 4px")
    ).toBe(false)
  })
})
