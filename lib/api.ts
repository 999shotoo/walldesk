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
    /** Pexels `orientation` value. */
    orientation?: string;
    /** Hex colour *without* the leading `#`, as both APIs expect. */
    color?: string;
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

const fetchWallhavenPage = async (
    filters: FeedFilters,
    page: number,
    apiKey?: string
): Promise<ProviderPage> => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.query) params.set('q', filters.query);
    if (filters.categories) params.set('categories', filters.categories);
    if (filters.sorting) params.set('sorting', filters.sorting);
    if (filters.color) params.set('colors', filters.color);

    const response = await fetch(`https://wallhaven.cc/api/v1/search?${params}`, {
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
        const response = await fetch(`https://wallhaven.cc/api/v1/w/${id}`, {
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

export default fetchWallpapers;
