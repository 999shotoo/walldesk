"use client";

import Home_SearchCard from "@/components/home/home_searchcard";
import { WallpaperFeedView } from "@/components/common/wallpaper_feed";
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed";

export default function Home() {
  const feed = useWallpaperFeed();

  return (
    <>
      <Home_SearchCard />
      <div className="pt-5">
        <h1 className="text-2xl font-semibold py-4">Recent Wallpapers</h1>
        <WallpaperFeedView
          feed={feed}
          emptyMessage="No wallpapers right now"
          emptyHint="Both providers came back empty — check your connection."
        />
      </div>
    </>
  );
}
