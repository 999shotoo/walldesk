"use client"

import { useState } from "react"

import { PALETTE } from "@/lib/constant"
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed"
import { WallpaperFeedView } from "@/components/common/wallpaper_feed"
import { cn } from "@/lib/utils"

export default function ColorsPage() {
  const [color, setColor] = useState<string>(PALETTE[7].value)

  // Pexels' colour filter only works on `/v1/search`, which needs a term, so
  // this browses Wallhaven alone — it matches colours without one.
  const feed = useWallpaperFeed({ color }, { providers: ["wallhaven"] })

  return (
    <div className="pt-5">
      <h1 className="py-4 text-2xl font-semibold">Browse by colour</h1>

      <div className="flex flex-wrap gap-2">
        {PALETTE.map((option) => {
          const isActive = option.value === color
          return (
            <button
              key={option.value}
              onClick={() => setColor(option.value)}
              title={option.label}
              aria-label={option.label}
              aria-pressed={isActive}
              style={{ backgroundColor: `#${option.value}` }}
              className={cn(
                "h-9 w-9 rounded-lg transition-transform",
                "ring-border ring-1",
                isActive
                  ? "ring-primary scale-110 ring-2"
                  : "hover:scale-105"
              )}
            />
          )
        })}
      </div>

      <h2 className="text-muted-foreground py-4 text-sm">
        Showing wallpapers matching{" "}
        <span className="text-foreground font-medium">
          {PALETTE.find((option) => option.value === color)?.label}
        </span>
      </h2>

      <WallpaperFeedView
        feed={feed}
        emptyMessage="No wallpapers in this colour"
        emptyHint="Pick another swatch above."
      />
    </div>
  )
}
