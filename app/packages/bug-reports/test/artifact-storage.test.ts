import { describe, expect, it } from "bun:test"
import {
  buildCaptureArtifactKey,
  buildDebuggerArtifactKey,
  buildThumbnailArtifactKey,
} from "../src/lib/artifact-storage"

describe("artifact storage key builders", () => {
  it("builds capture keys under the bug report capture folder", () => {
    expect(
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "video",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/video.webm")

    expect(
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "screenshot",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/screenshot.png")
  })

  it("names screenshot keys after their image type", () => {
    const key = (contentType?: string) =>
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "screenshot",
        contentType,
      })
    const base = "organizations/org_123/bug-reports/br_123/capture"

    expect(key("image/jpeg")).toBe(`${base}/screenshot.jpg`)
    expect(key("image/webp")).toBe(`${base}/screenshot.webp`)
    expect(key("image/png")).toBe(`${base}/screenshot.png`)
    expect(key("text/html")).toBe(`${base}/screenshot.png`)
    expect(
      buildCaptureArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
        captureType: "video",
        contentType: "image/jpeg",
      })
    ).toBe(`${base}/video.webm`)
  })

  it("builds thumbnail keys under the capture folder", () => {
    expect(
      buildThumbnailArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/capture/thumbnail.png")
  })

  it("builds debugger artifact keys under the debugger folder", () => {
    expect(
      buildDebuggerArtifactKey({
        organizationId: "org_123",
        bugReportId: "br_123",
      })
    ).toBe("organizations/org_123/bug-reports/br_123/debugger/payload.json.gz")
  })
})
