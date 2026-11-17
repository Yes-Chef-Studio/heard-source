// Client-side capture script. Runs on the reviewed page (e.g. a .webflow.io staging URL).
// Collects two things per capture so the spike can compare approaches:
//   1. A DOM snapshot (rrweb-snapshot) that the server re-renders in headless Chromium.
//   2. A DOM-to-image screenshot (html-to-image), the in-browser approach most widgets use.
import { snapshot } from "rrweb-snapshot";
import { toCanvas } from "html-to-image";

const WIDGET_ATTR = "data-heard-widget";

function pageMeta() {
  return {
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    userAgent: navigator.userAgent,
    capturedAt: new Date().toISOString(),
  };
}

// WebGL canvases (3D sites) clear their drawing buffer after each frame is composited, so a plain
// toDataURL() returns a blank image. Reading inside requestAnimationFrame runs right after the
// site's own render callback in the same frame, while the pixels are still there.
function grabCanvases() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const images = new Map();
      for (const canvas of document.querySelectorAll("canvas")) {
        if (!canvas.width || !canvas.height) continue;
        try {
          images.set(canvas, canvas.toDataURL("image/webp", 0.85));
        } catch {
          // Tainted canvas (cross-origin content): skip it.
        }
      }
      // Videos: draw the current frame. Cross-origin video without CORS throws (tainted) and
      // falls back to the poster, which is the best we can do.
      for (const video of document.querySelectorAll("video")) {
        if (video.readyState < 2 || !video.videoWidth) continue;
        try {
          const scale = Math.min(1, 1280 / video.videoWidth);
          const c = document.createElement("canvas");
          c.width = Math.round(video.videoWidth * scale);
          c.height = Math.round(video.videoHeight * scale);
          c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
          images.set(video, c.toDataURL("image/webp", 0.8));
        } catch {
          // Tainted: keep the poster.
        }
      }
      resolve(images);
    });
  });
}

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

async function takeSnapshot() {
  const t0 = performance.now();
  const canvases = await grabCanvases();
  const snap = snapshot(document, {
    inlineStylesheet: true,
    inlineImages: false,
    recordCanvas: false,
    blockSelector: `[${WIDGET_ATTR}]`,
  });
  // Attach grabbed pixels to the serialized nodes (document order matches).
  const live = { canvas: [...document.querySelectorAll("canvas")], video: [...document.querySelectorAll("video")] };
  const seen = { canvas: 0, video: 0 };
  walk(snap, (n) => {
    if (n.type !== 2 || !(n.tagName in live)) return;
    const el = live[n.tagName][seen[n.tagName]++];
    const dataUrl = el && canvases.get(el);
    if (!dataUrl) return;
    if (n.tagName === "canvas") n.attributes.rr_dataURL = dataUrl;
    else n.attributes["data-heard-frame"] = dataUrl;
  });
  return {
    snapshot: snap,
    snapshotMs: Math.round(performance.now() - t0),
    canvasCount: canvases.size,
  };
}

async function takeDomToImage() {
  const t0 = performance.now();
  try {
    const canvas = await toCanvas(document.documentElement, {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: 1,
      filter: (node) => !(node instanceof Element && node.hasAttribute(WIDGET_ATTR)),
      style: {
        transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
        transformOrigin: "top left",
      },
    });
    return { png: canvas.toDataURL("image/png"), ms: Math.round(performance.now() - t0), error: null };
  } catch (error) {
    return { png: null, ms: Math.round(performance.now() - t0), error: String(error?.message || error) };
  }
}

async function capture({ domToImage = true } = {}) {
  const meta = pageMeta();
  const snap = await takeSnapshot();
  const dom = domToImage ? await takeDomToImage() : null;
  return { ...meta, ...snap, domToImage: dom };
}

function mount(host) {
  if (document.querySelector(`[${WIDGET_ATTR}]`)) return;
  const button = document.createElement("button");
  button.setAttribute(WIDGET_ATTR, "");
  button.textContent = "Capture";
  Object.assign(button.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
    padding: "10px 16px", borderRadius: "999px", border: "0", cursor: "pointer",
    font: "600 14px/1 system-ui, sans-serif", color: "#fff", background: "#111",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Capturing…";
    try {
      const payload = await capture();
      const res = await fetch(`${host}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { id } = await res.json();
      button.textContent = "Captured";
      console.info(`[heard] capture ${id}: ${host}/#${id}`);
    } catch (error) {
      console.error("[heard] capture failed", error);
      button.textContent = "Failed";
    } finally {
      setTimeout(() => { button.disabled = false; button.textContent = "Capture"; }, 2000);
    }
  });

  document.body.appendChild(button);
}

window.HeardCapture = { capture, mount };

// <script src="https://<host>/widget.js" data-heard-auto></script> mounts the button.
const current = document.currentScript;
if (current?.hasAttribute("data-heard-auto")) {
  const host = current.getAttribute("data-host") || new URL(current.src).origin;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(host));
  } else {
    mount(host);
  }
}
