"use client"

import { useMemo } from "react"
import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"

import { fetchCollectionList, fetchCollectionPage } from "./api"
import { collectionKey, type CollectionRef } from "./collection_ref"
import { useSettings } from "./settings"
import { toastError } from "./toast"

const STORE_FILE = "collections.json"
const IMPORTED_KEY = "imported"

/**
 * A collection the user has imported by pasting a reference to it.
 *
 * Only the pointer and a little display metadata are kept. The wallpapers
 * themselves are fetched live every time the collection is opened, which is what
 * makes this behave like a subscription to somebody's list rather than a copy of
 * it: if the owner adds to the collection, the user sees the additions. It also
 * means an imported collection is empty when offline, unlike local Favorites.
 */
export type ImportedCollection = {
  /** Original casing, since this is what gets displayed and requested. */
  username: string
  id: number
  label: string
  /** Wallpapers at import time. Display only — it goes stale. */
  count: number | null
  /** First wallpaper's thumbnail, used as the cover on the library card. */
  cover: string | null
  /** ISO timestamp, so the library can order by most recently added. */
  importedAt: string
}

/**
 * Deferred for the same reason as the favorites and settings stores: the plugin
 * only exists inside the Tauri webview, so touching it at module scope would
 * break the static export build.
 */
let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true })
  }
  return storePromise
}

type CollectionsState = {
  /** Keyed by `collectionKey`, so re-importing the same one updates in place. */
  imported: Record<string, ImportedCollection>
  hydrated: boolean
  hydrate: () => Promise<void>
  importCollection: (ref: CollectionRef) => Promise<ImportedCollection>
  removeCollection: (key: string) => Promise<void>
}

/** The read in flight, if any — see the note on the one in lib/store.ts. */
let hydratePromise: Promise<void> | null = null

export const useCollections = create<CollectionsState>((set, get) => ({
  imported: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()

    hydratePromise ??= (async () => {
      try {
        const store = await getStore()
        const saved =
          (await store.get<Record<string, ImportedCollection>>(IMPORTED_KEY)) ?? {}
        set({ imported: saved, hydrated: true })
      } catch (error: unknown) {
        // A failed read must not block the page — the library just starts empty.
        set({ hydrated: true })
        toastError("Your saved collections could not be read from disk", error)
      }
    })().finally(() => {
      hydratePromise = null
    })

    return hydratePromise
  },

  /**
   * Verify a reference and add it to the library.
   *
   * Throws rather than reporting the failure itself, because the caller is a
   * dialog whose own state depends on the outcome — it stays open on a bad
   * reference so the user can fix what they pasted, and closes on success. Import
   * is deliberately strict: a reference that cannot be read *now* is not saved,
   * so the library never contains a card that leads nowhere.
   */
  importCollection: async (ref) => {
    // Read straight from the settings store rather than threading a credential
    // through the UI. The key is optional — public collections need none.
    const apiKey = useSettings.getState().wallhavenApiKey || undefined

    // Both at once: the contents decide whether the import succeeds, the list
    // only supplies a nicer name.
    const [contents, listing] = await Promise.allSettled([
      fetchCollectionPage(ref.username, ref.id, 1, apiKey),
      fetchCollectionList(ref.username, apiKey),
    ])

    if (contents.status === "rejected") throw contents.reason
    const page = contents.value

    // An existing but empty collection is not an error, though it is worth
    // saying out loud — silently importing a card that opens onto nothing looks
    // like a bug.
    if (page.items.length === 0 && (page.total ?? 0) === 0) {
      throw new Error("That collection is empty.")
    }

    const info =
      listing.status === "fulfilled"
        ? listing.value.find((entry) => entry.id === ref.id)
        : undefined

    const record: ImportedCollection = {
      username: ref.username,
      id: ref.id,
      // The listing is the only place a collection's real name is exposed. It's
      // missing when the owner's collections aren't publicly listed but this one
      // is reachable, or when that request simply failed.
      label: info?.label ?? `Collection ${ref.id}`,
      count: page.total ?? info?.count ?? null,
      cover: page.items[0]?.thumbnail ?? null,
      importedAt: new Date().toISOString(),
    }

    const next = { ...get().imported, [collectionKey(ref)]: record }
    set({ imported: next })

    try {
      const store = await getStore()
      await store.set(IMPORTED_KEY, next)
      await store.save()
    } catch (error: unknown) {
      // The import worked; only persistence failed. Keep it in memory for this
      // session and say so, rather than throwing and implying the whole thing
      // failed.
      toastError(
        `${record.label} was imported, but will be gone when the app restarts`,
        error
      )
    }

    return record
  },

  removeCollection: async (key) => {
    const next = { ...get().imported }
    delete next[key]

    // Optimistic, so the card disappears on click.
    set({ imported: next })

    try {
      const store = await getStore()
      await store.set(IMPORTED_KEY, next)
      await store.save()
    } catch (error: unknown) {
      toastError("Your collections list could not be saved", error)
    }
  },
}))

/**
 * Imported collections as a list, newest first.
 *
 * `Object.values` has to happen in a memo rather than in the selector: zustand
 * v5 hands the selector's result straight to `useSyncExternalStore`, which needs
 * a stable reference between calls, and deriving a fresh array every time reads
 * as a new snapshot on every render — an infinite loop. Same hazard as
 * `useFavoriteList`.
 *
 * Newest first so a collection the user has just imported appears at the top of
 * the library, right where they are looking.
 */
export function useImportedCollections(): ImportedCollection[] {
  const imported = useCollections((state) => state.imported)
  return useMemo(
    () =>
      Object.values(imported).sort((a, b) =>
        b.importedAt.localeCompare(a.importedAt)
      ),
    [imported]
  )
}

/** The stored record for a reference, if the user has imported it. */
export function useImportedCollection(
  ref: CollectionRef | null
): ImportedCollection | null {
  const imported = useCollections((state) => state.imported)
  return ref ? (imported[collectionKey(ref)] ?? null) : null
}
