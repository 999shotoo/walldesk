"use client"

import Masonry from "react-masonry-css"

import { MASONRY_ENABLED, breakpointColumnsObj } from "@/lib/constant"
import { wallpaperKey } from "@/lib/store"
import { Skeleton } from "@/components/ui/skeleton"
import { WallpaperCard } from "./wall_card"

/**
 * Number of leading cards loaded eagerly. Everything past the first screenful
 * stays lazy: marking the whole page eager fired ~34 image requests at once and
 * starved the ones actually on screen.
 */
const DEFAULT_EAGER_COUNT = 8

/**
 * Matches the old masonry breakpoints: 2 columns below 1024, 3 up to 1280, 4
 * beyond. `gap-4` replaces the per-card bottom margin masonry needed, which is
 * why the card itself no longer carries one.
 */
const GRID_COLUMNS = "grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"

export function WallpaperGrid({
  wallpapers,
  loading = false,
  skeletonCount = 12,
  eagerCount = DEFAULT_EAGER_COUNT,
}: {
  wallpapers: CombinedWallpaper[]
  loading?: boolean
  skeletonCount?: number
  eagerCount?: number
}) {
  const cards = wallpapers.map((wallpaper, index) => (
    // Keyed by provider+id: ids are only unique within a provider.
    <WallpaperCard
      key={wallpaperKey(wallpaper)}
      {...wallpaper}
      eager={index < eagerCount}
    />
  ))

  // Every thumbnail is the same 16:9 crop, so one shared placeholder shape is
  // honest about what is coming — the old varied heights implied a masonry wall
  // the real images never formed.
  const skeletons = loading
    ? Array.from({ length: skeletonCount }).map((_, index) => (
        <Skeleton
          key={`skeleton-${index}`}
          className="aspect-video w-full rounded-lg"
        />
      ))
    : []

  if (MASONRY_ENABLED) {
    return (
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="flex w-auto -ml-4"
        columnClassName="pl-4 bg-clip-padding"
      >
        {[...cards, ...skeletons].map((child, index) => (
          // Masonry lays out plain children, so the vertical gap has to come
          // from a wrapper rather than the grid's `gap`.
          <div key={child.key ?? index} className="mb-4">
            {child}
          </div>
        ))}
      </Masonry>
    )
  }

  return (
    <div className={GRID_COLUMNS}>
      {cards}
      {skeletons}
    </div>
  )
}
