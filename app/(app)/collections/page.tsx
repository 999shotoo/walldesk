"use client"

import { useEffect, useMemo, useState } from "react"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"
import {
  Heart,
  HardDriveDownload,
  Images,
  Loader2,
  Plus,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useFavoriteList, useFavorites, wallpaperKey } from "@/lib/store"
import {
  useCollections,
  useImportedCollections,
  type ImportedCollection,
} from "@/lib/collections"
import {
  collectionHref,
  collectionKey,
  parseCollectionRef,
} from "@/lib/collection_ref"
import {
  DOWNLOADS_HREF,
  localImageSrc,
  useDownloadList,
  useDownloads,
} from "@/lib/downloads"
import { useIsOffline } from "@/lib/offline"
import { toastError, toastSuccess } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const FAVORITES_HREF = "/collections/favorites"

/**
 * One tile in the library.
 *
 * The remove button is a sibling of the link rather than a child of it: nesting
 * a button inside an anchor is invalid, and the click would navigate before the
 * handler could do anything. Same arrangement as the overlay buttons on a
 * wallpaper card.
 */
function CollectionTile({
  href,
  label,
  meta,
  cover,
  fallbackIcon,
  onRemove,
  className,
  disabled = false,
  disabledReason,
}: {
  href: string
  label: string
  meta: string
  cover: string | null
  fallbackIcon: React.ReactNode
  className?: string
  onRemove?: () => void
  /** Greyed out and not navigable — used for the tiles that need a connection. */
  disabled?: boolean
  /** Shown in place of `meta` while disabled, so the tile explains itself. */
  disabledReason?: string
}) {
  // A cover can fail: a remote thumbnail with no connection, or a local file
  // deleted since it was recorded. Falling back to the icon beats a broken-image
  // glyph on a tile that is otherwise perfectly usable.
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [cover])

  const inner = (
    <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-xl">
      {cover && !coverFailed ? (
        // Plain <img>: these are remote thumbnails already sized by the
        // provider, and next/image is unoptimized in a static export anyway.
        <img
          src={cover}
          alt=""
          aria-hidden
          onError={() => setCoverFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center">
          {fallbackIcon}
        </div>
      )}

      {/* Always on, unlike the hover-only scrim on a wallpaper card — the
          title sits on top of the cover permanently and has to stay
          readable against an arbitrary image. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="truncate font-medium">{label}</p>
        <p className="truncate text-xs text-white/70">
          {disabled && disabledReason ? disabledReason : meta}
        </p>
      </div>
    </div>
  )

  return (
    <div className={`group relative ${className || ""}`}>
      {disabled ? (
        // A plain div rather than a Link with the click swallowed: an anchor that
        // does nothing when clicked is worse than one that is visibly not an
        // anchor. The tile stays on screen so the library does not appear to lose
        // collections whenever the connection drops.
        <div
          aria-disabled="true"
          title={disabledReason}
          className="block cursor-not-allowed overflow-hidden rounded-xl opacity-50 grayscale"
        >
          {inner}
        </div>
      ) : (
        <Link
          href={href}
          className="focus-visible:ring-ring block overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none"
        >
          {inner}
        </Link>
      )}

      {/* Still offered while disabled: forgetting an imported collection only
          edits a local file, so it works with no connection. */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove from library"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove {label} from library</span>
        </button>
      )}
    </div>
  )
}

