"use client"

import Image from "next/image";
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Check, Download, Heart, Loader2, Monitor } from "lucide-react";

import { cn } from "@/lib/utils";
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "@/lib/constant";
import { Button } from "@/components/ui/button";
import { useFavorites, useIsFavorite } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import { applyWallpaper, parentDir, saveWallpaperCopy } from "@/lib/downloads";
import { toastError, toastSuccess } from "@/lib/toast";
import { FIT_MODE_LABELS, wallpaperHref } from "@/lib/wallpaper";

interface WallpaperCardProps {
  id: string;
  title: string;
  imageurl: string;
  thumbnail: string;
  provider?: string;
  height?: number;
  width?: number;
  colors?: string[];
  type?: string;
  eager?: boolean;
}

type CardAction = "download" | "set";

export const WallpaperCard = memo(function WallpaperCard({
  id,
  title,
  imageurl,
  thumbnail,
  provider,
  height,
  width,
  colors,
  type,
  eager = false,
}: WallpaperCardProps) {
  const [busy, setBusy] = useState<CardAction | null>(null);
  const [done, setDone] = useState<CardAction | null>(null);

  const isFavorite = useIsFavorite({ id, provider });
  const toggleFavorite = useFavorites((state) => state.toggleFavorite);
  const fitMode = useSettings((state) => state.fitMode);

  // The props reassembled into the shape the stores keep. Both the heart and the
  // two disk actions record the *whole* wallpaper, so this has to exist once
  // rather than be spelled out per handler — a field missing from one of them
  // would show up later as a card that cannot render.
  const wallpaper: CombinedWallpaper = useMemo(
    () => ({
      id,
      title,
      imageurl,
      thumbnail,
      provider: provider ?? "unknown",
      width,
      height,
      colors: colors ?? [],
      type,
    }),
    [id, title, imageurl, thumbnail, provider, width, height, colors, type]
  );

  const run = useCallback(
    async (action: CardAction) => {
      setBusy(action);
      try {
        // Both of these write a file *and* add it to the downloads ledger. Going
        // through `lib/downloads` rather than `lib/wallpaper` directly is what
        // keeps the two in step.
        const record =
          action === "set"
            ? await applyWallpaper(wallpaper, fitMode)
            : await saveWallpaperCopy(wallpaper);

        // The tick on the button says *which* action finished; the toast says
        // what it actually did. Worth both, because a card in a grid has no room
        // to name the file or the folder it went to, and "set as wallpaper" also
        // writes one — which a user has no way to guess.
        if (action === "set") {
          toastSuccess("Wallpaper applied", FIT_MODE_LABELS[fitMode]);
        } else {
          toastSuccess(`Saved ${record.filename}`, parentDir(record.path));
        }

        setDone(action);
        window.setTimeout(() => setDone(null), 2000);
      } catch (error: unknown) {
        toastError(
          action === "set"
            ? `${title} could not be set as your wallpaper`
            : `${title} could not be downloaded`,
          error
        );
      } finally {
        setBusy(null);
      }
    },
    [wallpaper, fitMode, title]
  );

  const overlayButton = cn(
    "h-8 w-8 rounded-full bg-white/10 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 ease-out group-hover:opacity-100",
    "hover:bg-white/20 hover:text-white disabled:opacity-100"
  );

  return (
    // The data-wp-* attributes let the app-wide context menu rebuild this
    // wallpaper from the DOM, so a right-click can offer the same set/download
    // actions as these buttons instead of web gestures like copying a URL.
    <div
      className="wallpaper-card overflow-hidden rounded-lg cursor-pointer group relative"
      data-wp-id={id}
      data-wp-provider={provider}
      data-wp-title={title}
      data-wp-image={imageurl}
      data-wp-thumb={thumbnail}
    >
      <Link href={wallpaperHref({ id, provider })}>
        <Image
          src={thumbnail}
          alt={title}
          // The thumbnail's own size, not the full image's. Passing `width`/
          // `height` from the source file reserved e.g. a 1500×3256 box for a
          // 432×243 crop, so the frame was the wrong shape and `object-cover`
          // ate the difference.
          width={THUMBNAIL_WIDTH}
          height={THUMBNAIL_HEIGHT}
          loading={eager ? "eager" : "lazy"}
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
          className="aspect-video w-full rounded-lg object-cover transition-transform duration-500 group-hover:scale-110"
        />
      </Link>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 p-4 text-white opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {/* Heart deliberately last, i.e. rightmost. It's the one button that stays
          visible once a wallpaper is favorited, and the other two are `opacity-0`
          rather than `hidden` — they keep their layout space, so a heart placed
          first would sit two button-widths in from the edge with nothing beside
          it. Last means it lands flush at `right-2` when it's alone, and nothing
          shifts position when hover reveals the rest. */}
      <div className="absolute right-2 top-2 flex space-x-2">
        <Button
          size="icon"
          variant="ghost"
          className={overlayButton}
          title="Set as wallpaper"
          onClick={() => run("set")}
          disabled={busy !== null}
        >
          {busy === "set" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : done === "set" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          <span className="sr-only">Set as wallpaper</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={overlayButton}
          title="Download"
          onClick={() => run("download")}
          disabled={busy !== null}
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : done === "download" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="sr-only">Download</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn(overlayButton, isFavorite && "opacity-100")}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => toggleFavorite(wallpaper)}
        >
          <Heart
            className={cn("h-4 w-4", isFavorite && "fill-current text-red-400")}
          />
          <span className="sr-only">
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </span>
        </Button>
      </div>
      <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-white/10 px-2 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 ease-out group-hover:opacity-100">
        {provider}
      </div>
    </div>
  );
});
