// Serves the built widget from the dashboard at /widget.js, so sites embed it with a script tag.
import { copyFileSync, existsSync, mkdirSync } from "node:fs"

const source = new URL("../../../sdks/capture/dist/capture.global.js", import.meta.url)
const target = new URL("../public/widget.js", import.meta.url)

if (!existsSync(source)) {
  console.error("Widget bundle missing: build @crikket-io/capture first.")
  process.exit(1)
}
mkdirSync(new URL("../public/", import.meta.url), { recursive: true })
copyFileSync(source, target)
console.log("Copied widget to public/widget.js")
