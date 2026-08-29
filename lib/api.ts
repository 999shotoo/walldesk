"use client"

import { fetch } from '@tauri-apps/plugin-http';

// Still needed while Pexels is disabled: `fetchWallpaperById` keeps using it so
// wallpapers already saved to favorites stay viewable.
// TODO(phase 5): this ships in the client bundle. Move to a user-supplied key
// stored via tauri-plugin-store, and treat this one as compromised.
const PEXELS_API_KEY = '9v33NRbeI7fMxBXA84i2OX4naXhDVPHv0JC7CEQMdIFYdfJ6tcYv4Wps';

export type Provider = 'wallhaven' | 'pexels';

/**
 * ── Provider switch ──────────────────────────────────────────────────────────
 *
 * Flip to `true` to bring Pexels back into the feed. Everything for it is still
 * here and still typechecked — `fetchPexelsPage`, the normalizer, the
 * orientation filter — so this is the only line that needs changing.
 *
 * Off by default because Wallhaven needs no account, while Pexels requires an
 * API key that cannot be kept secret in a distributed desktop app. Turning this
 * on means shipping a shared key that anyone can extract from the bundle.
 */
export const PEXELS_ENABLED: boolean = false;

/** Every provider the code knows how to talk to. */
export const PROVIDERS: readonly Provider[] = ['wallhaven', 'pexels'];

/** The providers actually queried, honouring the switch above. */
export const ACTIVE_PROVIDERS: readonly Provider[] = PEXELS_ENABLED
    ? PROVIDERS
    : PROVIDERS.filter((provider) => provider !== 'pexels');

const PROVIDER_NAMES: Record<Provider, string> = {
    wallhaven: 'Wallhaven',
    pexels: 'Pexels',
};

/**
 * Active providers as UI copy, derived rather than hardcoded so flipping the
 * switch does not leave the interface claiming to search a source it doesn't.
 */
export const PROVIDER_LABEL = ACTIVE_PROVIDERS.map(
    (provider) => PROVIDER_NAMES[provider]
).join(' + ');

export type FeedFilters = {
    query?: string;
    /** Wallhaven category triplet — general/anime/people, e.g. `"111"`. */
    categories?: string;
    /** Wallhaven `sorting` value. */
    sorting?: string;
    /**
     * Window for `sorting: 'toplist'` — one of `1d 3d 1w 1M 3M 6M 1y`.
     *
     * Wallhaven ignores it for every other sorting, and defaults it to `1M` when
     * omitted. Note that it filters by *upload date*, not by when the votes
     * arrived, so narrowing it also shrinks the corpus being ranked — see the
     * `POPULAR` / `TRENDING` presets in `lib/constant.ts`, which are the same
     * sorting at two windows.
     */
    topRange?: string;
    /** Pexels `orientation` value. */
    orientation?: string;
    /** Hex colour *without* the leading `#`, as both APIs expect. */
    color?: string;
    /**
     * ── Resolution ───────────────────────────────────────────────────────────
     *
     * Wallhaven-only; Pexels has no equivalent beyond `orientation`. Kept as the
     * three flat query params rather than one structured filter so that
     * `canonicalFilterKey` in `use_wallpaper_feed.ts` keeps working — it
     * interpolates each value into a string, which turns an object into
     * `[object Object]` and stops the feed noticing a change.
     *
     * Build them with `resolutionQuery()` from `lib/resolution.ts`, which owns
     * the rule that `atleast` and `resolutions` are mutually exclusive.
     */

    /** Minimum size as `WIDTHxHEIGHT`. Makes Wallhaven ignore `resolutions`. */
    atleast?: string;
    /** Comma-separated exact sizes, OR'd together. Ignored when `atleast` is set. */
    resolutions?: string;
    /** Comma-separated aspect ratios, or the keyword `landscape` / `portrait`. */
    ratios?: string;
};

/**
 * Per-provider page pointers. `null` means that provider is exhausted and must
 * not be requested again — the reason a single shared page number could not
 * work: Wallhaven and Pexels have different page sizes and run out at
 * different times.
 */
export type Cursors = Partial<Record<Provider, number | null>>;

export type ProviderError = { provider: Provider; message: string };

export type FeedPage = {
    wallpapers: CombinedWallpaper[];
    cursors: Cursors;
    hasMore: boolean;
    /** Non-fatal per-provider failures, for the UI to surface rather than swallow. */
    errors: ProviderError[];
};

