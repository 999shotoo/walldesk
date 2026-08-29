/**
 * Appearance is two independent axes:
 *
 *   mode    — light / dark / system, owned by `next-themes` (the `dark` class)
 *   palette — which set of colour tokens is in play (the `data-palette` attr)
 *
 * Both live in `localStorage` rather than the Tauri store used by
 * `lib/settings.ts`. That is deliberate: the palette has to be on <html>
 * before the first paint or the window flashes cream and then repaints, and
 * `@tauri-apps/plugin-store` is async. `next-themes` already stores the mode
 * the same way, so appearance stays in one place.
 *
 * No `"use client"` here — the root layout is a server component and needs
 * `PALETTE_BOOTSTRAP_SCRIPT`. The React store that wraps this lives in
 * `lib/use_palette.ts`.
 */

export const PALETTE_STORAGE_KEY = "walldesk-palette"
export const PALETTE_ATTRIBUTE = "data-palette"

export type PaletteId =
  | "cream"
  | "graphite"
  | "sage"
  | "ocean"
  | "lavender"
  | "clay"

export const DEFAULT_PALETTE: PaletteId = "graphite"

export type PaletteMeta = {
  id: PaletteId
  label: string
  hint: string
}

/**
 * Display order for the picker, default first. The colours themselves live in
 * `app/globals.css` — the swatches read them back out of CSS by setting
 * `data-palette` on the preview tile, so there is no second copy to drift.
 */
export const PALETTES: readonly PaletteMeta[] = [
  { id: "graphite", label: "Graphite", hint: "Neutral grey" },
  { id: "cream", label: "Cream", hint: "Warm paper" },
  { id: "sage", label: "Sage", hint: "Muted green" },
  { id: "ocean", label: "Ocean", hint: "Soft blue" },
  { id: "lavender", label: "Lavender", hint: "Dusty violet" },
  { id: "clay", label: "Clay", hint: "Terracotta" },
] as const

export const PALETTE_IDS: readonly string[] = PALETTES.map(
  (palette) => palette.id
)

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && PALETTE_IDS.includes(value)
}

/** Duration of the cross-fade in `globals.css`, plus a frame of slack. */
const SWITCH_MS = 300
let switchTimer: number | undefined

/**
 * Turn on the colour cross-fade for one switch. Shared by the palette picker
 * and the light/dark toggle so both feel the same. Repeated calls restart the
 * window instead of stacking, which matters when someone clicks through a few
 * palettes quickly.
 */
export function beginThemeSwitch(): void {
  if (typeof document === "undefined") return

  const root = document.documentElement
  root.classList.add("theme-switching")

  if (switchTimer !== undefined) window.clearTimeout(switchTimer)
  switchTimer = window.setTimeout(() => {
    root.classList.remove("theme-switching")
    switchTimer = undefined
  }, SWITCH_MS)
}

/**
 * Runs before first paint, inlined in the document head. Kept as a string
 * because it must not wait on the React bundle. Mirrors the fallback chain in
 * `usePalette.hydrate`.
 */
export const PALETTE_BOOTSTRAP_SCRIPT = `(function(){var d=document.documentElement,k=${JSON.stringify(
  PALETTE_STORAGE_KEY
)},a=${JSON.stringify(PALETTE_ATTRIBUTE)},f=${JSON.stringify(
  DEFAULT_PALETTE
)},l=${JSON.stringify(
  PALETTE_IDS
)};try{var p=localStorage.getItem(k);d.setAttribute(a,l.indexOf(p)>-1?p:f)}catch(e){d.setAttribute(a,f)}})()`
