"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Monitor, Plus, Search, X } from "lucide-react"

import { PEXELS_ENABLED } from "@/lib/api"
import {
  ANY,
  CATEGORIES,
  ORIENTATIONS,
  PALETTE,
  SORT_OPTIONS,
  TOP_RANGES,
  TOP_SORT,
} from "@/lib/constant"
import {
  formatResolution,
  resolutionQuery,
  sameResolutionFilter,
  sortResolutions,
  summarizeResolution,
  type ResolutionFilter,
} from "@/lib/resolution"
import { useSettings } from "@/lib/settings"
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed"
import { useIsOffline } from "@/lib/offline"
import { OfflineNotice } from "@/components/common/offline"
import { ResolutionPicker } from "@/components/common/resolution_picker"
import { WallpaperFeedView } from "@/components/common/wallpaper_feed"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

// A fresh search opens on Trending rather than Relevance, so the page shows
// what's popular this week by default. Users can optionally switch to
// "Relevance" to see all matches without a time window.
const DEFAULT_SORT = "toplist"
const DEFAULT_RANGE = "1y"

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function SearchView() {
  const router = useRouter()
  const params = useSearchParams()
  const urlQuery = params.get("q") ?? ""

  const [input, setInput] = useState(urlQuery)
  const [query, setQuery] = useState(urlQuery)
  const [categories, setCategories] = useState("111")
  const [sorting, setSorting] = useState<string>(DEFAULT_SORT)
  const [topRange, setTopRange] = useState<string>(DEFAULT_RANGE)
  const [orientation, setOrientation] = useState<string>(ANY)
  const [color, setColor] = useState<string>(ANY)
  const offline = useIsOffline()

  /**
   * The resolution filter saved in Settings, and this search's override of it.
   *
   * `null` means "whatever Settings says", which is why the override is a
   * nullable copy rather than state seeded from the stored value. Seeding would
   * capture the pre-hydration default and need an effect to catch up once the
   * disk read landed — and that effect lands a render *after* the feed unblocks,
   * so the first page would be fetched with the wrong filter and immediately
   * refetched with the right one. Deriving has no such window.
   */
  const storedResolution = useSettings((state) => state.resolution)
  const [resolutionOverride, setResolutionOverride] =
    useState<ResolutionFilter | null>(null)
  const resolution = resolutionOverride ?? storedResolution

  // Arriving from the home search card (or the back button) carries the term in
  // the URL, so the URL stays the source of truth for the query.
  useEffect(() => {
    setInput(urlQuery)
    setQuery(urlQuery)
  }, [urlQuery])

  const feed = useWallpaperFeed({
    query,
    categories,
    sorting,
    // Sent unconditionally: `fetchWallhavenPage` drops it for every sorting but
    // `TOP_SORT`, so there is nothing to gate on here.
    topRange,
    // The sentinel is a UI concern; the API just wants the key absent.
    orientation: orientation === ANY ? "" : orientation,
    color: color === ANY ? "" : color,
    ...resolutionQuery(resolution),
  })

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      const next = input.trim()
      // `replace`, not `push`: refining a search should not stack history
      // entries the Back button has to walk through.
      //
      // And deliberately next/navigation's router rather than
      // `useTransitionRouter` — this only syncs the query string on the page
      // you are already on, so routing it through the page transition would
      // cross-fade the whole feed out and back in on every search.
      router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search")
      setQuery(next)
    },
    [input, router]
  )

  const hasFilters =
    categories !== "111" ||
    sorting !== DEFAULT_SORT ||
    // Only counts while the window is actually in play — and while its control is
    // on screen for the Clear button to visibly undo.
    (sorting === (TOP_SORT as string) && topRange !== DEFAULT_RANGE) ||
    orientation !== ANY ||
    color !== ANY ||
    // Compared against what Settings holds, not against the app's default: this
    // page starting from your saved preference is not a filter you applied, and
    // offering to clear it would read as the app disagreeing with itself.
    !sameResolutionFilter(resolution, storedResolution)

  const clearFilters = () => {
    setCategories("111")
    setSorting(DEFAULT_SORT)
    setTopRange(DEFAULT_RANGE)
    setOrientation(ANY)
    setColor(ANY)
    // Back to following Settings, rather than to the app default — same reason.
    setResolutionOverride(null)
  }

  /** Drop one size from the whitelist, from the chip row below the filters. */
  const removeSize = (value: string) =>
    setResolutionOverride({
      ...resolution,
      exact: resolution.exact.filter((entry) => entry !== value),
    })

  // The whole form goes, not just the results. A search box that accepts a term,
  // submits, and changes nothing is worse than no search box — and every filter
  // above only narrows a request that cannot be sent.
  if (offline) {
    return (
      <div className="pt-5">
        <h1 className="py-4 text-2xl font-semibold">Search</h1>
        <OfflineNotice message="Searching needs a connection. Wallpapers you've downloaded are still available on this device." />
      </div>
    )
  }

  return (
    <div className="pt-5">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search wallpapers…"
            className="pl-9"
            autoFocus
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={categories} onValueChange={(value) => setCategories(value as string)}>
          <SelectTrigger size="sm" className="w-[150px]">
            <span>{labelFor(CATEGORIES, categories)}</span>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sorting} onValueChange={(value) => setSorting(value as string)}>
          <SelectTrigger size="sm" className="w-[150px]">
            <span>{labelFor(SORT_OPTIONS, sorting)}</span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sits immediately after the sort it belongs to, and only while that sort
            is selected — every other `sorting` ignores `topRange`, so leaving the
            control up would imply it does something.

            It exists because `topRange` filters by upload date: "Trending" plus a
            specific term can legitimately match four wallpapers, and without a
            reachable window that reads as a broken search rather than a narrow
            one. */}
        {sorting === TOP_SORT && (
          <Select value={topRange} onValueChange={(value) => setTopRange(value as string)}>
            <SelectTrigger size="sm" className="w-[150px]">
              <span>{labelFor(TOP_RANGES, topRange)}</span>
            </SelectTrigger>
            <SelectContent>
              {TOP_RANGES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Orientation is a Pexels-only parameter — Wallhaven has no equivalent,
            so the control would do nothing while Pexels is switched off. */}
        {PEXELS_ENABLED && (
          <Select
            value={orientation}
            onValueChange={(value) => setOrientation(value as string)}
          >
            <SelectTrigger size="sm" className="w-[140px]">
              <span>{labelFor(ORIENTATIONS, orientation)}</span>
            </SelectTrigger>
            <SelectContent>
              {ORIENTATIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={color} onValueChange={(value) => setColor(value as string)}>
          <SelectTrigger size="sm" className="w-[140px]">
            <span className="flex items-center gap-2">
              {color !== ANY && (
                <span
                  className="ring-border h-3 w-3 rounded-full ring-1"
                  style={{ backgroundColor: `#${color}` }}
                />
              )}
              {color === ANY ? "Any colour" : labelFor(PALETTE, color)}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any colour</SelectItem>
            {PALETTE.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  <span
                    className="ring-border h-3 w-3 rounded-full ring-1"
                    style={{ backgroundColor: `#${option.value}` }}
                  />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Resolution. A popover rather than another Select because the choice is
            a five-column grid plus a custom size, and none of that fits in a list
            of options. The trigger carries the current filter so the row still
            reads at a glance. */}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" className="font-normal">
                <Monitor className="h-4 w-4" />
                {summarizeResolution(resolution)}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="w-[min(560px,calc(100vw-2rem))] p-4"
          >
            <ResolutionPicker
              value={resolution}
              onChange={setResolutionOverride}
            />
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Selected sizes, on the page rather than only inside the popover — the
          point of exact mode is that you are curating a list, and a list you have
          to reopen a panel to see is one you lose track of. Only in exact mode:
          a floor is a single number, already spelled out on the trigger. */}
      {resolution.mode === "exact" && resolution.exact.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Sizes:</span>
          {sortResolutions(resolution.exact).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => removeSize(value)}
              title={`Remove ${formatResolution(value)}`}
              className="bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-foreground ring-border flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs tabular-nums ring-1 transition-colors"
            >
              {formatResolution(value)}
              <X className="h-3 w-3" />
            </button>
          ))}
          {/* A second way into the same popover, next to what it edits. Opening
              the picker from the trigger above works too; this is just closer to
              hand once you are already looking at the list. */}
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="sm" className="h-[26px] px-2">
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className="w-[min(560px,calc(100vw-2rem))] p-4"
            >
              <ResolutionPicker
                value={resolution}
                onChange={setResolutionOverride}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <h1 className="py-4 text-2xl font-semibold">
        {query ? `Results for “${query}”` : "Browse"}
      </h1>

      <WallpaperFeedView
        feed={feed}
        emptyMessage={query ? `Nothing found for “${query}”` : "Nothing to show"}
        emptyHint="Try a broader term, or loosen the filters."
      />
    </div>
  )
}

export default function SearchPage() {
  // `useSearchParams` must sit inside a Suspense boundary for static export.
  return (
    <Suspense
      fallback={
        <div className="space-y-3 pt-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      }
    >
      <SearchView />
    </Suspense>
  )
}
