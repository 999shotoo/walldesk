/**
 * Checks `lib/collection_ref.ts` against every input shape the import field is
 * meant to accept, plus the ones it must reject.
 *
 * Run with `node scripts/check-collection-ref.js` — Node's type stripping reads
 * the TypeScript source directly, and the module is dependency-free, so this
 * needs no build step and no webview.
 */
const {
  parseCollectionRef,
  collectionKey,
  collectionUrl,
  collectionHref,
} = require("../lib/collection_ref.ts")

let bad = 0

function expect(label, actual, wanted) {
  const a = JSON.stringify(actual)
  const w = JSON.stringify(wanted)
  const ok = a === w
  if (!ok) bad++
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(58)} ${ok ? a : `${a}  wanted ${w}`}`)
}

const ARTIX = { username: "Artix", id: 2128477 }

console.log("— accepted —")
expect("shorthand", parseCollectionRef("Artix/2128477"), ARTIX)
expect(
  "site url",
  parseCollectionRef("https://wallhaven.cc/user/Artix/favorites/2128477"),  
  ARTIX
)
expect(
  "site url, no scheme",
  parseCollectionRef("wallhaven.cc/user/Artix/favorites/2128477"),
  ARTIX
)
expect(
  "site url, http",
  parseCollectionRef("http://wallhaven.cc/user/Artix/favorites/2128477"),
  ARTIX
)
expect(
  "bare path",
  parseCollectionRef("/user/Artix/favorites/2128477"),
  ARTIX
)
expect(
  "api url",
  parseCollectionRef("https://wallhaven.cc/api/v1/collections/Artix/2128477"),
  ARTIX
)
expect(
  "trailing slash",
  parseCollectionRef("https://wallhaven.cc/user/Artix/favorites/2128477/"),
  ARTIX
)
expect(
  "query string left on",
  parseCollectionRef("https://wallhaven.cc/user/Artix/favorites/2128477?page=3"),
  ARTIX
)
expect(
  "fragment left on",
  parseCollectionRef("https://wallhaven.cc/user/Artix/favorites/2128477#top"),
  ARTIX
)
expect("surrounding whitespace", parseCollectionRef("  Artix/2128477\n"), ARTIX)
expect("underscores and dashes", parseCollectionRef("some_user-name/12"), {
  username: "some_user-name",
  id: 12,
})
expect("dot in username", parseCollectionRef("a.b/12"), { username: "a.b", id: 12 })

console.log("\n— rejected —")
for (const input of [
  ["empty", ""],
  ["whitespace only", "   "],
  ["username only", "Artix"],
  ["id only", "2128477"],
  ["non-numeric id", "Artix/abc"],
  ["profile url, no collection", "https://wallhaven.cc/user/Artix"],
  ["wallpaper url", "https://wallhaven.cc/w/85rjej"],
  ["id zero", "Artix/0"],
  ["id too long", "Artix/1234567890123"],
  ["slash in username", "a/b/12"],
  ["space in username", "two words/12"],
  ["negative id", "Artix/-12"],
]) {
  expect(input[0], parseCollectionRef(input[1]), null)
}

console.log("\n— derived —")
expect("key lowercases the username", collectionKey(ARTIX), "artix/2128477")
expect(
  "key is case-insensitive on username",
  collectionKey({ username: "ARTIX", id: 2128477 }),
  collectionKey({ username: "artix", id: 2128477 })
)
expect(
  "site url round-trips",
  parseCollectionRef(collectionUrl(ARTIX)),
  ARTIX
)
expect("in-app href", collectionHref(ARTIX), "/collections/view?u=Artix&id=2128477")

// A username needing escaping must not break out of its path segment.
const odd = { username: "a b&c", id: 7 }
expect("odd username is escaped in the url", collectionUrl(odd), "https://wallhaven.cc/user/a%20b%26c/favorites/7")

console.log(bad ? `\n${bad} failing` : "\nAll cases pass")
process.exit(bad ? 1 : 0)