function ImportField() {
  const importCollection = useCollections((state) => state.importCollection)
  const offline = useIsOffline()
  const [draft, setDraft] = useState("")
  const [working, setWorking] = useState(false)
  // Controlled so a successful import can close the dialog. It used to stay open
  // with a confirmation line inside it, which left the user to dismiss a form
  // whose job was done; now the toast confirms and the dialog gets out of the way.
  const [open, setOpen] = useState(false)

  const submit = async () => {
    const ref = parseCollectionRef(draft)
    if (!ref) {
      toastError(
        "That doesn't look like a collection",
        "Paste the link from Wallhaven, or type it as username/id."
      )
      return
    }

    // Checked before the import rather than after, since the record is
    // overwritten in place and the difference would be gone by then.
    const known = Boolean(useCollections.getState().imported[collectionKey(ref)])

    setWorking(true)
    try {
      const record = await importCollection(ref)
      setDraft("")
      setOpen(false)
      toastSuccess(
        known ? `Refreshed ${record.label}` : `Added ${record.label}`,
        `@${record.username}`
      )
    } catch (error: unknown) {
      // Left open on purpose: the reference is still in the field, and a bad one
      // is usually a typo the user wants to correct rather than retype.
      toastError("That collection could not be imported", error)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <form>
        <DialogTrigger render={
          // Importing reads the collection from Wallhaven, so there is nothing
          // useful behind this button offline — better a disabled button that
          // says why than a dialog that can only fail.
          <Button
            disabled={offline}
            title={offline ? "Importing needs a connection" : undefined}
          >
            <Plus className="h-4 w-4" />
            Import
          </Button>
        } />
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import a collection</DialogTitle>
            <DialogDescription >
              <p className="text-muted-foreground text-sm">
                Paste a Wallhaven collection link, or type{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-xs">
                  username/id
                </code>
                . Only public collections can be imported, unless the collection is
                yours and you have set an API key in Settings.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className=" flex flex-col gap-3 rounded-xl shadow-sm">
            <div className="flex w-full max-w-xl items-center gap-2">
              <Input
                value={draft}
                spellCheck={false}
                autoComplete="off"
                aria-label="Wallhaven collection link"
                placeholder="https://wallhaven.cc/user/@username/favorites/:collection_id"
                disabled={working}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && draft.trim()) void submit()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void submit()} disabled={working || !draft.trim()}>
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}

export default function CollectionsPage() {
  const favorites = useFavoriteList()
  const favoritesHydrated = useFavorites((state) => state.hydrated)

  const downloads = useDownloadList()
  const downloadsHydrated = useDownloads((state) => state.hydrated)
  const missingFiles = useDownloads((state) => state.missing)

  const imported = useImportedCollections()
  const hydrated = useCollections((state) => state.hydrated)
  const removeCollection = useCollections((state) => state.removeCollection)

  const offline = useIsOffline()

  // `AppBoot` normally does this; repeating it keeps the page correct if it ever
  // renders outside that layout. `hydrate` returns early once done.
  useEffect(() => {
    void useCollections.getState().hydrate()
    void useDownloads.getState().hydrate()
  }, [])

  const favoritesCover = useMemo(
    () => favorites[0]?.thumbnail ?? null,
    [favorites]
  )

  // The most recent download's own file, not its remote thumbnail — this tile
  // has to keep its cover with no connection, which is the point of the whole
  // section. Costs a full-size decode for one small tile; acceptable at one per
  // page, and it is a file already on this disk.
  //
  // Skips records whose file is known to be gone, so the tile shows the newest
  // wallpaper it can actually draw rather than falling back to the icon because
  // the single most recent one was deleted.
  const downloadsCover = useMemo(() => {
    const usable = downloads.find((record) => !missingFiles[wallpaperKey(record)])
    return usable ? localImageSrc(usable.path) : null
  }, [downloads, missingFiles])

  return (
    <div className="pt-5">
      <div className="flex items-baseline justify-between gap-4 py-4">
        <h1 className="text-2xl font-semibold">Collections</h1>
        {/* {hydrated && imported.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {imported.length} imported
          </span>
        )} */}

        <ImportField />

      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {/* Favorites is pinned first and cannot be removed: it is stored on this
            machine rather than fetched, and it is what the heart on every card
            writes to. Downloads below is the other local one — everything after
            them is an imported reference that needs the network.

            Favorites is still disabled offline, which looks inconsistent but is
            not: only the *list* is local. Each entry holds provider URLs for its
            thumbnail and full image, so with no connection the page would be a
            grid of broken images. Downloads is the one collection that holds
            actual files. */}
        <CollectionTile
          href={FAVORITES_HREF}
          label="Favorites"
          meta={
            !favoritesHydrated
              ? "On this device"
              : `On this device · ${favorites.length} ${favorites.length === 1 ? "wallpaper" : "wallpapers"
              }`
          }
          cover={favoritesCover}
          fallbackIcon={<Heart className="h-7 w-7" />}
          disabled={offline}
          disabledReason="Unavailable offline — these images are not saved to this device"
        />

        {/* Pinned second, and also not removable — it is a record of what is
            actually on the disk, not a list the user curates. Anything saved
            with the Download button lands here, and so does anything applied as
            a wallpaper, since that writes a file too.

            The only tile that stays live offline. */}
        <CollectionTile
          href={DOWNLOADS_HREF}
          label="Downloads"
          meta={
            !downloadsHydrated
              ? "Saved to this device"
              : `Saved to this device · ${downloads.length} ${downloads.length === 1 ? "file" : "files"
              }`
          }
          cover={downloadsCover}
          fallbackIcon={<HardDriveDownload className="h-7 w-7" />}
        />

        {imported.map((collection) => (
          <ImportedTile
            key={collectionKey(collection)}
            collection={collection}
            onRemove={() => void removeCollection(collectionKey(collection))}
            // An imported collection is only a reference — the wallpapers in it
            // are fetched on open, so there is nothing to show offline.
            disabled={offline}
          />
        ))}
        {hydrated && imported.length === 0 && (
          <CollectionTile
            href={""}
            label="No collections imported"
            meta={`Import a collection to see it here`}
            cover={null}
            fallbackIcon={null}
            className="cursor-default opacity-50"
          />
        )}
      </div>
    </div>
  )
}

function ImportedTile({
  collection,
  onRemove,
  disabled = false,
}: {
  collection: ImportedCollection
  onRemove: () => void
  disabled?: boolean
}) {
  const count =
    collection.count === null
      ? null
      : `${collection.count} ${collection.count === 1 ? "wallpaper" : "wallpapers"}`

  return (
    <CollectionTile
      href={collectionHref(collection)}
      label={collection.label}
      meta={[`@${collection.username}`, count].filter(Boolean).join(" · ")}
      cover={collection.cover}
      fallbackIcon={<Images className="h-7 w-7" />}
      onRemove={onRemove}
      disabled={disabled}
      disabledReason={`@${collection.username} · unavailable offline`}
    />
  )
}
