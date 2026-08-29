"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { convertFileSrc } from "@tauri-apps/api/core"
import { load, type Store } from "@tauri-apps/plugin-store"
import { exists, remove as removeFile, stat } from "@tauri-apps/plugin-fs"

import { wallpaperKey } from "./store"
import { useOffline } from "./offline"
import { toastError, toastInfo, toastSuccess, toastUndo } from "./toast"
import {
  downloadAndSetWallpaper,
  downloadWallpaper,
  wallpaperFilename,
  type FitMode,
  type SaveTarget,
} from "./wallpaper"

const STORE_FILE = "downloads.json"
const DOWNLOADS_KEY = "downloads"

/**
 * Where everything the app saves goes.
 *
 * One directory rather than two: explicit downloads used to land in the OS
 * Downloads folder while applied wallpapers went to `Pictures/WallDesk`, which
 * meant the same list pointed into two places and the user had to remember which
 * button put a file where. Records written before this still carry
 * `target: "downloads"` and keep working — the ledger stores absolute paths.
 */
const SAVE_TARGET: SaveTarget = "library"

/** What put a file on disk. */
export type DownloadReason =
  /** The user asked for a copy — the Download button. */
  | "download"
  /** A side effect of applying the wallpaper, which has to write the file first. */
  | "wallpaper"

/**
 * A wallpaper that exists as a file on this machine.
 *
 * Deliberately a superset of `CombinedWallpaper` rather than a reference to one:
 * every field needed to render the wallpaper is copied in, so the Downloads
 * collection works with no network at all. That is the whole point of the ledger —
 * `imageurl` is kept for provenance, but nothing in the downloads views fetches
 * it.
 */
export type DownloadedWallpaper = CombinedWallpaper & {
  /** Absolute path of the file on disk. */
  path: string
  /** Final path component, which is what the user sees in a file manager. */
  filename: string
  /** Which directory it landed in — `library` is Pictures/WallDesk. */
  target: SaveTarget
  /** What wrote it. */
  via: DownloadReason
  /** ISO timestamp, so the list can order by most recent. */
  savedAt: string
  /** File size, or `null` when it could not be read. Display only. */
  sizeBytes: number | null
  /** The fit mode applied, when this was set as the desktop wallpaper. */
  fitMode: FitMode | null
}

/**
 * Deferred for the same reason as every other store here: the plugin only exists
 * inside the Tauri webview, so touching it at module scope would break the static
 * export build.
 */
let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true })
  }
  return storePromise
}

/** The read in flight, if any — see the note on the one in lib/store.ts. */
let hydratePromise: Promise<void> | null = null

/**
 * A local file as something an `<img src>` can load.
 *
 * Tauri serves files over its `asset:` protocol — a plain `file://` URL is blocked
 * by the webview. Returns `null` outside the Tauri webview (a normal browser, or
 * the static export build's prerender pass) so callers can fall back instead of
 * throwing.
 */
export function localImageSrc(path: string): string | null {
  try {
    return convertFileSrc(path)
  } catch {
    return null
  }
}

/** The Downloads collection itself. */
export const DOWNLOADS_HREF = "/collections/downloads"

/**
 * The folder a saved file sits in.
 *
 * String surgery rather than `@tauri-apps/api/path`: that module's `dirname` is
 * async and unavailable outside the webview, and every caller here only wants a
 * line of text to show the user. Handles both separators, since a Windows path
 * can arrive with either.
 */
export function parentDir(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "")
}

/**
 * Link to a downloaded wallpaper's own detail page.
 *
 * Not `wallpaperHref` on purpose. That route resolves a wallpaper by refetching it
 * from its provider and renders the remote file; this one reads the record out of
 * the ledger and renders the local copy, so it keeps working with no connection.
 * Query string rather than a path segment for the usual `output: 'export'` reason.
 */
export function downloadHref(wallpaper: { id: string; provider?: string }): string {
  const params = new URLSearchParams({ id: wallpaper.id })
  if (wallpaper.provider) params.set("provider", wallpaper.provider)
  return `${DOWNLOADS_HREF}/view?${params.toString()}`
}

/**
 * The file's size on disk.
 *
 * Needs `fs:allow-stat` plus a scope entry covering the directory — see
 * `src-tauri/capabilities/default.json`, which allows exactly the two the backend
 * writes to (`$DOWNLOAD` and `$PICTURE/WallDesk`).
 *
 * Opportunistic regardless: the size is display-only, so a failure here — a path
 * outside the scope, a file already moved — must not fail the download that just
 * succeeded.
 */
