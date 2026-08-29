/**
 * ── Layout switch ────────────────────────────────────────────────────────────
 *
 * Flip to `true` to go back to the masonry wall. The `react-masonry-css` path in
 * `wallpaper_grid.tsx` is still there and still typechecked, so this is the only
 * line that needs changing.
 *
 * Off by default because masonry buys nothing here: Wallhaven crops every
 * `large` thumbnail to exactly 432×243, so all cards are the same shape and the
 * columns come out level anyway — a masonry layout of equal-height items is just
 * a grid with worse reading order (masonry fills top-to-bottom per column, so
 * "next" is below rather than to the right).
 */
export const MASONRY_ENABLED: boolean = false

/**
 * Wallhaven's `large` thumbnails are always this size regardless of the source
 * image — a 1500×3256 portrait comes back as the same 16:9 crop.
 *
 * Worth stating explicitly because the cards used to hand `next/image` the
 * *full* image's dimensions for the *thumbnail*, which reserved a portrait box
 * for a landscape file and let `object-cover` crop the difference away.
 */
export const THUMBNAIL_WIDTH = 432
export const THUMBNAIL_HEIGHT = 243

/** Column counts for the masonry path above; unused while it is switched off. */
export  const breakpointColumnsObj = {
    default: 4,
    1300: 3,
    1100: 2,
    700: 2,
    500: 2,
  }

/**
 * Wallhaven's `categories` triplet — general / anime / people, one bit each.
 * Pexels has no equivalent, so these only narrow the Wallhaven half of a feed.
 */
export const CATEGORIES = [
  { value: "111", label: "All categories" },
  { value: "100", label: "General" },
  { value: "010", label: "Anime" },
  { value: "001", label: "People" },
] as const

/**
 * Wallhaven's popularity ranking, scored by favourites and views.
 *
 * Singled out because it is the only `sorting` that reads `topRange` — every
 * other value ignores the window entirely.
 */
export const TOP_SORT = "toplist"

/**
 * Wallhaven `sorting` values. `TOP_SORT` leads: it is what both the home feed and
 * a fresh search open on.
 */
export const SORT_OPTIONS = [
  { value: TOP_SORT, label: "Trending" },
  { value: "date_added", label: "Newest" },
  { value: "relevance", label: "Relevance" },
  { value: "views", label: "Most viewed" },
  { value: "favorites", label: "Most favorited" },
  { value: "random", label: "Random" },
] as const

/**
 * Windows for `TOP_SORT` — Wallhaven accepts exactly these seven.
 *
 * Phrased as "past N" rather than "this N" because the window is a rolling one
 * counted back from now, not the current calendar week or month.
 */
export const TOP_RANGES = [
  { value: "1d", label: "Past day" },
  { value: "3d", label: "Past 3 days" },
  { value: "1w", label: "Past week" },
  { value: "1M", label: "Past month" },
  { value: "3M", label: "Past 3 months" },
  { value: "6M", label: "Past 6 months" },
  { value: "1y", label: "Past year" },
] as const

/**
 * A ranking: a `sorting` value together with the window that gives it meaning.
 *
 * Structurally a `FeedFilters` subset, so these can be handed straight to
 * `useWallpaperFeed`. Both fields are required, unlike on `FeedFilters` — the
 * point of a named ranking is that it has already decided its window.
 */
export type Ranking = { sorting: string; topRange: string }

/**
 * Popular and trending are the *same* Wallhaven ranking at two different windows,
 * not two different sortings. A month of accumulated votes reads as popular; a
 * week of them reads as trending. That is the whole distinction.
 *
 * Neither is `sorting: 'favorites'`, which is the obvious candidate for "most
 * popular" and the wrong one: it ranks by all-time favourite count, so the list
 * barely moves from one month to the next and a landing page built on it shows the
 * same two dozen wallpapers forever.
 *
 * `TRENDING` is also why the search page exposes `TOP_RANGES`. `topRange` filters
 * by *upload date*, so intersecting a one-week window with a search term can leave
 * almost nothing — "porsche" over the past week is four wallpapers, against nearly
 * two thousand by relevance. The window has to be reachable, or the default looks
 * like a broken search.
 */
export const POPULAR: Ranking = { sorting: TOP_SORT, topRange: "1M" }
export const TRENDING: Ranking = { sorting: TOP_SORT, topRange: "1w" }

/**
 * Sentinel for "no filter". Select components treat empty/nullish values as
 * "nothing selected", which would blank the trigger label instead of reading
 * "Any …", so the absence of a filter needs a real value of its own.
 */
export const ANY = "any"

/** Pexels `orientation` values. */
export const ORIENTATIONS = [
  { value: ANY, label: "Any shape" },
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "square", label: "Square" },
] as const

/**
 * Wallhaven only matches against its own fixed palette, so the colour picker
 * offers exactly these rather than a free-form swatch. Stored without the
 * leading `#` — the form both APIs want.
 */
export const PALETTE = [
  { value: "660000", label: "Dark red" },
  { value: "cc0000", label: "Red" },
  { value: "cc3333", label: "Brick" },
  { value: "ea4c88", label: "Pink" },
  { value: "993399", label: "Purple" },
  { value: "663399", label: "Violet" },
  { value: "333399", label: "Indigo" },
  { value: "0066cc", label: "Blue" },
  { value: "0099cc", label: "Sky" },
  { value: "66cccc", label: "Teal" },
  { value: "77cc33", label: "Lime" },
  { value: "669900", label: "Green" },
  { value: "336600", label: "Forest" },
  { value: "999900", label: "Olive" },
  { value: "cccc33", label: "Citron" },
  { value: "ffff00", label: "Yellow" },
  { value: "ffcc33", label: "Gold" },
  { value: "ff9900", label: "Amber" },
  { value: "ff6600", label: "Orange" },
  { value: "cc6633", label: "Rust" },
  { value: "996633", label: "Brown" },
  { value: "663300", label: "Chocolate" },
  { value: "000000", label: "Black" },
  { value: "999999", label: "Grey" },
  { value: "cccccc", label: "Silver" },
  { value: "ffffff", label: "White" },
  { value: "424153", label: "Slate" },
] as const
