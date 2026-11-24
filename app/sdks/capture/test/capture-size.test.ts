import { describe, expect, it } from "bun:test"
import {
  fitWithinLongEdge,
  SCREEN_CAPTURE_FORMAT,
  SCREEN_CAPTURE_MAX_LONG_EDGE,
} from "../src/media/capture-size"

describe("screen-capture screenshot size", () => {
  it("keeps a retina laptop capture pixel for pixel", () => {
    expect(fitWithinLongEdge(2880, 1800)).toEqual({ width: 2880, height: 1800 })
    expect(fitWithinLongEdge(3456, 2234)).toEqual({ width: 3456, height: 2234 })
    expect(fitWithinLongEdge(SCREEN_CAPTURE_MAX_LONG_EDGE, 2160)).toEqual({
      width: SCREEN_CAPTURE_MAX_LONG_EDGE,
      height: 2160,
    })
  })

  it("scales a 5K capture down to the limit, keeping its shape", () => {
    expect(fitWithinLongEdge(5120, 2880)).toEqual({ width: 3840, height: 2160 })
  })

  it("limits the longer side of a tall capture", () => {
    expect(fitWithinLongEdge(2000, 8000)).toEqual({ width: 960, height: 3840 })
  })

  it("never returns an empty size", () => {
    expect(fitWithinLongEdge(10_000, 1, 100)).toEqual({ width: 100, height: 1 })
  })

  it("saves as a high-quality JPEG, which the server stores as it is", () => {
    expect(SCREEN_CAPTURE_FORMAT.type).toBe("image/jpeg")
    expect(SCREEN_CAPTURE_FORMAT.quality).toBeGreaterThanOrEqual(0.9)
  })
})
