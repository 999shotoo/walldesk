interface PexelsItem {
    id: number;
    photographer: string;
    width: number;
    height: number;
    avg_color: string;
    src: {
        original: string;
        large: string;
        medium: string;
        small: string;
        portrait: string;
        landscape: string;
    };
}

interface WallhavenItem {
    id: string;
    path: string;
    dimension_x: number;
    dimension_y: number;
    colors: string[];
    thumbs: {
        original: string;
        large: string;
        small: string;
    };
    category: string;
}

/**
 * One entry from `/collections/<username>` — collection metadata only, no
 * wallpapers. `count` is absent on some responses, hence optional.
 */
interface WallhavenCollectionListEntry {
    id: number;
    label?: string;
    views?: number;
    public?: number;
    count?: number;
}


interface CombinedWallpaper {
    id: string;
    provider: string;
    title: string;
    thumbnail: string;
    imageurl: string;
    width?: number;
    height?: number;
    colors: string[];
    type?: string;
}
