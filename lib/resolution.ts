/**
 * ── Resolution filtering ─────────────────────────────────────────────────────
 *
 * Wallhaven exposes two resolution parameters, and they are not variations on
 * one idea:
 *
 *   `atleast=1920x1080`             a floor — both axes must meet or beat it
 *   `resolutions=1920x1080,2560x…`  an exact whitelist, OR'd together
 *
 * Both are offered here because they answer different questions. "Big enough for
 * my screen" is a floor and keeps most of the catalogue; "exactly my panel, no
 * upscaling, no cropping" is a whitelist and throws away everything else. A
 * single control cannot mean both.
 *
 * They are also mutually exclusive at the API, not additive: measured against
 * the live API, `atleast=3840x2160&resolutions=1920x1080` returns exactly the
 * same 80,122 results as `atleast=3840x2160` alone — Wallhaven drops
 * `resolutions` whenever `atleast` is present. So `mode` picks one, rather than
 * the UI letting both be set and silently honouring one.
 */

/** A selectable resolution. `value` is the `WIDTHxHEIGHT` form both params want. */
export type Resolution = { value: string; width: number; height: number }

const res = (width: number, height: number): Resolution => ({
  value: `${width}x${height}`,
  width,
  height,
})

export type ResolutionGroup = {
  /** Column heading — an aspect ratio, or the shape it describes. */
  label: string
  /** What kind of screen this column is, for the title attribute. */
  hint: string
  items: readonly Resolution[]
}

/**
 * The picker's contents, in Wallhaven's own columns.
 *
 * Grouped by aspect ratio rather than listed by pixel count because that is how
 * the choice is actually made: you know the shape of your screen, and want the
 * sizes available in it. A flat list sorted by width interleaves five ratios and
 * makes "the 16:10 ones" something you have to hunt for.
 *
 * Deliberately the same set and the same grouping as the resolution picker on
 * wallhaven.cc, so a resolution seen there is findable here.
 */
export const RESOLUTION_GROUPS: readonly ResolutionGroup[] = [
  {
    label: "Ultrawide",
    hint: "21:9 and 32:9 monitors",
    items: [res(2560, 1080), res(3440, 1440), res(3840, 1600)],
  },
  {
    label: "16:9",
    hint: "Most desktop monitors and laptops",
    items: [
      res(1280, 720),
      res(1600, 900),
      res(1920, 1080),
      res(2560, 1440),
      res(3840, 2160),
    ],
  },
  {
    label: "16:10",
    hint: "MacBooks, Surface and many newer laptops",
    items: [
      res(1280, 800),
      res(1600, 1000),
      res(1920, 1200),
      res(2560, 1600),
      res(3840, 2400),
    ],
  },
  {
    label: "4:3",
    hint: "Older monitors and projectors",
    items: [
      res(1280, 960),
      res(1600, 1200),
      res(1920, 1440),
      res(2560, 1920),
      res(3840, 2880),
    ],
  },
  {
    label: "5:4",
    hint: "Older 17in and 19in monitors",
    items: [
      res(1280, 1024),
      res(1600, 1280),
      res(1920, 1536),
      res(2560, 2048),
      res(3840, 3072),
    ],
  },
]

/** Every listed resolution, flattened — for membership checks. */
export const ALL_RESOLUTIONS: readonly Resolution[] = RESOLUTION_GROUPS.flatMap(
  (group) => group.items
)

/**
 * The floor a wallpaper has to clear to be worth putting on a computer.
 *
 * 1080p rather than something higher because it is the smallest panel still
 * being sold, and an image at exactly the screen's size is the worst case that
 * still looks right — anything larger only downscales, which is free. Measured
 * against the live API this keeps 386,237 of 499,262 wallpapers, so the default
 * narrows the catalogue by a fifth rather than gutting it.
 */
export const DEFAULT_ATLEAST = "1920x1080"

