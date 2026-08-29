/**
 * Renders every palette x mode combination into a standalone HTML sheet, using
 * the hex values from the built stylesheet rather than re-deriving them — so
 * what the sheet shows is what the app actually ships.
 *
 * Preview tooling only. Writes to out/, which is gitignored.
 *   node scripts/palette-sheet.js
 */
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

function block(selector) {
  // `requires` is not optional here: this reads the built stylesheet, where
  // Tailwind's own `:root,:host{--font-sans…}` precedes the theme block.
  const body = findBlock(css, selector, { requires: "--background" })
  return body ? properties(body) : null
}

// Picker order, default first — same as PALETTES in lib/theme.ts.
const NAMES = {
  graphite: "Graphite — neutral grey",
  cream: "Cream — warm paper",
  sage: "Sage — muted green",
  ocean: "Ocean — soft blue",
  lavender: "Lavender — dusty violet",
  clay: "Clay — terracotta",
}

const base = { light: block(":root"), dark: block(".dark") }

function tokens(id, variant) {
  const b = base[variant]
  // Cream *is* the base: it lives in `:root` / `.dark` with no palette
  // attribute, so there is no separate block to layer on.
  if (id === "cream") return b
  const sel = variant === "dark" ? `.dark[data-palette=${id}]` : `[data-palette=${id}]`
  const overrides = block(sel)
  if (!overrides) throw new Error(`no ${variant} block for palette "${id}" (selector ${sel})`)
  return { ...b, ...overrides }
}

const TOKEN_SWATCHES = [
  "--background",
  "--card",
  "--muted",
  "--accent",
  "--border",
  "--primary",
  "--foreground",
]

/** A miniature of the real app: sidebar rail, heading, cards, buttons. */
function mock(id, variant) {
  const t = tokens(id, variant)
  const v = (k) => t[k]
  return `
  <figure class="mock">
    <figcaption>${NAMES[id]} <span class="mode">${variant}</span></figcaption>
    <div class="app" style="background:${v("--background")};color:${v("--foreground")};border-color:${v("--border")}">
      <div class="rail" style="background:${v("--card")};border:1px solid ${v("--border")}">
        <div class="logo" style="background:${v("--primary")}"><i style="background:${v("--primary-foreground")}"></i></div>
        <div class="navon" style="background:${v("--primary")}"></div>
        <div class="nav" style="background:${v("--muted-foreground")};opacity:.45"></div>
        <div class="nav" style="background:${v("--muted-foreground")};opacity:.45"></div>
      </div>
      <div class="body">
        <div class="h1">Settings</div>
        <div class="sub" style="color:${v("--muted-foreground")}">Only the palette changes.</div>
        <div class="card" style="background:${v("--card")};border-color:${v("--border")}">
          <div class="row">
            <div>
              <div class="lbl">Appearance</div>
              <div class="hint" style="color:${v("--muted-foreground")}">Follows your system theme.</div>
            </div>
            <div class="seg" style="background:${v("--muted")};border-color:${v("--border")}">
              <span class="on" style="background:${v("--card")};color:${v("--foreground")}">Light</span>
              <span style="color:${v("--muted-foreground")}">Dark</span>
            </div>
          </div>
          <div class="hr" style="background:${v("--border")}"></div>
          <div class="row">
            <div class="lbl">Default fit</div>
            <div class="btns">
              <span class="btn" style="background:${v("--primary")};color:${v("--primary-foreground")}">Apply</span>
              <span class="btn" style="background:${v("--secondary")};color:${v("--secondary-foreground")};border:1px solid ${v("--border")}">Cancel</span>
            </div>
          </div>
        </div>
        <div class="chips">
          ${TOKEN_SWATCHES.map(
            (k) =>
              `<span class="chip" title="${k}: ${v(k)}" style="background:${v(k)};border-color:${v("--border")}"></span>`
          ).join("")}
        </div>
      </div>
    </div>
  </figure>`
}

const ids = Object.keys(NAMES)
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>WallDesk palettes</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:28px;background:#8e8e93;font:14px/1.45 ui-sans-serif,system-ui,sans-serif}
  h1{margin:0 0 4px;font-size:19px;color:#fff}
  p.lede{margin:0 0 22px;color:#f2f2f7;font-size:13px}
  h2{color:#fff;font-size:14px;margin:26px 0 10px;font-weight:600;letter-spacing:.02em}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}
  figure{margin:0}
  figcaption{font-size:12px;color:#fff;margin-bottom:6px;font-weight:500}
  .mode{opacity:.62;font-weight:400}
  .app{display:flex;gap:9px;height:190px;padding:8px;border-radius:12px;border:1px solid;
       box-shadow:0 8px 24px rgb(0 0 0 / .22);overflow:hidden}
  .rail{width:34px;flex:none;border-radius:9px;display:flex;flex-direction:column;
        align-items:center;gap:7px;padding:7px 0;box-shadow:0 1px 3px rgb(0 0 0 / .07)}
  .logo{width:20px;height:20px;border-radius:7px;display:grid;place-items:center}
  .logo i{width:11px;height:11px;border-radius:50%;display:block}
  .navon{width:19px;height:19px;border-radius:6px;opacity:.9}
  .nav{width:12px;height:12px;border-radius:4px}
  .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
  .h1{font-size:15px;font-weight:600}
  .sub{font-size:11px}
  .card{border:1px solid;border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:8px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .lbl{font-size:11.5px;font-weight:500}
  .hint{font-size:10px;margin-top:2px}
  .hr{height:1px}
  .seg{display:flex;gap:2px;padding:2px;border-radius:7px;border:1px solid;font-size:10px}
  .seg span{padding:3px 7px;border-radius:5px}
  .seg .on{box-shadow:0 1px 2px rgb(0 0 0 / .08)}
  .btns{display:flex;gap:5px}
  .btn{font-size:10px;padding:4px 9px;border-radius:6px;font-weight:500}
  .chips{display:flex;gap:5px;margin-top:auto}
  .chip{width:20px;height:20px;border-radius:5px;border:1px solid}
</style>
<h1>WallDesk colour themes</h1>
<p class="lede">Six palettes, light and dark. Rendered from the built stylesheet, so these are the shipped values.
Swatches bottom-right of each tile are background / card / muted / accent / border / primary / foreground.</p>
<h2>Light</h2>
<div class="grid">${ids.map((id) => mock(id, "light")).join("")}</div>
<h2>Dark</h2>
<div class="grid">${ids.map((id) => mock(id, "dark")).join("")}</div>
</html>`

const dest = path.join("out", "palette-sheet.html")
fs.writeFileSync(dest, html)
console.log("wrote", dest, "from", cssFile)
