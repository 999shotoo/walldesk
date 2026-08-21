"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"

import { PEXELS_ENABLED } from "@/lib/api"
import { ANY, CATEGORIES, ORIENTATIONS, PALETTE, SORT_OPTIONS } from "@/lib/constant"
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed"
import { WallpaperFeedView } from "@/components/common/wallpaper_feed"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const DEFAULT_SORT = "date_added"

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
  const [sorting, setSorting] = useState(DEFAULT_SORT)
  const [orientation, setOrientation] = useState<string>(ANY)
  const [color, setColor] = useState<string>(ANY)

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
    // The sentinel is a UI concern; the API just wants the key absent.
    orientation: orientation === ANY ? "" : orientation,
    color: color === ANY ? "" : color,
  })

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      const next = input.trim()
      // `replace`, not `push`: refining a search should not stack history
      // entries the Back button has to walk through.
      router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search")
      setQuery(next)
    },
    [input, router]
  )

  const hasFilters =
    categories !== "111" || sorting !== DEFAULT_SORT || orientation !== ANY || color !== ANY

  const clearFilters = () => {
    setCategories("111")
    setSorting(DEFAULT_SORT)
    setOrientation(ANY)
    setColor(ANY)
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

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

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