async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return typeof info.size === "number" ? info.size : null
  } catch {
    return null
  }
}

/**
 * Whether the file is still there.
 *
 * Three-valued on purpose. `null` means the question could not be asked — no fs
 * plugin, so a plain browser or the prerender pass — and that has to be distinct
 * from "no": treating unknowable as missing would disable every button in the
 * export preview and mark a perfectly good library as gone.
 */
async function fileExists(path: string): Promise<boolean | null> {
  try {
    return await exists(path)
  } catch {
    return null
  }
}

/** What became of a file the user asked to be rid of. */
type DeleteOutcome =
  | { kind: "deleted" }
  /** It was already gone — someone got there first, in a file manager or a sweep. */
  | { kind: "absent" }
  | { kind: "failed"; error: unknown }

/**
 * Delete the file.
 *
 * Returns the outcome instead of throwing, because two of the three are things
 * the caller reports rather than recovers from, and only one is a failure.
 *
 * The existence check in front is not belt-and-braces: `remove` throws on a path
 * that is not there, and a file deleted outside the app is the ordinary case for
 * this list. Reporting "could not delete" for a file that is already gone would
 * be nonsense, and would leave the user with an error toast for an outcome they
 * asked for.
 */
async function deleteFile(path: string): Promise<DeleteOutcome> {
  if ((await fileExists(path)) === false) return { kind: "absent" }
  try {
    await removeFile(path)
    return { kind: "deleted" }
  } catch (error: unknown) {
    return { kind: "failed", error }
  }
}

