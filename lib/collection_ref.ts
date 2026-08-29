/**
 * Parsing a Wallhaven collection reference out of whatever the user pasted.
 *
 * Deliberately dependency-free so it can be exercised by
 * `scripts/check-collection-ref.js` without a webview.
 */

/** Points at one collection: the owner's username plus the collection id. */
export type CollectionRef = {
  username: string
  id: number
}

/**
 * Characters allowed in the username segment.
 *
 * Kept permissive on purpose — this is a sanity filter, not an attempt to
 * mirror Wallhaven's sign-up rules. What matters is that it excludes `/`,
 * whitespace and `?`, so a mangled paste can't smuggle extra path segments or
 * query parameters into the request URL. The username is still run through
 * `encodeURIComponent` before it goes on the wire.
 */
const USERNAME = String.raw`[A-Za-z0-9_.-]+`

/**
 * Bounded rather than `\d+`: an absurdly long run of digits would parse to an
 * imprecise float and then get sent to the API as something the user never
 * typed. No real collection id comes close to twelve digits.
 */
const ID = String.raw`\d{1,12}`

const PATTERNS: readonly RegExp[] = [
  // The address bar: https://wallhaven.cc/user/@username/favorites/:collection_id
  //
  // Every collection lives under `/favorites/` on the site regardless of what
  // it is actually called — that path segment is not the name of the
  // collection, and has nothing to do with this app's own local Favorites.
  new RegExp(String.raw`(?:^|/)user/(${USERNAME})/favorites/(${ID})`),
  // The API URL, in case that is what the user has to hand:
  // https://wallhaven.cc/user/@username/favorites/:collection_id
  new RegExp(String.raw`(?:^|/)collections/(${USERNAME})/(${ID})`),
  // Shorthand, typed by hand: @username/:collection_id
  new RegExp(String.raw`^(${USERNAME})/(${ID})$`),
]

/**
 * Read a collection reference out of a pasted URL or a `username/id` shorthand.
 *
 * Returns `null` for anything unrecognisable, so the caller can tell the
 * difference between "this isn't a collection link" and "the API refused it" —
 * two failures that need very different messages.
 */
export function parseCollectionRef(input: string): CollectionRef | null {
  // Trailing slashes, a `?page=2` left on the end, or a fragment would all
  // defeat the anchored shorthand pattern, and the URL patterns have no use for
  // them either.
  const cleaned = input.trim().split(/[?#]/)[0].replace(/\/+$/, "")
  if (!cleaned) return null

  for (const pattern of PATTERNS) {
    const match = pattern.exec(cleaned)
    if (!match) continue

    const id = Number(match[2])
    // `\d{1,12}` cannot produce a non-integer, but it can produce 0, and
    // Wallhaven ids start at 1.
    if (!Number.isSafeInteger(id) || id <= 0) return null

    return { username: match[1], id }
  }

  return null
}

/**
 * Stable key for an imported collection.
 *
 * The username is lowercased so pasting the same collection with the owner's
 * name cased differently updates the existing entry instead of adding a
 * duplicate. The original casing is kept on the record itself, since that is
 * what gets displayed and requested.
 */
export function collectionKey(ref: CollectionRef): string {
  return `${ref.username.toLowerCase()}/${ref.id}`
}

/** The collection's page on wallhaven.cc, for "view on Wallhaven" links. */
export function collectionUrl(ref: CollectionRef): string {
  return `https://wallhaven.cc/user/${encodeURIComponent(ref.username)}/favorites/${ref.id}`
}

/**
 * Link to a collection's contents inside the app.
 *
 * A query string rather than `/collections/<user>/<id>` for the same reason as
 * `wallpaperHref`: this is a static export, so a dynamic path segment would
 * need every username and id enumerated at build time — and these arrive from
 * whatever the user pastes at runtime.
 */
export function collectionHref(ref: CollectionRef): string {
  const params = new URLSearchParams({ u: ref.username, id: String(ref.id) })
  return `/collections/view?${params.toString()}`
}
