const fs = require("fs")
const path = require("path")
const { findBlock, properties } = require("./theme-css")

const chunkDir = path.join("out", "_next", "static", "chunks")
const cssFile = fs
  .readdirSync(chunkDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => path.join(chunkDir, f))
  .find((f) => fs.readFileSync(f, "utf8").includes("--sidebar-ring"))

if (!cssFile) throw new Error("no built CSS with theme tokens found; run next build")

const css = fs.readFileSync(cssFile, "utf8").replace(/\n/g, "")

/** Pull the *first* (baseline hex) declaration block for a selector. */
function block(selector) {
  // `requires` matters here: Tailwind emits its own `:root,:host{--font-sans…}`
  // ahead of the theme block, so a plain first-match on `:root` reads back a
  // rule with none of these tokens in it.
  const body = findBlock(css, selector, { requires: "--background" })
  return body === null ? null : properties(body)
}

function srgb(hex) {
  const h = hex.replace("#", "")
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
}

function luminance(hex) {
  const [r, g, b] = srgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  if (!/^#[0-9a-f]{3,8}$/i.test(a) || !/^#[0-9a-f]{3,8}$/i.test(b)) return null
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const modes = [
  { name: "cream", light: block(":root"), dark: block(".dark") },
  ...["graphite", "sage", "ocean", "lavender", "clay"].map((p) => ({
    name: p,
    light: block(`[data-palette=${p}]`),
    dark: block(`.dark[data-palette=${p}]`),
  })),
]

const PAIRS = [
  ["body text", "--foreground", "--background", 4.5],
  ["muted text", "--muted-foreground", "--background", 4.5],
  ["card text", "--card-foreground", "--card", 4.5],
  ["on primary", "--primary-foreground", "--primary", 4.5],
  ["accent text", "--accent-foreground", "--accent", 4.5],
]

/* Separation, not legibility. A raised surface that is only a hair off the
   shell makes the sidebar and cards vanish into the background — the exact
   complaint that prompted the current values. 1.06 is roughly three lightness
   steps at these levels: visible as an edge, not as a colour change. */
const SEPARATION = [
  ["card/bg", "--card", "--background", 1.06],
  ["muted/bg", "--muted", "--background", 1.03],
]

let fails = 0
for (const mode of modes) {
  for (const variant of ["light", "dark"]) {
    const vars = mode[variant]
    if (!vars) {
      console.log(`${mode.name}/${variant}: BLOCK NOT FOUND`)
      fails++
      continue
    }
    // Palettes inherit unlisted tokens; fall back the way the cascade would.
    const base = variant === "dark" ? modes[0].dark : modes[0].light
    const get = (k) => vars[k] ?? base[k]

    const check = ([label, fg, bg, min]) => {
      const r = ratio(get(fg), get(bg))
      // Unreadable is a failure, not a pass. This used to return `n/a` and let
      // the run report success — which is exactly how a whole mode came back
      // blank without the script noticing.
      if (r === null) {
        fails++
        return `${label}=n/a ✗`
      }
      const ok = r >= min
      if (!ok) fails++
      return `${label}=${r.toFixed(2)}${ok ? "" : " ✗"}`
    }

    console.log(
      `${mode.name.padEnd(9)} ${variant.padEnd(5)} bg=${get("--background")} ` +
        PAIRS.map(check).join("  ") +
        "  | " +
        SEPARATION.map(check).join("  ")
    )
  }
}

console.log(fails ? `\n${fails} pair(s) below target` : "\nAll pairs meet target")
process.exit(fails ? 1 : 0)
