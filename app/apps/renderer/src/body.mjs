// Reads a request body, optionally gzip-compressed by the widget (`x-heard-body-encoding: gzip`).
// The size limit applies twice: to the bytes on the wire, and to the decompressed result, so a
// small compressed body can't expand into something huge.
import { promisify } from "node:util"
import { constants, gunzip, gzip } from "node:zlib"

const gunzipAsync = promisify(gunzip)
const gzipAsync = promisify(gzip)

export const BODY_ENCODING_HEADER = "x-heard-body-encoding"

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

function isGzip(encoding) {
  return (
    String(encoding || "")
      .trim()
      .toLowerCase() === "gzip"
  )
}

/** Returns the decoded body as a Buffer. `encoding` is the BODY_ENCODING_HEADER value, if any. */
export async function decodeBody(buffer, encoding, maxBytes) {
  const name = String(encoding || "identity")
    .trim()
    .toLowerCase()
  if (name === "identity") return buffer
  if (name !== "gzip")
    throw httpError(415, `Unsupported body encoding: ${name.slice(0, 32)}`)
  try {
    return await gunzipAsync(buffer, { maxOutputLength: maxBytes })
  } catch (error) {
    if (error?.code === "ERR_BUFFER_TOO_LARGE")
      throw httpError(413, "Snapshot too large")
    throw httpError(400, "Body is not valid gzip")
  }
}

/**
 * Reads the whole body of an http.IncomingMessage (or any async iterable of Buffers).
 * Returns `{ text, gzipped }`: the decoded text, and the same content gzip-compressed (the bytes as
 * they arrived when the sender compressed them, otherwise compressed here at the fastest level).
 */
export async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw httpError(413, "Snapshot too large")
    chunks.push(chunk)
  }
  const raw = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
  const encoding = req.headers?.[BODY_ENCODING_HEADER]
  const decoded = await decodeBody(raw, encoding, maxBytes)
  const gzipped = isGzip(encoding)
    ? raw
    : await gzipAsync(decoded, { level: constants.Z_BEST_SPEED })
  return { text: decoded.toString("utf8"), gzipped }
}
