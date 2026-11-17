// Runs inside headless Chromium on the server. Rebuilds a client's DOM snapshot into a
// sandboxed iframe (scripts never execute) sized to the client's viewport, then restores scroll.
import { createCache, createMirror, rebuildIntoSandboxedIframe } from "rrweb-snapshot";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Poll rather than listen: WebKit doesn't reliably fire load events for resources inside the
// sandboxed rebuild iframe, which made every Safari render sit out the full timeout.
function pendingAssets(doc) {
  const waiting = [];
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    if (!link.sheet) waiting.push(`css ${link.href}`);
  }
  for (const img of doc.images) {
    if (!img.complete) waiting.push(`img ${img.currentSrc || img.src}`);
  }
  // Check individual faces: Firefox can leave FontFaceSet.status at "loading" indefinitely inside
  // the sandboxed iframe even after every face has finished.
  if (doc.fonts && [...doc.fonts].some((face) => face.status === "loading")) waiting.push("fonts");
  return waiting;
}

// Web fonts only start loading once layout needs a glyph from them, so an early check can see
// "nothing pending" before the font requests exist. Force layout, let a frame pass, and require
// two clean checks in a row before calling the page settled.
async function waitForAssets(doc, timeoutMs) {
  for (const img of doc.images) img.loading = "eager";
  void doc.documentElement.offsetHeight;
  await nextFrames();
  const deadline = Date.now() + timeoutMs;
  let clean = 0;
  let waiting = [];
  while (Date.now() < deadline) {
    waiting = pendingAssets(doc);
    clean = waiting.length ? 0 : clean + 1;
    if (clean >= 2) break;
    await sleep(100);
  }
  return waiting;
}

// Scripts are disabled in the sandbox, and per the HTML spec a <canvas> in a scriptless document
// renders its fallback content, never its bitmap. Paint the frame grabbed on the reviewer's side as
// the canvas's CSS background instead. Keeping the <canvas> element (rather than swapping in an
// <img>) matters: sites position canvases with tag selectors like `body > canvas {position:fixed}`.
//
// Without scripting the canvas is no longer a replaced element, so it loses its intrinsic size and
// collapses to 0x0 unless CSS sizes it. Restore the size from the width/height attributes, and the
// aspect ratio when CSS sets only the width.
function paintCanvases(snap, mirror) {
  const painted = [];
  (function walk(n) {
    if (n.type === 2 && n.tagName === "canvas" && n.attributes?.rr_dataURL) {
      const canvas = mirror.getNode(n.id);
      if (canvas) {
        canvas.textContent = "";
        canvas.style.backgroundImage = `url("${n.attributes.rr_dataURL}")`;
        canvas.style.backgroundSize = "100% 100%";
        canvas.style.backgroundRepeat = "no-repeat";
        painted.push(canvas);
      }
    }
    for (const child of n.childNodes || []) walk(child);
  })(snap);

  for (const canvas of painted) {
    const win = canvas.ownerDocument.defaultView;
    const w = Number(canvas.getAttribute("width")) || 300;
    const h = Number(canvas.getAttribute("height")) || 150;
    if (win.getComputedStyle(canvas).display === "inline") canvas.style.display = "inline-block";
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) canvas.style.width = `${w}px`;
    if (!rect.height) canvas.style.aspectRatio = `${w} / ${h}`;
    if (!canvas.getBoundingClientRect().height) canvas.style.height = `${h}px`;
  }
  return painted.length;
}

// Show each video's grabbed frame as its poster, and stop it loading so the poster stays up.
// Keeping the <video> element preserves its sizing and object-fit.
function freezeVideos(doc) {
  let count = 0;
  for (const video of doc.querySelectorAll("video[data-heard-frame]")) {
    video.poster = video.getAttribute("data-heard-frame");
    video.removeAttribute("data-heard-frame");
    video.removeAttribute("autoplay");
    video.removeAttribute("src");
    for (const source of video.querySelectorAll("source")) source.remove();
    video.preload = "none";
    count++;
  }
  return count;
}

window.HeardRender = {
  async rebuild(snap, viewport, scroll) {
    const root = document.getElementById("root");
    const mirror = createMirror();
    const { iframe } = rebuildIntoSandboxedIframe(snap, {
      root,
      mirror,
      cache: createCache(),
      hackCss: true,
      iframeAttributes: {
        width: String(viewport.width),
        height: String(viewport.height),
        style: `position:fixed;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;border:0;`,
      },
    });
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    // Scripts are disabled in the sandbox, so <noscript> content (and rrweb's script placeholders)
    // would render. The reviewer had JS on, so hide it.
    const hide = doc.createElement("style");
    // Chromium also forces native video controls on when scripting is disabled.
    hide.textContent =
      "noscript{display:none!important}" +
      "video::-webkit-media-controls,video::-webkit-media-controls-enclosure{display:none!important}";
    (doc.head || doc.documentElement).appendChild(hide);
    const canvases = paintCanvases(snap, mirror);
    const videos = freezeVideos(doc);

    // Scroll first so lazy content near the viewport is requested, then wait, then re-apply
    // scroll in case late-loading fonts/images shifted layout.
    win.scrollTo(scroll.x, scroll.y);
    const stalled = await waitForAssets(doc, 10000);
    win.scrollTo(scroll.x, scroll.y);
    await nextFrames();
    return { scrolledTo: { x: win.scrollX, y: win.scrollY }, stalled, canvases, videos };
  },
};
