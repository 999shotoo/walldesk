"use client"

import { HeartOff } from "lucide-react"

import { useFavoriteList, useFavorites } from "@/lib/store"
import { WallpaperGrid } from "@/components/common/wallpaper_grid"

export default function FavoritesPage() {
  const favorites = useFavoriteList()
  const hydrated = useFavorites((state) => state.hydrated)
  const error = useFavorites((state) => state.error)

  return (
    <div className="pt-5">
      <div className="flex items-baseline justify-between gap-4 py-4">
        <h1 className="text-2xl font-semibold">Favorites</h1>
        {hydrated && favorites.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {favorites.length} saved
          </span>
        )}
      </div>

      {error && (
        <p className="text-destructive mb-4 text-sm">
          Favorites could not be read from disk: {error}
        </p>
      )}

      {/* Favorites are stored whole, so there is nothing to fetch — the only
          "loading" state is the one-off read from disk on boot. */}
      {!hydrated ? (
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