/**
 * Where a feed's pages come from.
 *
 * `fetchWallpapers` is the default and satisfies this shape. A source exists so
 * that a surface paging through something other than search — a collection, say
 * — can reuse `useWallpaperFeed` wholesale rather than reimplementing its
 * infinite-scroll observer, cross-page dedupe and cancellation.
 */
export type FeedSource = (args: {
    filters: FeedFilters;
    cursors: Cursors;
    providers?: readonly Provider[];
    apiKey?: string;
}) => Promise<FeedPage>;

/** Matched to Wallhaven's fixed 24 so the interleave stays roughly even. */
const PEXELS_PER_PAGE = 24;

const normalizeWallhaven = (item: WallhavenItem): CombinedWallpaper => ({
    id: item.id,
    provider: 'wallhaven',
    title: item.category,
    thumbnail: item.thumbs.large,
    imageurl: item.path,
    width: item.dimension_x,
    height: item.dimension_y,
    colors: item.colors,
    type: "image",
});

const normalizePexels = (item: PexelsItem): CombinedWallpaper => ({
    id: item.id.toString(),
    provider: 'pexels',
    title: item.photographer,
    thumbnail: item.src.large,
    imageurl: item.src.original,
    width: item.width,
    height: item.height,
    colors: [item.avg_color],
    type: "image",
});

/** Stable identity across providers. Ids are only unique within a provider. */
export const feedKey = (wallpaper: { id: string; provider?: string }): string =>
    `${wallpaper.provider ?? 'unknown'}:${wallpaper.id}`;

type ProviderPage = {
    provider: Provider;
    items: CombinedWallpaper[];
    /** `null` once the provider has no further pages. */
    nextPage: number | null;
};

/**
 * Wallhaven auth, when the user has supplied a key in Settings.
 *
 * Sent as a header rather than the `?apikey=` query param the docs also accept,
 * so the key never lands in a URL that could end up in a log or an error
 * message. Anonymous requests are the norm — Wallhaven's public search works
 * without a key, so an absent one is not an error.
 */
const wallhavenHeaders = (apiKey?: string): Record<string, string> =>
    apiKey ? { 'X-API-Key': apiKey } : {};

/** Base for every v1 endpoint. */
const WALLHAVEN_API = 'https://wallhaven.cc/api/v1';