type DownloadsState = {
  /** Keyed by `wallpaperKey`, so re-saving the same wallpaper updates in place. */
  downloads: Record<string, DownloadedWallpaper>
  /**
   * Keys whose file is known to be gone from disk.
   *
   * Only ever holds confirmed absences — a record missing from here has either
   * been checked and found present, or not been checked at all. Files can vanish
   * behind the app's back at any time (a file manager, a disk cleanup, an external
   * drive unmounting), so the ledger alone is never proof that a file exists.
   */
  missing: Record<string, true>
  hydrated: boolean
  hydrate: () => Promise<void>
  /**
   * Record a file that is already on disk. Exposed for completeness; the two
   * helpers below are how the app actually gets here.
   */
  record: (
    wallpaper: CombinedWallpaper,
    file: { path: string; target: SaveTarget; via: DownloadReason; fitMode?: FitMode | null }
  ) => Promise<DownloadedWallpaper>
  /**
   * Delete the file and forget the record.
   *
   * Both halves, deliberately. This used to keep the file — a "remove from list"
   * that left a wallpaper sitting in Pictures/WallDesk with nothing in the app
   * pointing at it, so getting rid of one meant deleting it here *and* again in a
   * file manager. Removing an entry is now the app's answer to "I don't want this
   * wallpaper any more", which is what a user means by it.
   *
   * Raises its own toasts, including the Undo — both callers would otherwise have
   * to duplicate the wiring, and the messages differ depending on whether the file
   * was actually there.
   */
  remove: (key: string) => Promise<void>
  /**
   * Put a deleted record back, and fetch its file again.
   *
   * Backs the Undo on the deletion toast, and is the reason a hover button is
   * allowed to delete a file with no confirmation in front of it.
   */
  restore: (record: DownloadedWallpaper) => Promise<void>
  /** Re-check every record against the disk and rebuild the missing set. */
  checkFiles: () => Promise<void>
  /**
   * Note that one file has gone missing, without a disk round trip.
   *
   * The cheap signal: an `<img>` pointed at the local copy failed to load, which
   * is the app finding out the moment a file is deleted while it is open, rather
   * than on the next `checkFiles`.
   */
  markMissing: (key: string) => void
  /** Fetch the file again from the URL the record was created with. */
  redownload: (key: string) => Promise<DownloadedWallpaper>
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  downloads: {},
  missing: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()

    // Deduplicated across concurrent callers — see the note on `hydratePromise`
    // in lib/store.ts. This store has the most of them: `AppBoot`, the downloads
    // list, the detail page and the collections index all hydrate defensively.
    hydratePromise ??= (async () => {
      try {
        const store = await getStore()
        const saved =
          (await store.get<Record<string, DownloadedWallpaper>>(DOWNLOADS_KEY)) ?? {}
        set({ downloads: saved, hydrated: true })
      } catch (error: unknown) {
        // A failed read must not block the page — the list just starts empty.
        set({ hydrated: true })
        toastError("Your downloads could not be read from disk", error)
      }

      // After the records are in, not before: this walks them. Not awaited by
      // callers of `hydrate` — the list should render immediately and have its
      // buttons settle a moment later, rather than waiting on a stat per file.
      void get().checkFiles()
    })().finally(() => {
      hydratePromise = null
    })

    return hydratePromise
  },

  record: async (wallpaper, file) => {
    const record: DownloadedWallpaper = {
      ...wallpaper,
      path: file.path,
      // Derived from the path the backend actually wrote, not from the name that
      // was requested — `sanitize_filename` may have changed it.
      filename: file.path.split(/[\\/]/).pop() ?? file.path,
      target: file.target,
      via: file.via,
      savedAt: new Date().toISOString(),
      sizeBytes: await fileSize(file.path),
      fitMode: file.fitMode ?? null,
    }

    // One record per wallpaper, keyed the same way favorites are. Saving a copy
    // and then applying the same wallpaper writes two files in two directories;
    // the ledger keeps the most recent, which is the one the card opens. Tracking
    // both would show the same wallpaper twice in the grid, which reads as a bug.
    const key = wallpaperKey(wallpaper)
    const next = { ...get().downloads, [key]: record }

    // A write just succeeded, so whatever was missing under this key is not any
    // more. This is what clears the state after a redownload.
    const missing = { ...get().missing }
    delete missing[key]

    set({ downloads: next, missing })

    try {
      const store = await getStore()
      await store.set(DOWNLOADS_KEY, next)
      await store.save()
    } catch (error: unknown) {
      // The file is on disk either way; only the ledger entry failed to persist.
      toastError(
        `${record.filename} was saved, but is not in your downloads list`,
        error
      )
    }

    return record
  },

  remove: async (key) => {
    const record = get().downloads[key]

    const next = { ...get().downloads }
    delete next[key]

    const missing = { ...get().missing }
    delete missing[key]

    // Optimistic, so the card disappears on click.
    set({ downloads: next, missing })

    try {
      const store = await getStore()
      await store.set(DOWNLOADS_KEY, next)
      await store.save()
    } catch (error: unknown) {
      toastError("The downloads list could not be saved", error)
    }

    // Nothing else to do for a key that was not in the list — a double click on
    // the same card, most likely.
    if (!record) return

    const outcome = await deleteFile(record.path)

    if (outcome.kind === "failed") {
      // No Undo offered here: the record is gone from the list but the file is
      // still where it was, so there is nothing to reverse — and a toast that
      // offers to undo a deletion that did not happen would be a lie.
      toastError(`${record.filename} could not be deleted`, outcome.error)
      return
    }

    toastUndo(
      `Deleted ${record.filename}`,
      outcome.kind === "deleted"
        ? "Removed from your downloads and from Pictures/WallDesk."
        : "The file was already gone — removed from your downloads.",
      () => void get().restore(record)
    )
  },

  restore: async (record) => {
    const key = wallpaperKey(record)
    const next = { ...get().downloads, [key]: record }

    // The record comes back first, on its own, and flagged missing. It is local
    // so it cannot fail, and it is what puts the card back where the user is
    // looking — the file is a second, slower step that may not succeed at all.
    // Flagging it up front means the card renders the missing state directly
    // instead of trying to draw a deleted file and failing into it.
    set({ downloads: next, missing: { ...get().missing, [key]: true } })

    try {
      const store = await getStore()
      await store.set(DOWNLOADS_KEY, next)
      await store.save()
    } catch (error: unknown) {
      toastError("The downloads list could not be saved", error)
    }

    // Skipped rather than attempted and failed: with no connection this can only
    // produce an error toast on top of an undo that otherwise worked. The record
    // is back and marked missing, which is exactly the state the Redownload
    // button exists for.
    if (!useOffline.getState().online) {
      toastInfo(
        `${record.filename} is back in your downloads`,
        "The file needs downloading again, which needs a connection."
      )
      return
    }

    try {
      await get().redownload(key)
      toastSuccess(`${record.filename} is back`)
    } catch (error: unknown) {
      toastError(`${record.filename} could not be downloaded again`, error)
    }
  },

  checkFiles: async () => {
    const entries = Object.entries(get().downloads)

    const checked = await Promise.all(
      entries.map(
        async ([key, record]) => [key, await fileExists(record.path)] as const
      )
    )

    // Rebuilt from scratch rather than merged, so a file that has come back —
    // redownloaded, or an unmounted drive reconnected — stops being marked gone.
    const missing: Record<string, true> = {}
    for (const [key, present] of checked) {
      if (present === false) missing[key] = true
    }

    // Only publish an actual change. This runs on every visit to the downloads
    // page, and a fresh object each time would re-render everything subscribed to
    // `missing` — zustand compares by reference — for no reason.
    const current = get().missing
    const keys = Object.keys(missing)
    const unchanged =
      keys.length === Object.keys(current).length &&
      keys.every((key) => current[key])
    if (unchanged) return

    set({ missing })
  },

  markMissing: (key) => {
    if (!get().downloads[key] || get().missing[key]) return
    set({ missing: { ...get().missing, [key]: true } })
  },

  redownload: async (key) => {
    const record = get().downloads[key]
    if (!record) throw new Error("That wallpaper is no longer in your downloads.")

    // Straight from the URL the record was saved with. The ledger copies every
    // field of the wallpaper in for exactly this kind of reason, so getting the
    // file back takes no provider lookup — only the download itself.
    const path = await downloadWallpaper(
      record.imageurl,
      wallpaperFilename(record),
      SAVE_TARGET
    )

    // Back through `record`, so the path, size and timestamp all reflect the new
    // file, and the missing flag clears in the same update.
    return get().record(record, {
      path,
      target: SAVE_TARGET,
      via: record.via,
      fitMode: record.fitMode,
    })
  },
}))

