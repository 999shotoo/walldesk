"use client"

import { useEffect } from "react"
import { ArrowLeft, HardDriveDownload } from "lucide-react"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"

import { useDownloadList, useDownloads } from "@/lib/downloads"
import { DownloadCard } from "@/components/common/download_card"
import { GRID_COLUMNS } from "@/components/common/wallpaper_grid"
import { Skeleton } from "@/components/ui/skeleton"

/** Matches `DEFAULT_EAGER_COUNT` in the feed grid: roughly one screenful. */
const EAGER_COUNT = 8

export default function DownloadsPage() {
  const downloads = useDownloadList()
  const hydrated = useDownloads((state) => state.hydrated)
  const missingCount = useDownloads(
    (state) => Object.keys(state.missing).length
  )

  // Same reason as on the collections index: correct even if this page renders
  // outside `AppBoot`. `hydrate` returns early once done.
  useEffect(() => {
    void useDownloads.getState().hydrate()
    // And a fresh sweep on every visit, because `hydrate` only checks the disk
    // the first time. Files get deleted while the app is open — in a file manager,
    // by a cleanup tool, by an external drive being unplugged — and arriving on
    // this page is the natural moment to find out.
    void useDownloads.getState().checkFiles()
  }, [])

  return (
    <div className="pt-5">
      <Link
        href="/collections"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Collections
      </Link>

      <div className="flex items-baseline justify-between gap-4 py-4">
        <h1 className="text-2xl font-semibold">Downloads</h1>
        {hydrated && downloads.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {downloads.length} {downloads.length === 1 ? "file" : "files"}
          </span>
        )}
      </div>

      {/* One line for the whole list rather than hunting for the badged cards.
          Only ever shown for confirmed absences — see the note on `missing`.

          In-page rather than a toast, unlike the app's other messages: this is a
          standing fact about the list on screen, not something that just
          happened, and it is still true the next time the page is opened. */}
      {hydrated && missingCount > 0 && (
        <p className="text-muted-foreground mb-4 text-sm">
          {missingCount === 1
            ? "1 file is missing from disk. Open it to download it again."
            : `${missingCount} files are missing from disk. Open one to download it again.`}
        </p>
      )}

      {/* Nothing is fetched here — every record is already on disk, so the only
          "loading" state is the one-off read of the ledger on boot. */}
      {!hydrated ? (
        <div className={GRID_COLUMNS}>
          {Array.from({ length: EAGER_COUNT }).map((_, index) => (
            <Skeleton
              key={`skeleton-${index}`}
              className="aspect-video w-full rounded-lg"
            />
          ))}
        </div>
      ) : downloads.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-24 text-center">
          <HardDriveDownload className="h-8 w-8" />
          <div>
            <p className="text-foreground font-medium">Nothing downloaded yet</p>
            <p className="mt-1 text-sm">
              Wallpapers you download — or set as your wallpaper — are saved to this
              device and listed here.
            </p>
          </div>
        </div>
      ) : (
        <div className={GRID_COLUMNS}>
          {downloads.map((record, index) => (
            <DownloadCard
              // Keyed by path rather than provider+id: the path is what this card
              // actually renders, so a re-download to a new location remounts it.
              key={record.path}
              record={record}
              eager={index < EAGER_COUNT}
            />
          ))}
        </div>
      )}
    </div>
  )
}
