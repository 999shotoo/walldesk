/**
 * Shared CSS block finder for the theme check scripts.
 *
 * Both `check-palettes.js` (source `globals.css`) and `check-contrast.js`
 * (built, minified CSS) need to pull one rule's declarations out by selector,
 * and both have the same trap: `[data-palette=x]` is a substring of
 * `.dark[data-palette=x]`, and the dark rules are now comma-separated lists
 * (`.dark[data-palette=x], .dark [data-palette=x]`). A plain
 * `indexOf(selector + "{")` finds neither reliably.
 */

/** True when `css[index]` starts a selector rather than continuing a compound one. */
function atSelectorBoundary(css, index) {
  if (index === 0) return true
  // Walk back over whitespace, then require a rule/list boundary. Anything
  // else — a class, an id, another attribute — means we landed mid-selector.
  let i = index - 1
  while (i >= 0 && /\s/.test(css[i])) i--
  return i < 0 || css[i] === "}" || css[i] === "{" || css[i] === "," || css[i] === ";"
}

/**
 * Drop `/* … *\/` comments.
 *
 * Required before any selector matching against the source stylesheet: the
 * palette rules are each introduced by a comment, so the character preceding a
 * selector is otherwise the `/` ending that comment rather than a rule
 * boundary. It also stops a selector *named inside* a comment from matching.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Body of the first rule whose selector list contains `selector` as a whole
 * entry, or null. Returns the text between the braces.
 *
 * `requires` names a custom property the block must declare. Pass it whenever
 * reading the *built* stylesheet: Tailwind emits its own `:root,:host{…}` for
 * the font and colour-ramp tokens, and it lands well before the theme block, so
 * a plain first-match on `:root` finds the wrong rule and every token reads back
 * undefined. It also skips the `@supports (color:lab(…))` duplicates when the
 * property you want only exists in the baseline block.
 */
function findBlock(rawCss, selector, { requires } = {}) {
  const css = stripComments(rawCss)
  let from = 0
  for (;;) {
    const at = css.indexOf(selector, from)
    if (at === -1) return null
    from = at + selector.length

    if (!atSelectorBoundary(css, at)) continue

    // The selector must be followed by the end of this entry — either the rule
    // opens, or another entry in the same list follows.
    const rest = css.slice(from)
    const next = rest.match(/^\s*([{,])/)
    if (!next) continue

    const open = css.indexOf("{", from)
    const close = css.indexOf("}", open)
    if (open === -1 || close === -1) return null

    const body = css.slice(open + 1, close)
    if (requires && !new RegExp(`${requires}\\s*:`).test(body)) continue
    return body
  }
}

/** Custom-property names declared in a block, in source order. */
function propertyNames(body) {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])
}

/** Custom properties in a block as name → value. */
function properties(body) {
  const out = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+)/g)) out[m[1]] = m[2].trim()
  return out
}

module.exports = { findBlock, propertyNames, properties, stripComments }
