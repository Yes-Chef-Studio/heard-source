import { describe, expect, it } from "bun:test"

import {
  getCaptureSdk,
  sdkTestState,
  setupCaptureSdkTestHooks,
  waitFor,
} from "./lib/sdk-test-harness"

setupCaptureSdkTestHooks()

describe("capture SDK capture failure regression", () => {
  it("restores UI state and clears the debugger session when screenshot capture fails", async () => {
    const capture = getCaptureSdk()

    capture.init({
      key: "crk_capture_failure",
      host: "https://api.crikket.io",
    })

    // The server render fails, and so does the screen-capture fallback.
    sdkTestState.snapshotError = new Error("Snapshot render failed (502).")
    sdkTestState.screenshotError = new Error(
      "Screen capture permission denied."
    )

    await waitFor(() => sdkTestState.launcherMounts.length === 1)
    capture.open()
    await waitFor(() => sdkTestState.uiOpenChooserCalls === 1)

    await expect(capture.takeScreenshot()).rejects.toThrow(
      "Screen capture permission denied."
    )

    expect(sdkTestState.startSessionCalls).toEqual([
      {
        captureType: "screenshot",
        lookbackMs: 10_000,
      },
    ])
    // Hidden only for the screen-capture fallback, and shown again when that fails too.
    expect(sdkTestState.uiHidden).toEqual([true, false])
    expect(sdkTestState.uiScreenshotPending).toHaveLength(1)
    expect(sdkTestState.uiScreenshotFallbacks).toBe(1)
    expect(sdkTestState.uiScreenshotFailures).toBe(1)
    expect(sdkTestState.clearSessionCalls).toBeGreaterThanOrEqual(1)
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(0)
    expect(sdkTestState.objectUrlsCreated).toEqual([])
  })
})
