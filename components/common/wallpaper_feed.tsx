"use client"

import { ImageOff, TriangleAlert } from "lucide-react"

import type { WallpaperFeed } from "@/lib/use_wallpaper_feed"
import { useIsOffline } from "@/lib/offline"
import { Button } from "@/components/ui/button"
import { OfflineNotice } from "./offline"
import { WallpaperGrid } from "./wallpaper_grid"

/**
 * Renders a `useWallpaperFeed` — grid, skeletons, provider errors, the
 * infinite-scroll sentinel, and the end-of-feed marker. Shared so every browse
 * surface behaves identically.
 */
export function WallpaperFeedView({
  feed,
  emptyMessage = "Nothing matched.",
  emptyHint,
  offlineMessage = "Browsing needs a connection. Wallpapers you've already downloaded are still available.",
}: {
  feed: WallpaperFeed
  emptyMessage?: string
  emptyHint?: string
  /** What this particular surface cannot do offline. */
  offlineMessage?: string
}) {
  const { wallpapers, loading, initialLoading, hasMore, errors, sentinelRef } = feed
  const isEmpty = !loading && !initialLoading && wallpapers.length === 0
  const offline = useIsOffline()

  // Every browse surface routes through here, so this one branch is what puts the
  // whole catalogue behind the connection. Results already on screen go too: their
  // thumbnails are remote URLs, so scrolling an offline grid would only produce
  // broken images. `useWallpaperFeed` has already stopped requesting by this point.
  if (offline) {
    return <OfflineNotice message={offlineMessage} />
  }

  return (
    <>
      {errors.length > 0 && (
        <div className="border-destructive/40 text-muted-foreground mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <TriangleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-col gap-0.5">
            {/* A dead provider used to be a silent `console.error`, leaving a
                half-empty feed with no explanation. */}
            {errors.map((error) => (
              <span key={error.provider}>
                <span className="capitalize">{error.provider}</span> is
                unavailable ({error.message})
              </span>
            ))}
          </div>
        </div>
      )}

      <WallpaperGrid
        wallpapers={wallpapers}
        loading={loading || initialLoading}
        skeletonCount={initialLoading ? 12 : 6}
      />

      {isEmpty && (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-24 text-center">
          <ImageOff className="h-8 w-8" />
          <div>
            <p className="text-foreground font-medium">{emptyMessage}</p>
            {emptyHint && <p className="mt-1 text-sm">{emptyHint}</p>}
          </div>
          {errors.length > 0 && (
            <Button variant="outline" size="sm" onClick={feed.retry}>
              Try again
            </Button>
          )}
        </div>
      )}

      <div ref={sentinelRef} className="h-20 w-full" />

      {!hasMore && wallpapers.length > 0 && (
        <div className="text-muted-foreground py-6 text-center text-sm">
          You&apos;ve reached the end
        </div>
      )}
    </>
  )
}
