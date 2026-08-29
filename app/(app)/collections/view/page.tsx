"use client"

import { Suspense, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"
import { ArrowLeft, TriangleAlert } from "lucide-react"

import { collectionFeedSource } from "@/lib/api"
import { collectionKey, parseCollectionRef } from "@/lib/collection_ref"
import { useCollections, useImportedCollection } from "@/lib/collections"
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed"
import { WallpaperFeedView } from "@/components/common/wallpaper_feed"
import { Skeleton } from "@/components/ui/skeleton"

function BackToCollections() {
  return (
    <Link
      href="/collections"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Collections
    </Link>
  )
}

function CollectionView() {
  const params = useSearchParams()

  // Recomposed into the shorthand and run through the same parser the import
  // field uses, rather than trusting the query string. This page is reachable by
  // hand-edited URL, and the parser is what guarantees a username can't carry
  // extra path segments into the request.
  const ref = useMemo(
    () => parseCollectionRef(`${params.get("u") ?? ""}/${params.get("id") ?? ""}`),
    [params]
  )

  const stored = useImportedCollection(ref)

  // Needed for `stored` to resolve to the real label rather than the fallback;
  // `AppBoot` also does this, and `hydrate` returns early once done.
  useEffect(() => {
    void useCollections.getState().hydrate()
  }, [])

  // Built here rather than inline so the identity is stable across renders. The
  // feed keys its resets off `sourceKey`, not this reference, but rebuilding the
  // closure on every render for no reason is still waste.
  const source = useMemo(
    () => (ref ? collectionFeedSource(ref.username, ref.id) : undefined),
    [ref]
  )

  // Unconditional, as hooks must be — a missing or malformed reference is
  // handled by `enabled`, not by skipping the call.
  const feed = useWallpaperFeed(
    {},
    {
      source,
      sourceKey: ref ? collectionKey(ref) : "",
      enabled: ref !== null,
    }
  )

  if (!ref) {
    return (
      <div className="pt-5">
        <BackToCollections />
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <TriangleAlert className="text-muted-foreground h-8 w-8" />
          <div>
            <p className="font-medium">No collection was specified</p>
            <p className="text-muted-foreground mt-1 text-sm">
              This link is missing a username and collection id.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const label = stored?.label ?? `Collection ${ref.id}`

  /**
   * Wallpapers in the collection.
   *
   * Once the feed has run to the end its own count is authoritative. Before
   * that, fall back to the total captured at import time — a snapshot that can
   * be stale if the owner has since changed the collection, which is why the
   * feed's number wins as soon as there is one.
   */
  const total =
    !feed.hasMore && feed.wallpapers.length > 0
      ? feed.wallpapers.length
      : (stored?.count ?? null)

  return (
    <div className="pt-5">
      <BackToCollections />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
        <h1 className="text-2xl font-semibold">{label}</h1>
        <span className="text-muted-foreground text-sm">
          @{ref.username}
          {total !== null &&
            ` · ${total} ${total === 1 ? "wallpaper" : "wallpapers"}`}
        </span>
      </div>

      <WallpaperFeedView
        feed={feed}
        emptyMessage="This collection is empty"
        emptyHint="The owner may have removed everything from it, or made it private."
      />
    </div>
  )
}

export default function CollectionViewPage() {
  // `useSearchParams` must sit inside a Suspense boundary for static export.
  return (
    <Suspense
      fallback={
        <div className="pt-5">
          <Skeleton className="h-8 w-48" />
        </div>
      }
    >
      <CollectionView />
    </Suspense>
  )
}
