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

/** Wallhaven `sorting` values. */
export const SORT_OPTIONS = [
  { value: "date_added", label: "Newest" },
  { value: "relevance", label: "Relevance" },
  { value: "views", label: "Most viewed" },
  { value: "favorites", label: "Most favorited" },
  { value: "toplist", label: "Top list" },
  { value: "random", label: "Random" },
] as const

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
