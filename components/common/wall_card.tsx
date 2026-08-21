"use client"

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Check, Download, Heart, Loader2, Monitor } from "lucide-react";

import { cn } from "@/lib/utils";
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "@/lib/constant";
import { Button } from "@/components/ui/button";
import { useFavorites, useIsFavorite } from "@/lib/store";
import { useSettings } from "@/lib/settings";
import {
  downloadAndSetWallpaper,
  downloadWallpaper,
  wallpaperFilename,
  wallpaperHref,
} from "@/lib/wallpaper";

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

export function WallpaperCard({
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
  const [failed, setFailed] = useState<string | null>(null);

  const isFavorite = useIsFavorite({ id, provider });
  const toggleFavorite = useFavorites((state) => state.toggleFavorite);
  const fitMode = useSettings((state) => state.fitMode);

  const run = useCallback(
    async (action: CardAction) => {
      const filename = wallpaperFilename({ id, provider, imageurl });
      setBusy(action);
      setFailed(null);
      try {
        if (action === "set") {
          await downloadAndSetWallpaper(imageurl, filename, fitMode);
        } else {
          await downloadWallpaper(imageurl, filename, "downloads");
        }
        setDone(action);
        window.setTimeout(() => setDone(null), 2000);
      } catch (error: unknown) {
        setFailed(String(error));
      } finally {
        setBusy(null);
      }
    },
    [id, provider, imageurl, fitMode]
  );

  const overlayButton = cn(
    "h-8 w-8 rounded-full bg-white/10 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100",
    "hover:bg-white/20 hover:text-white disabled:opacity-100"
  );

  return (
    <div className="overflow-hidden rounded-lg cursor-pointer group relative">
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
          className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-110 rounded-lg"
        />
      </Link>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
        <h3 className="text-lg font-semibold">{title}</h3>
        {failed && (
          <p className="mt-1 text-xs text-red-300 line-clamp-2">{failed}</p>
        )}
      </div>
      <div className="absolute right-2 top-2 flex space-x-2">
        <Button
          size="icon"
          variant="ghost"
          className={cn(overlayButton, isFavorite && "opacity-100")}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() =>
            toggleFavorite({
              id,
              title,
              imageurl,
              thumbnail,
              provider: provider ?? "unknown",
              width,
              height,
              colors: colors ?? [],
              type,
            })
          }
        >
          <Heart
            className={cn("h-4 w-4", isFavorite && "fill-current text-red-400")}
          />
          <span className="sr-only">
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </span>
        </Button>
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
      </div>
      <div className="absolute left-2 top-2 rounded-full bg-white/10 px-2 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-events-none">
        {provider}
      </div>
    </div>
  );
}
