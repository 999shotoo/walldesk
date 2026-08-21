"use client"

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

/** How the desktop scales the wallpaper. Mirrors `FitMode` in `src-tauri/src/wallpaper.rs`. */
export type FitMode = "center" | "crop" | "fit" | "span" | "stretch" | "tile"

/** Where a download is written. Mirrors `SaveTarget` in `src-tauri/src/wallpaper.rs`. */
export type SaveTarget = "library" | "downloads"

export const DEFAULT_FIT_MODE: FitMode = "crop"

export const FIT_MODES: ReadonlyArray<{ value: FitMode; label: string }> = [
  { value: "crop", label: "Fill screen" },
  { value: "fit", label: "Fit to screen" },
  { value: "stretch", label: "Stretch" },
  { value: "center", label: "Center" },
  { value: "span", label: "Span displays" },
  { value: "tile", label: "Tile" },
]

export const FIT_MODE_LABELS: Record<FitMode, string> = FIT_MODES.reduce(
  (acc, mode) => ({ ...acc, [mode.value]: mode.label }),
  {} as Record<FitMode, string>
)

const DOWNLOAD_PROGRESS_EVENT = "wallpaper://download-progress"

/**
 * Link to a wallpaper's detail page.
 *
 * This is a query string rather than `/wallpaper/<id>` because the app is a
 * Next.js static export (`output: 'export'`): a dynamic path segment would need
 * every id enumerated at build time via `generateStaticParams`, and the catalog
 * is an unbounded remote API.
 */
export function wallpaperHref(wallpaper: { id: string; provider?: string }): string {
  const params = new URLSearchParams({ id: wallpaper.id })
  if (wallpaper.provider) params.set("provider", wallpaper.provider)
  return `/wallpaper?${params.toString()}`
}


export type DownloadProgress = {
  url: string
  downloaded: number
  /** `null` when the server sent no Content-Length, so percentage is unknowable. */
  total: number | null
}

/**
 * Subscribe to download progress. The backend throttles these to roughly one
 * event per 256KB, so they are safe to render directly.
 */
export function onDownloadProgress(
  handler: (progress: DownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<DownloadProgress>(DOWNLOAD_PROGRESS_EVENT, (event) =>
    handler(event.payload)
  )
}

/**
 * Build a stable, filesystem-safe filename for a wallpaper. The backend
 * sanitizes this again — it does not trust the webview — but a sensible name
 * here is what the user actually sees on disk.
 */
export function wallpaperFilename(wallpaper: {
  id: string
  provider?: string
  imageurl?: string
}): string {
  const extension = /\.(jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i.exec(
    wallpaper.imageurl ?? ""
  )
  const ext = extension ? extension[1].toLowerCase() : "jpg"
  const provider = wallpaper.provider ?? "wallpaper"
  return `${provider}-${wallpaper.id}.${ext}`
}

/** Apply an image that is already on disk as the desktop wallpaper. */
export function setWallpaper(path: string, mode?: FitMode): Promise<void> {
  return invoke<void>("set_wallpaper", { path, mode: mode ?? null })
}

/** Download an image and return the absolute path it was written to. */
export function downloadWallpaper(
  url: string,
  filename: string,
  target: SaveTarget = "library"
): Promise<string> {
  return invoke<string>("download_wallpaper", { url, filename, target })
}

/** Download an image into the library and immediately apply it. */
export function downloadAndSetWallpaper(
  url: string,
  filename: string,
  mode?: FitMode
): Promise<string> {
  return invoke<string>("download_and_set_wallpaper", {
    url,
    filename,
    mode: mode ?? null,
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
