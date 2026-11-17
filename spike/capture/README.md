# Capture spike

Tests whether rendering a DOM snapshot on the server beats in-browser DOM-to-image (the marker.io-style widget approach) for client feedback screenshots.

## Approaches compared
- **A · Snapshot → server render.** The widget serializes the live DOM (rrweb-snapshot). The server rebuilds it in a sandboxed iframe in headless Chromium/WebKit and screenshots it.
- **B · Server reloads URL.** The server opens the URL fresh at the same viewport and scroll. It loses page state.
- **C · DOM-to-image.** html-to-image runs in the reviewer's browser.

## Run
```bash
npm install && npx playwright install chromium webkit firefox
npm run build

# Automated scoring against a real screenshot (ground truth)
node harness.mjs <url> [url...] --browsers chromium,webkit,firefox --widths 1440,390 --scrolls 0,1200
node harness.mjs <url> --widths 390 --click ".w-nav-button"     # page-state test
node harness.mjs <url> --server-engine chromium                 # always render on Chromium

# Gallery + live widget endpoint
npm start   # http://localhost:4400
# On a staging page: <script src="http://localhost:4400/widget.js" data-heard-auto></script>
# (Safari/real devices need an https tunnel, e.g. cloudflared, since staging pages are https)
```

## Results (match % vs a real screenshot in the reviewer's browser)
| Site / test | A snapshot | B reload | C DOM-to-image |
|---|---|---|---|
| yeschef.studio, 24 views (Chrome/Safari/Firefox × desktop/mobile) | 97–100% | 85–100% | 60–96% |
| daddyyankee.com, 12 views | 100% | 98.6–100% | 18–99% |
| floatfinancial.com, 12 views | 98.5–100% | 96–100% | failed on every view |
| Mobile menu open (state) | 100% | 91% (menu closed) | 95% (menu items missing) |
| Carousel advanced (state) | 100% | 77% (wrong slide) | 87% |
| WebGL 3D fixture | 100% | 99.5–100% | 57–89% |
| Playing video fixture | 99.1–99.8% | 94–100% | 9–73% |

**Final regression after the network-layer fixes** (48 views: 4 sites × Chrome/Safari/Firefox × desktop/mobile × top/scrolled): snapshot averages **99.8%**, lowest 98.0%. Reload averages 98.9% and DOM-to-image 74.0%. The local 3D Next.js site averages 99.9% (it was 91.6% before the font fix).

Server render takes 0.4–3.8 s on any engine. Snapshot payload is 300–400 KB, plus the canvas/video frames.

## How it works (non-obvious parts)
- **Engine matching:** Safari reviewers are rendered on WebKit and Firefox reviewers on Firefox, with a 15 s hard limit and a Chromium fallback (`renderSnapshotWithFallback`).
- **The rebuild iframe is sandboxed with scripts off.** That is safe, since client page code never runs on our server, but it has side effects that the renderer works around:
  - `<canvas>` shows fallback content instead of pixels, so each canvas is swapped for an `<img>` of the frame grabbed on the reviewer's side
  - `<noscript>` content becomes visible, so it is hidden
  - Chromium forces native video controls on, so they are hidden
  - load events don't fire, so asset readiness is polled, and font faces are checked one by one (Firefox leaves `fonts.status` stuck)
- **Network layer** (`app/apps/renderer/src/network-guard.mjs`, shared with the harness): every subresource is fetched server-side. That lets us block private addresses at every redirect hop, add CORS headers so self-hosted fonts load in the opaque-origin sandbox, and request only gzip/br, because Playwright can't decode zstd, which Firefox requests.
- **Canvases stay `<canvas>`**, with the grabbed frame painted as their CSS background. Swapping them for `<img>` broke sites that position canvases with tag selectors.
- **WebGL and video frames** are grabbed inside `requestAnimationFrame`, right after the site's own render, while the drawing buffer is still intact. A cross-origin video without CORS can't be read, and it falls back to its poster.

## Open issues
- Not yet tested: cross-origin iframes (YouTube/Vimeo/Calendly embeds), password-protected Webflow staging, Lottie (SVG renderer should be fine; canvas renderer is covered by the canvas grab).
- Spike only: no auth, permissive CORS, URL reload not protected against SSRF.
