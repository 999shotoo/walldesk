const fs = require("fs")
const { findBlock, propertyNames } = require("./theme-css")

const css = fs.readFileSync("app/globals.css", "utf8")

/** Custom-property names declared for an exact top-level selector. */
function varsFor(selector) {
  const body = findBlock(css, selector)
  return body === null ? null : new Set(propertyNames(body))
}

const palettes = ["graphite", "sage", "ocean", "lavender", "clay"]
let bad = 0

for (const p of palettes) {
  const light = varsFor(`[data-palette="${p}"]`)
  const dark = varsFor(`.dark[data-palette="${p}"]`)
  if (!light || !dark) {
    console.log(p, "BLOCK NOT FOUND", { light: !!light, dark: !!dark })
    bad++
    continue
  }
  const missing = [...light].filter((v) => !dark.has(v))
  const extra = [...dark].filter((v) => !light.has(v))
  console.log(
    p.padEnd(9),
    `light=${light.size}`,
    `dark=${dark.size}`,
    missing.length ? "MISSING IN DARK: " + missing.join(",") : "ok",
    extra.length ? "EXTRA IN DARK: " + extra.join(",") : ""
  )
  if (missing.length || extra.length) bad++
}

const root = varsFor(":root")
const dk = varsFor(".dark")
const isColour = (v) =>
  !/^--(radius|shadow|font|gradient|color-\d|error|success|info|warning)/.test(v)

const rootColours = [...root].filter(isColour)
const darkColours = [...dk].filter(isColour)
const missingBase = rootColours.filter((v) => !dk.has(v))
console.log(
  "base".padEnd(9),
  `light=${rootColours.length}`,
  `dark=${darkColours.length}`,
  missingBase.length ? "MISSING IN .dark: " + missingBase.join(",") : "ok"
)
if (missingBase.length) bad++

const sage = varsFor('[data-palette="sage"]')
console.log("\nInherited from :root by every palette (must be palette-neutral):")
console.log("  " + rootColours.filter((v) => !sage.has(v)).join(", "))

process.exit(bad ? 1 : 0)
