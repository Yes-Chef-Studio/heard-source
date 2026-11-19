import { describe, expect, it } from "bun:test"

import {
  createSubmitTransport,
  getCaptureSdk,
  releaseSnapshot,
  sdkTestState,
  setupCaptureSdkTestHooks,
  waitFor,
} from "./lib/sdk-test-harness"

setupCaptureSdkTestHooks()

async function openChooser() {
  const capture = getCaptureSdk()
  capture.init({
    key: "crk_speculative_flow",
    host: "https://api.crikket.io",
    submitTransport: createSubmitTransport(),
  })
  await waitFor(() => sdkTestState.launcherMounts.length === 1)
  capture.open()
  await waitFor(() => sdkTestState.uiOpenChooserCalls === 1)
  return capture
}

describe("capture SDK speculative screenshot", () => {
  it("starts the screenshot when the lazy launcher is pressed and reuses it after the click", async () => {
    const capture = getCaptureSdk()
    capture.init({
      key: "crk_speculative_flow",
      host: "https://api.crikket.io",
    })
    await waitFor(() => sdkTestState.launcherMounts.length === 1)

    Object.assign(globalThis.window, {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })
    sdkTestState.launcherOptions?.onPress?.()
    // Pressed: copied straight away, no waiting for a paint.
    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: false, aborted: false },
    ])

    sdkTestState.launcherOptions?.onOpen()
    await waitFor(() => sdkTestState.uiOpenChooserCalls === 1)
    await capture.takeScreenshot()

    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: false, aborted: false },
    ])
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(1)
  })

  it("cancels the screenshot started ahead of time when the reviewer records a video instead", async () => {
    sdkTestState.holdSnapshot = true
    const capture = await openChooser()
    expect(sdkTestState.snapshotCaptures).toHaveLength(1)

    await capture.startRecording()

    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: true, aborted: true },
    ])
    expect(sdkTestState.uiScreenshotPending).toHaveLength(0)
  })

  it("cancels the screenshot started ahead of time when the widget is closed", async () => {
    sdkTestState.holdSnapshot = true
    const capture = await openChooser()

    capture.close()

    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: true, aborted: true },
    ])
  })

  it("opens the review screen before the picture exists and fills it in later", async () => {
    sdkTestState.holdSnapshot = true
    const capture = await openChooser()

    const pending = capture.takeScreenshot()
    await waitFor(() => sdkTestState.uiScreenshotPending.length === 1)
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(0)

    releaseSnapshot()
    expect(await pending).toBe(sdkTestState.screenshotBlob)
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(1)
  })

  it("holds a submit made before the picture is ready until it arrives", async () => {
    sdkTestState.holdSnapshot = true
    const capture = await openChooser()

    capture.takeScreenshot()
    await waitFor(() => sdkTestState.uiScreenshotPending.length === 1)
    const submitted = capture.submit({
      title: "Sent early",
      description: "",
      priority: "normal",
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(sdkTestState.submitRequests).toHaveLength(0)

    releaseSnapshot()
    await submitted
    expect(sdkTestState.submitRequests).toHaveLength(1)
    expect(sdkTestState.submitRequests[0]?.report.media).toBe(
      sdkTestState.screenshotBlob
    )
  })

  it("rejects a held submit, without sending anything, if no picture can be made", async () => {
    sdkTestState.holdSnapshot = true
    sdkTestState.snapshotError = new Error("Snapshot render failed (502).")
    sdkTestState.screenshotError = new Error("Permission denied.")
    const capture = await openChooser()

    const pending = capture.takeScreenshot()
    pending.catch(() => undefined)
    await waitFor(() => sdkTestState.uiScreenshotPending.length === 1)
    const submitted = capture.submit({
      title: "Sent early",
      description: "",
      priority: "normal",
    })
    releaseSnapshot()

    await expect(submitted).rejects.toThrow("screenshot couldn't be taken")
    expect(sdkTestState.submitRequests).toHaveLength(0)
    expect(sdkTestState.uiScreenshotFailures).toBe(1)
  })

  it("drops a pending screenshot when the reviewer starts over, and ignores its late result", async () => {
    sdkTestState.holdSnapshot = true
    const capture = await openChooser()

    const pending = capture.takeScreenshot()
    await waitFor(() => sdkTestState.uiScreenshotPending.length === 1)
    capture.reset()

    expect(await pending).toBeNull()
    expect(sdkTestState.snapshotCaptures[0]?.aborted).toBe(true)
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(0)
    expect(sdkTestState.uiScreenshotFallbacks).toBe(0)
    expect(sdkTestState.objectUrlsCreated).toEqual([])
  })
})