const fetchWallhavenPage = async (
    filters: FeedFilters,
    page: number,
    apiKey?: string
): Promise<ProviderPage> => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.query) params.set('q', filters.query);
    if (filters.categories) params.set('categories', filters.categories);
    if (filters.sorting) params.set('sorting', filters.sorting);
    // Only meaningful alongside `sorting=toplist`; harmless otherwise, but don't
    // send it unasked.
    if (filters.topRange && filters.sorting === 'toplist') {
        params.set('topRange', filters.topRange);
    }
    if (filters.color) params.set('colors', filters.color);
    // Resolution. Sent as given — `resolutionQuery()` has already resolved which
    // of `atleast`/`resolutions` applies, so sending both here would be a bug
    // upstream rather than something to paper over: Wallhaven silently drops
    // `resolutions` when `atleast` is present, and the user would see a filter
    // they set having no effect.
    if (filters.atleast) params.set('atleast', filters.atleast);
    if (filters.resolutions) params.set('resolutions', filters.resolutions);
    if (filters.ratios) params.set('ratios', filters.ratios);

    const response = await fetch(`${WALLHAVEN_API}/search?${params}`, {
        headers: wallhavenHeaders(apiKey),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json();
    const items: CombinedWallpaper[] = (body?.data ?? []).map(normalizeWallhaven);

    // Wallhaven reports its own pagination, so trust `meta` rather than guessing
    // from the item count.
    const current = body?.meta?.current_page ?? page;
    const last = body?.meta?.last_page ?? current;

    return {
        provider: 'wallhaven',
        items,
        nextPage: current < last ? current + 1 : null,
    };
};

const fetchPexelsPage = async (
    filters: FeedFilters,
    page: number
): Promise<ProviderPage> => {
    const params = new URLSearchParams({
        page: String(page),
        per_page: String(PEXELS_PER_PAGE),
    });

    // `/v1/search` requires a term. With no query the browse feed uses
    // `/v1/curated`, which is a better default than the old hardcoded
    // `query=wallpaper` — but it ignores orientation and colour.
    let endpoint: string;
    if (filters.query) {
        params.set('query', filters.query);
        if (filters.orientation) params.set('orientation', filters.orientation);
        if (filters.color) params.set('color', `#${filters.color}`);
        endpoint = 'search';
    } else {
        endpoint = 'curated';
    }

    const response = await fetch(`https://api.pexels.com/v1/${endpoint}?${params}`, {
        headers: { Authorization: PEXELS_API_KEY },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json();
    const items: CombinedWallpaper[] = (body?.photos ?? []).map(normalizePexels);

    return {
        provider: 'pexels',
        items,
        // Pexels tells us directly whether another page exists.
        nextPage: body?.next_page ? page + 1 : null,
    };
};

/**
 * Round-robin the providers' results together.
 *
 * Replaces the old `sort(() => Math.random() - 0.5)`, which was both a biased
 * shuffle and unstable — it reordered items on every call, so nothing kept a
 * consistent position between pages.
 */
const interleave = (groups: CombinedWallpaper[][]): CombinedWallpaper[] => {
    const out: CombinedWallpaper[] = [];
    const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);

    for (let i = 0; i < longest; i++) {
        for (const group of groups) {
            if (i < group.length) out.push(group[i]);
        }
    }

    return out;
};

/**
 * Fetch one combined page of wallpapers.
 *
 * Providers are requested concurrently — awaiting them in sequence made every
 * page cost the sum of both round trips instead of the slower of the two.
 */
export const fetchWallpapers = async ({
    filters = {},
    cursors = {},
    providers = ACTIVE_PROVIDERS,
    apiKey,
}: {
    filters?: FeedFilters;
    cursors?: Cursors;
    providers?: readonly Provider[];
    /** Wallhaven key from Settings, if the user has set one. */
    apiKey?: string;
} = {}): Promise<FeedPage> => {
    // Skip providers already known to be exhausted; `undefined` means "not
    // requested yet", which starts at page 1.
    const active = providers.filter((provider) => cursors[provider] !== null);

    const settled = await Promise.allSettled(
        active.map((provider) => {
            const page = cursors[provider] ?? 1;
            return provider === 'wallhaven'
                ? fetchWallhavenPage(filters, page, apiKey)
                : fetchPexelsPage(filters, page);
        })
    );

    const nextCursors: Cursors = { ...cursors };
    const errors: ProviderError[] = [];
    const groups: CombinedWallpaper[][] = [];

    settled.forEach((result, index) => {
        const provider = active[index];

        if (result.status === 'fulfilled') {
            groups.push(result.value.items);
            nextCursors[provider] = result.value.nextPage;
        } else {
            // A dead provider stops being polled but does not kill the feed.
            nextCursors[provider] = null;
            errors.push({
                provider,
                message:
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
            });
        }
    });

    // Dedupe within the page; the caller dedupes across pages via `feedKey`.
    const seen = new Set<string>();
    const wallpapers = interleave(groups).filter((wallpaper) => {
        const key = feedKey(wallpaper);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        wallpapers,
        cursors: nextCursors,
        // Authoritative, unlike the old `data.length < 10` guess against a
        // combined page of ~34 items — which never once fired.
        hasMore: providers.some((provider) => nextCursors[provider] != null),
        errors,
    };
};

/**
 * Look up a single wallpaper directly from its provider.
 *
 * The detail page is a separate route, so it cannot rely on the feed's
 * in-memory state: a refresh or a deep link arrives with nothing but the id and
 * provider from the URL. This is that fallback path.
 */
export const fetchWallpaperById = async (
    provider: string,
    id: string,
    apiKey?: string
): Promise<CombinedWallpaper | null> => {
    if (provider === 'wallhaven') {
        const response = await fetch(`${WALLHAVEN_API}/w/${id}`, {
            headers: wallhavenHeaders(apiKey),
        });
        if (!response.ok) {
            throw new Error(`Wallhaven returned HTTP ${response.status}`);
        }
        const body = await response.json();
        return body?.data ? normalizeWallhaven(body.data as WallhavenItem) : null;
    }

    if (provider === 'pexels') {
        // Deliberately not gated on `PEXELS_ENABLED`: a wallpaper favorited
        // while Pexels was on must still open afterwards. The switch controls
        // what the feed surfaces, not whether existing items can be resolved.
        const response = await fetch(`https://api.pexels.com/v1/photos/${id}`, {
            headers: { Authorization: PEXELS_API_KEY },
        });
        if (!response.ok) {
            throw new Error(`Pexels returned HTTP ${response.status}`);
        }
        const body = await response.json();
        return body?.id ? normalizePexels(body as PexelsItem) : null;
    }

    throw new Error(`Unknown provider "${provider}"`);
};

/**
 * ── Collections ──────────────────────────────────────────────────────────────
 *
 * A collection is somebody's curated list of wallpapers. The API is read-only,
 * so these are strictly for viewing: the user pastes a reference to a specific
 * collection, and the app pages through it. Nothing here discovers collections
 * on its own or asks who the user is.
 *
 * A key is not required — Wallhaven serves any *public* collection anonymously.
 * It is forwarded when present so that a user who has set one in Settings can
 * also open their own private collections.
 */

/** One collection as listed by `/collections/<username>`. */
export type WallhavenCollectionInfo = {
    id: number;
    label: string;
    /** Wallpapers in the collection, when the API reports it. */
    count: number | null;
};

export type CollectionPage = {
    items: CombinedWallpaper[];
    /** `null` once the collection has no further pages. */
    nextPage: number | null;
    /** Wallpapers across every page, as reported by `meta`. */
    total: number | null;
};

/**
 * Turn a status code into something worth showing a user.
 *
 * Worth the special-casing because 404 is by far the likeliest outcome of a
 * mistyped or non-public reference, and "HTTP 404" tells the user nothing about
 * what to do next. Wallhaven returns the same 404 for "no such collection" and
 * "that collection is private", so the message has to cover both.
 */
const collectionFailure = (status: number): Error => {
    if (status === 404) {
        return new Error(
            'Not found. The collection may be private, or the link may be wrong.'
        );
    }
    if (status === 401 || status === 403) {
        return new Error('Wallhaven rejected the API key set in Settings.');
    }
    if (status === 429) {
        return new Error('Wallhaven is rate-limiting requests. Wait a minute, then retry.');
    }
    return new Error(`Wallhaven returned HTTP ${status}.`);
};

/**
 * The collections belonging to `username` that this app is allowed to see.
 *
 * Only used to put a real name and count on an imported collection — the
 * contents come from `fetchCollectionPage`, which is the call that actually has
 * to succeed. Treat a failure here as cosmetic.
 */
export const fetchCollectionList = async (
    username: string,
    apiKey?: string
): Promise<WallhavenCollectionInfo[]> => {
    const response = await fetch(
        `${WALLHAVEN_API}/collections/${encodeURIComponent(username)}`,
        { headers: wallhavenHeaders(apiKey) }
    );
    if (!response.ok) throw collectionFailure(response.status);

    const body = await response.json();
    return ((body?.data ?? []) as WallhavenCollectionListEntry[]).map((entry) => ({
        id: entry.id,
        // A collection can be saved with a blank label; fall back to the id
        // rather than rendering an empty card title.
        label: entry.label?.trim() || `Collection ${entry.id}`,
        count: typeof entry.count === 'number' ? entry.count : null,
    }));
};

/** One page of a collection's contents. Wallhaven fixes the page size at 24. */
export const fetchCollectionPage = async (
    username: string,
    id: number,
    page = 1,
    apiKey?: string
): Promise<CollectionPage> => {
    const params = new URLSearchParams({ page: String(page) });
    const response = await fetch(
        `${WALLHAVEN_API}/collections/${encodeURIComponent(username)}/${id}?${params}`,
        { headers: wallhavenHeaders(apiKey) }
    );
    if (!response.ok) throw collectionFailure(response.status);

    const body = await response.json();
    const items: CombinedWallpaper[] = (body?.data ?? []).map(normalizeWallhaven);

    // Trust `meta` over the item count, same as search does.
    const current = body?.meta?.current_page ?? page;
    const last = body?.meta?.last_page ?? current;

    return {
        items,
        nextPage: current < last ? current + 1 : null,
        total: typeof body?.meta?.total === 'number' ? body.meta.total : null,
    };
};

/**
 * A `FeedSource` that walks one collection.
 *
 * Reuses the `wallhaven` cursor slot so the shape matches what
 * `useWallpaperFeed` already threads around; there is only ever one provider in
 * play here. Errors are left to propagate — the hook turns a throw into a
 * visible message and stops paging, which is the right behaviour when the single
 * source has failed.
 */
export const collectionFeedSource = (username: string, id: number): FeedSource =>
    async ({ cursors, apiKey }) => {
        const page = cursors.wallhaven ?? 1;
        const result = await fetchCollectionPage(username, id, page, apiKey);

        return {
            wallpapers: result.items,
            cursors: { wallhaven: result.nextPage },
            hasMore: result.nextPage !== null,
            errors: [],
        };
    };

export default fetchWallpapers;