/**
 * ── Actions ──────────────────────────────────────────────────────────────────
 *
 * Every path that writes a wallpaper to disk goes through one of these two, so
 * the ledger cannot drift from what is actually saved. Call these instead of
 * `downloadWallpaper` / `downloadAndSetWallpaper` directly.
 *
 * Both record *after* the write succeeds and let a failure propagate, so a failed
 * download never leaves a record pointing at a file that is not there.
 */

/** Save a copy to the wallpaper library and record it. */
export async function saveWallpaperCopy(
  wallpaper: CombinedWallpaper
): Promise<DownloadedWallpaper> {
  const path = await downloadWallpaper(
    wallpaper.imageurl,
    wallpaperFilename(wallpaper),
    SAVE_TARGET
  )
  return useDownloads.getState().record(wallpaper, {
    path,
    target: SAVE_TARGET,
    via: "download",
  })
}

/**
 * Apply a wallpaper to the desktop and record the file it wrote.
 *
 * The file is unavoidable — the OS reads it back on every login, so applying a
 * wallpaper always means saving one. Recording it is what lets it show up in
 * Downloads without the user having asked for a copy separately.
 */
export async function applyWallpaper(
  wallpaper: CombinedWallpaper,
  fitMode?: FitMode
): Promise<DownloadedWallpaper> {
  const path = await downloadAndSetWallpaper(
    wallpaper.imageurl,
    wallpaperFilename(wallpaper),
    fitMode
  )
  return useDownloads.getState().record(wallpaper, {
    path,
    target: "library",
    via: "wallpaper",
    fitMode: fitMode ?? null,
  })
}

/**
 * ── Selectors ────────────────────────────────────────────────────────────────
 */

/**
 * Downloaded wallpapers as a list, newest first.
 *
 * `Object.values` has to happen in a memo rather than the selector: zustand v5
 * hands the selector's result straight to `useSyncExternalStore`, which needs a
 * stable reference between calls. Same hazard as `useFavoriteList`.
 */
export function useDownloadList(): DownloadedWallpaper[] {
  const downloads = useDownloads((state) => state.downloads)
  return useMemo(
    () => Object.values(downloads).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [downloads]
  )
}

/** One record, or `null` if this wallpaper has never been written to disk. */
export function useDownload(
  wallpaper: { id: string; provider?: string } | null
): DownloadedWallpaper | null {
  const downloads = useDownloads((state) => state.downloads)
  return wallpaper ? (downloads[wallpaperKey(wallpaper)] ?? null) : null
}

/** Subscribe to just one wallpaper's downloaded state, to avoid needless re-renders. */
export function useIsDownloaded(wallpaper: { id: string; provider?: string }): boolean {
  const key = wallpaperKey(wallpaper)
  return useDownloads((state) => Boolean(state.downloads[key]))
}

/**
 * Whether this record's file is known to be gone.
 *
 * `false` covers both "checked, still there" and "not checked yet", which is the
 * right default for the UI: buttons stay enabled until the app has actual evidence
 * the file is gone, so a slow disk check never disables anything spuriously.
 */
export function useIsFileMissing(wallpaper: { id: string; provider?: string }): boolean {
  const key = wallpaperKey(wallpaper)
  return useDownloads((state) => Boolean(state.missing[key]))
}