/**
 * Exact resolutions for the mainstream desktop and laptop panels.
 *
 * Only reachable through the "Common PC sizes" shortcut in exact mode — the
 * default is a floor, not this list. Worth having as a preset because assembling
 * it by hand is six clicks across three columns, and because it is the answer to
 * "I only want wallpapers that fit my screen pixel for pixel" for all but a
 * handful of machines.
 */
export const PC_RESOLUTIONS: readonly string[] = [
  "1920x1080",
  "2560x1440",
  "3840x2160",
  "1920x1200",
  "2560x1600",
  "3440x1440",
]

/**
 * Which of the two API parameters is in play, or neither.
 *
 * `off` exists because "no resolution filter" has to be reachable. Wallhaven's
 * unfiltered corpus includes phone-shaped and thumbnail-sized uploads, so this
 * is not the default — but a user hunting for something specific must be able to
 * stop the app hiding results from them.
 */
export type ResolutionMode = "atleast" | "exact" | "off"

export const RESOLUTION_MODES: ReadonlyArray<{
  value: ResolutionMode
  label: string
  hint: string
}> = [
  {
    value: "atleast",
    label: "At least",
    hint: "Anything this size or larger. Bigger images just downscale.",
  },
  {
    value: "exact",
    label: "Exactly",
    hint: "Only these exact sizes — a pixel-for-pixel match, nothing else.",
  },
  { value: "off", label: "Any size", hint: "No resolution filter at all." },
]

export type ResolutionFilter = {
  mode: ResolutionMode
  /** The floor, as `WIDTHxHEIGHT`. Only sent in `atleast` mode. */
  atleast: string
  /** The whitelist. Only sent in `exact` mode. */
  exact: readonly string[]
  /**
   * Drop anything taller than it is wide.
   *
   * Not redundant with the floor, which is the trap here: `atleast` compares each
   * axis independently, so a 2160×3840 phone wallpaper clears a 1920×1080 floor
   * on both counts and lands in a feed meant for monitors. Measured, that is
   * 1,731 of 386,237 results — rare enough to be a surprise rather than a
   * pattern, which is exactly what makes it worth excluding.
   *
   * Never sent in `exact` mode: the whitelist already fixes the shape, and
   * `ratios=landscape` alongside a portrait custom resolution is a guaranteed
   * empty feed.
   */
  landscapeOnly: boolean
}

/**
 * What the app filters by until told otherwise — "fine for a PC or a laptop".
 *
 * A floor plus landscape, not the exact list: `atleast=1920x1080&ratios=landscape`
 * keeps 355,337 wallpapers where the six-entry exact list keeps 218,311, and the
 * ones it drops are 3440×1440s and 3840×2400s that are perfectly good on a 16:9
 * screen. A default should not quietly hide half the catalogue.
 *
 * `exact` is still populated so that switching mode reveals a usable list rather
 * than an empty grid.
 */
export const DEFAULT_RESOLUTION_FILTER: ResolutionFilter = {
  mode: "atleast",
  atleast: DEFAULT_ATLEAST,
  exact: PC_RESOLUTIONS,
  landscapeOnly: true,
}

/** Widest and tallest a custom entry may be. Wallhaven's own largest uploads sit around 15k. */
const MAX_DIMENSION = 20000

/**
 * Read `WIDTHxHEIGHT`, or `null` if the text is not one.
 *
 * Strict on purpose. Wallhaven answers a malformed `resolutions` value with
 * HTTP 200 and zero results rather than an error — `resolutions=abc` and
 * `resolutions=1x1` both come back empty — so a typo that reaches the API is
 * indistinguishable from a genuinely empty search. It has to be caught here.
 */
export function parseResolution(text: string): Resolution | null {
  const match = /^\s*(\d{1,5})\s*[x×*]\s*(\d{1,5})\s*$/i.exec(text)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 1 || height < 1) return null
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return null

  return res(width, height)
}

/** Both halves of a custom entry, as typed into two separate fields. */
export function parseDimensions(width: string, height: string): Resolution | null {
  return parseResolution(`${width.trim()}x${height.trim()}`)
}

