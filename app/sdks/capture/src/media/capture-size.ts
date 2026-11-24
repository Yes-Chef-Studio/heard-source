// Heard: the size and format of a screenshot taken with the browser's own screen capture (the
// fallback when the server render is unavailable).
//
// The capture comes at the display's full pixel density. Saved as PNG, a 2880x1800 tab is about
// 4 MB, some eighteen times the upload of a server-rendered screenshot. As a high-quality JPEG
// at the same size it is about 0.6 MB with nothing lost that can be seen at that density.
export const SCREEN_CAPTURE_FORMAT = {
  type: "image/jpeg",
  quality: 0.92,
} as const

// Retina laptop captures (up to 3456 px wide) are kept pixel for pixel; only 5K-class displays
// are scaled down, and those still end up at twice the density of a server-rendered screenshot.
export const SCREEN_CAPTURE_MAX_LONG_EDGE = 3840

// The largest size with the same shape whose longer side is at most `maxLongEdge`.
export function fitWithinLongEdge(
  width: number,
  height: number,
  maxLongEdge: number = SCREEN_CAPTURE_MAX_LONG_EDGE
): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (!(longEdge > maxLongEdge)) {
    return { width, height }
  }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
