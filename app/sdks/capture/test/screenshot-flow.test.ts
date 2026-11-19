import { describe, expect, it } from "bun:test"

import { SCREENSHOT_LOOKBACK_MS } from "../src/constants"
import {
  browserTarget,
  createSubmitTransport,
  getCaptureSdk,
  sdkTestState,
  setupCaptureSdkTestHooks,
  waitFor,
} from "./lib/sdk-test-harness"

setupCaptureSdkTestHooks()

describe("capture SDK screenshot flow", () => {
  it("completes the screenshot flow from init through successful submit", async () => {
    const capture = getCaptureSdk()

    capture.init({
      key: "  crk_screenshot_flow  ",
      host: "https://api.crikket.io",
      submitTransport: createSubmitTransport(),
    })

    expect(capture.isInitialized()).toBe(true)
    expect(capture.getConfig()).toEqual({
      host: "https://api.crikket.io",
      key: "crk_screenshot_flow",
      submitPath: "/api/embed/bug-reports",
      zIndex: 2_147_483_640,
    })
    await waitFor(() => sdkTestState.launcherMounts.length === 1)
    expect(sdkTestState.launcherMounts).toEqual([
      {
        target: browserTarget,
        zIndex: 2_147_483_640,
      },
    ])

    capture.open()
    await waitFor(() => sdkTestState.uiOpenChooserCalls === 1)
    // Opening the chooser starts the screenshot ahead of time...
    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: true, aborted: false },
    ])

    const screenshotBlob = await capture.takeScreenshot()
    expect(screenshotBlob).toBe(sdkTestState.screenshotBlob)
    // ...and "Take screenshot" uses that one instead of starting another.
    expect(sdkTestState.snapshotCaptures).toEqual([
      { afterPaint: true, aborted: false },
    ])
    expect(sdkTestState.uiScreenshotPending).toEqual([
      { aspectRatio: 720 / 1280 },
    ])
    expect(sdkTestState.uiScreenshotFallbacks).toBe(0)
    expect(sdkTestState.startSessionCalls).toEqual([
      {
        captureType: "screenshot",
        lookbackMs: SCREENSHOT_LOOKBACK_MS,
      },
    ])
    expect(sdkTestState.uiShowReviewInputs).toHaveLength(1)
    expect(sdkTestState.uiShowReviewInputs[0]).toMatchObject({
      media: {
        blob: sdkTestState.screenshotBlob,
        captureType: "screenshot",
        durationMs: null,
      },
      summary: sdkTestState.reviewSnapshot.debuggerSummary,
      warnings: sdkTestState.reviewSnapshot.warnings,
    })
    // A snapshot screenshot never hides the widget: it isn't part of the page copy.
    expect(sdkTestState.uiHidden).not.toContain(true)
    expect(sdkTestState.titlePrefills).toEqual([])

    const submitResult = await capture.submit({
      title: " Checkout submit is broken ",
      description: " Description from regression test ",
      priority: "high",
    })

    expect(submitResult).toEqual({
      reportId: "br_123",
      shareUrl: "https://app.crikket.io/s/br_123",
    })
    expect(sdkTestState.submitRequests).toHaveLength(1)
    expect(sdkTestState.submitRequests[0]).toMatchObject({
      config: {
        host: "https://api.crikket.io",
        key: "crk_screenshot_flow",
        submitPath: "/api/embed/bug-reports",
        zIndex: 2_147_483_640,
      },
      report: {
        captureType: "screenshot",
        title: "Checkout submit is broken",
        description: "Description from regression test",
        priority: "high",
        visibility: "private",
        pageTitle: "Buggy Checkout",
        pageUrl: "https://example.com/checkout",
        durationMs: null,
        debuggerSummary: sdkTestState.reviewSnapshot.debuggerSummary,
        media: sdkTestState.screenshotBlob,
      },
    })
    expect(sdkTestState.uiShowSuccessUrls).toEqual([
      "https://app.crikket.io/s/br_123",
    ])

    capture.close()
    expect(sdkTestState.uiCloseCalls).toBe(1)

    capture.destroy()
    expect(sdkTestState.objectUrlsRevoked).toEqual(["blob:mock-1"])
    expect(sdkTestState.uiUnmounts).toBe(1)
    expect(capture.isInitialized()).toBe(false)
  })
})