/** `"2560x1440"` → `"2560 × 1440"`. The multiplication sign, not a letter x. */
export function formatResolution(value: string): string {
  const parsed = parseResolution(value)
  return parsed ? `${parsed.width} × ${parsed.height}` : value
}

/**
 * The ratios people actually name their screens by, widest first.
 *
 * Needed because the exact reduced ratio is not the useful answer: 3440×1440
 * reduces to 43:18 and 2560×1080 to 64:27, and nobody has ever called a monitor
 * either of those — both are sold as 21:9. A label that is arithmetically right
 * and unrecognisable is worse than no label.
 *
 * Widest first only for readability; see `RATIO_TOLERANCE` for why the order
 * carries no meaning.
 */
const COMMON_RATIOS: ReadonlyArray<{ label: string; ratio: number }> = [
  { label: "32:9", ratio: 32 / 9 },
  { label: "21:9", ratio: 21 / 9 },
  { label: "2:1", ratio: 2 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "16:10", ratio: 16 / 10 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "5:4", ratio: 5 / 4 },
  { label: "1:1", ratio: 1 },
]

/**
 * How far off a ratio may be and still take the common label.
 *
 * Set by the 21:9 family, which is a marketing bucket rather than a ratio: its
 * members run from 21:9 itself (2.333) through 64:27 (2.370, the 2560×1080) out
 * to 12:5 (2.400, the 3840×1600), and all three are sold as 21:9 ultrawides. 3%
 * is what it takes to cover that spread from the nominal 2.333.
 *
 * It stays unambiguous because the closest pair anywhere else in the table is
 * 6.7% apart — 5:4 to 4:3, and 16:10 to 3:2 — so no two 3% windows can overlap
 * and first-match is the same answer as nearest-match.
 */
const RATIO_TOLERANCE = 0.03

/**
 * Aspect ratio as a screen would be sold, e.g. `"3440x1440"` → `"21:9"`.
 *
 * For labelling a custom entry, which arrives without a column to sit under —
 * the grid's own resolutions are already grouped by ratio.
 *
 * Falls back to the exact reduced form for anything the table does not cover, so
 * an oddball size still gets a label rather than nothing.
 */
