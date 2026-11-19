import { describe, expect, it } from "bun:test"

import { annotatedExportFormat } from "../src/ui/capture-widget/utils/screenshot-annotations"
import { createCaptureUiStore } from "../src/ui/store/capture-ui-store"

const media = (objectUrl: string) => ({
  blob: new Blob(["picture"], { type: "image/jpeg" }),
  captureType: "screenshot" as const,
  durationMs: null,
  objectUrl,
})
const summary = { actions: 1, logs: 2, networkRequests: 3 }

describe("capture UI store: screenshot that arrives after the review screen opens", () => {
  it("opens the review screen with a placeholder, not busy", () => {
    const store = createCaptureUiStore()
    store.showScreenshotPending({ aspectRatio: 0.5 })

    expect(store.getSnapshot()).toMatchObject({
      view: "review",
      overlayOpen: true,
      busy: false,
      media: null,
      screenshotStatus: "pending",
      screenshotAspectRatio: 0.5,
    })
  })

  it("drops the picture in without resetting the form", () => {
    const store = createCaptureUiStore()
    store.showScreenshotPending({ aspectRatio: 0.5 })
    const formKey = store.getSnapshot().reviewFormKey

    store.showScreenshotReady({
      media: media("blob:1"),
      warnings: ["w"],
      summary,
    })

    expect(store.getSnapshot()).toMatchObject({
      view: "review",
      screenshotStatus: "idle",
      reviewFormKey: formKey,
      summary,
      warnings: ["w"],
    })
    expect(store.getSnapshot().media?.objectUrl).toBe("blob:1")
  })

  it("keeps the form through a failure and a second attempt", () => {
    const store = createCaptureUiStore()
    store.showScreenshotPending({ aspectRatio: 0.5 })
    const formKey = store.getSnapshot().reviewFormKey

    store.showScreenshotFallback()
    expect(store.getSnapshot().screenshotStatus).toBe("fallback")
    store.showScreenshotFailed()
    expect(store.getSnapshot().screenshotStatus).toBe("failed")

    store.showScreenshotPending({ aspectRatio: 0.6 })
    expect(store.getSnapshot()).toMatchObject({
      screenshotStatus: "pending",
      screenshotAspectRatio: 0.6,
      reviewFormKey: formKey,
    })
  })

  it("starts a fresh form for each new screenshot", () => {
    const store = createCaptureUiStore()
    store.showScreenshotPending({ aspectRatio: 0.5 })
    const firstKey = store.getSnapshot().reviewFormKey
    store.showScreenshotReady({ media: media("blob:1"), warnings: [], summary })

    store.openChooser()
    store.showScreenshotPending({ aspectRatio: 0.5 })

    expect(store.getSnapshot().reviewFormKey).not.toBe(firstKey)
    expect(store.getSnapshot().media).toBeNull()
  })

  it("shows a picture that arrives with no review screen waiting as a normal review", () => {
    const store = createCaptureUiStore()
    store.showScreenshotReady({ media: media("blob:9"), warnings: [], summary })

    expect(store.getSnapshot()).toMatchObject({
      view: "review",
      overlayOpen: true,
      screenshotStatus: "idle",
      reviewFormKey: "blob:9",
    })
  })
})

describe("annotatedExportFormat", () => {
  it("keeps JPEG screenshots as JPEG and everything else as PNG", () => {
    expect(annotatedExportFormat("image/jpeg")).toEqual({
      type: "image/jpeg",
      quality: 0.9,
    })
    expect(annotatedExportFormat("image/png")).toEqual({ type: "image/png" })
    expect(annotatedExportFormat("image/webp")).toEqual({ type: "image/png" })
    expect(annotatedExportFormat(undefined)).toEqual({ type: "image/png" })
  })
})
