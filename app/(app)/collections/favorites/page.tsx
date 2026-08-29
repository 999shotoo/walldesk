"use client"

import { ArrowLeft, HeartOff } from "lucide-react"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"

import { useFavoriteList, useFavorites } from "@/lib/store"
import { useIsOffline } from "@/lib/offline"
import { OfflineNotice } from "@/components/common/offline"
import { WallpaperGrid } from "@/components/common/wallpaper_grid"

export default function FavoritesPage() {
  const favorites = useFavoriteList()
  const hydrated = useFavorites((state) => state.hydrated)
  const offline = useIsOffline()

  return (
    <div className="pt-5">
      {/* Favorites is one collection among several now, so it needs a way back
          up to the library — the sidebar only points at /collections. */}
      <Link
        href="/collections"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Collections
      </Link>

      <div className="flex items-baseline justify-between gap-4 py-4">
        <h1 className="text-2xl font-semibold">Favorites</h1>
        {hydrated && favorites.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {favorites.length} saved
          </span>
        )}
      </div>

      {/* Favorites are stored whole, so there is nothing to fetch — the only
          "loading" state is the one-off read from disk on boot.

          Offline is still a dead end, though, and for a reason worth stating: the
          list is local but the images are not. Every entry points at a provider
          URL, so this grid needs a connection even though nothing here is
          "loading" in the usual sense. Downloads is the collection that holds
          real files. */}
      {offline ? (
        <OfflineNotice
          message="Your favorites are saved on this device, but the images they point to are not — they load from the provider each time. Wallpapers you've downloaded are available offline."
        />
      ) : !hydrated ? (
        <WallpaperGrid wallpapers={[]} loading skeletonCount={8} />
      ) : favorites.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-24 text-center">
          <HeartOff className="h-8 w-8" />
          <div>
            <p className="text-foreground font-medium">No favorites yet</p>
            <p className="mt-1 text-sm">
              Tap the heart on any wallpaper to keep it here.
            </p>
          </div>
        </div>
      ) : (
        <WallpaperGrid wallpapers={favorites} />
      )}
    </div>
  )
}