export function resolutionRatio(value: string): string | null {
  const parsed = parseResolution(value)
  if (!parsed) return null

  // Matched on the landscape orientation and flipped afterwards, so one table
  // covers both — a portrait 1440×3440 is still a 21:9 panel, turned sideways.
  const portrait = parsed.height > parsed.width
  const long = portrait ? parsed.height : parsed.width
  const short = portrait ? parsed.width : parsed.height

  const match = COMMON_RATIOS.find(
    (entry) => Math.abs(long / short / entry.ratio - 1) <= RATIO_TOLERANCE
  )
  if (match) {
    if (!portrait) return match.label
    const [a, b] = match.label.split(":")
    return `${b}:${a}`
  }

  const divisor = gcd(long, short)
  const reduced = `${long / divisor}:${short / divisor}`
  if (!portrait) return reduced
  const [a, b] = reduced.split(":")
  return `${b}:${a}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Sort a whitelist the way the picker reads it — by area, then width.
 *
 * Stored sorted so the chips on the search page keep a stable order no matter
 * what sequence they were clicked in. Without this, toggling one off and back on
 * moves it to the end of the row.
 */
export function sortResolutions(values: readonly string[]): string[] {
  return [...values].sort((a, b) => {
    const left = parseResolution(a)
    const right = parseResolution(b)
    if (!left || !right) return a.localeCompare(b)
    return (
      left.width * left.height - right.width * right.height ||
      left.width - right.width
    )
  })
}

/** The query parameters a filter turns into. A subset of `FeedFilters`. */
export type ResolutionQuery = {
  atleast?: string
  resolutions?: string
  ratios?: string
}

/**
 * Flatten a filter into the query parameters to send.
 *
 * Returns fields rather than setting them, so a caller spreads it into whatever
 * else it is filtering by: `useWallpaperFeed({ ...POPULAR, ...resolutionQuery(f) })`.
 *
 * An empty whitelist in `exact` mode sends nothing rather than
 * `resolutions=`, which Wallhaven reads as a malformed filter and answers with
 * an empty page.
 */
export function resolutionQuery(filter: ResolutionFilter): ResolutionQuery {
  const query: ResolutionQuery = {}

  if (filter.mode === "atleast" && parseResolution(filter.atleast)) {
    query.atleast = filter.atleast
  }

  if (filter.mode === "exact") {
    const values = sortResolutions(filter.exact.filter(parseResolution))
    if (values.length > 0) query.resolutions = values.join(",")
    // No `ratios` here — see the note on `landscapeOnly`.
    return query
  }

  if (filter.landscapeOnly) query.ratios = "landscape"

  return query
}

/** Whether two filters would send the same query. */
export function sameResolutionFilter(
  a: ResolutionFilter,
  b: ResolutionFilter
): boolean {
  return (
    a.mode === b.mode &&
    a.atleast === b.atleast &&
    a.landscapeOnly === b.landscapeOnly &&
    sameValues(a.exact, b.exact)
  )
}

/** Whether a filter differs from what the app ships with. */
export function isDefaultResolution(filter: ResolutionFilter): boolean {
  return sameResolutionFilter(filter, DEFAULT_RESOLUTION_FILTER)
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = sortResolutions(a)
  const right = sortResolutions(b)
  return left.every((value, index) => value === right[index])
}

/**
 * Short label for a collapsed control — the search page's filter button.
 *
 * `≥` rather than "or larger" because it has to fit in a row alongside four other
 * filters, and the distinction it is carrying is exactly the one a bare
 * "1920 × 1080" would lose: that is the *other* mode.
 *
 * An empty whitelist reads as "Any size" rather than "none selected" because that
 * is what actually gets sent — `resolutionQuery` omits the parameter entirely, so
 * the feed really is unfiltered. A label saying otherwise would be a lie about
 * the results on screen.
 */
export function summarizeResolution(filter: ResolutionFilter): string {
  const landscape = filter.landscapeOnly ? " · landscape" : ""

  if (filter.mode === "atleast") {
    return `≥ ${formatResolution(filter.atleast)}${landscape}`
  }

  if (filter.mode === "exact") {
    const count = filter.exact.filter(parseResolution).length
    if (count === 0) return "Any size"
    if (count === 1) return formatResolution(filter.exact[0])
    return `${count} sizes`
  }

  return `Any size${landscape}`
}

/**
 * Coerce whatever came back off disk into a usable filter.
 *
 * Stored settings are a JSON file the user can edit, and a shape read from disk
 * is untrusted input: a hand-edited `mode`, a `resolutions` array holding
 * numbers, or a half-written file are all reachable. Every field falls back
 * independently, so one bad value costs that field rather than the whole filter.
 */
export function coerceResolutionFilter(raw: unknown): ResolutionFilter {
  if (!raw || typeof raw !== "object") return DEFAULT_RESOLUTION_FILTER

  const value = raw as Partial<Record<keyof ResolutionFilter, unknown>>

  const mode = RESOLUTION_MODES.some((option) => option.value === value.mode)
    ? (value.mode as ResolutionMode)
    : DEFAULT_RESOLUTION_FILTER.mode

  const atleast =
    typeof value.atleast === "string" && parseResolution(value.atleast)
      ? value.atleast
      : DEFAULT_RESOLUTION_FILTER.atleast

  const exact = Array.isArray(value.exact)
    ? sortResolutions(
        // Deduped as well as filtered: a repeated entry in `resolutions=` is
        // harmless to Wallhaven but renders as two identical chips.
        [
          ...new Set(
            value.exact.filter(
              (entry): entry is string =>
                typeof entry === "string" && parseResolution(entry) !== null
            )
          ),
        ]
      )
    : [...DEFAULT_RESOLUTION_FILTER.exact]

  return {
    mode,
    atleast,
    exact,
    landscapeOnly:
      typeof value.landscapeOnly === "boolean"
        ? value.landscapeOnly
        : DEFAULT_RESOLUTION_FILTER.landscapeOnly,
  }
}
