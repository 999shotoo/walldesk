"use client";

import Home_SearchCard from "@/components/home/home_searchcard";
import { OfflineNotice } from "@/components/common/offline";
import { WallpaperFeedView } from "@/components/common/wallpaper_feed";
import { useWallpaperFeed } from "@/lib/use_wallpaper_feed";
import { useIsOffline } from "@/lib/offline";
import { useResolutionQuery } from "@/lib/settings";
import { POPULAR } from "@/lib/constant";

export default function Home() {
  // The resolution filter from Settings. Spread rather than hidden inside the
  // feed hook, so what this page asks for is readable in one line.
  const resolution = useResolutionQuery();
  const feed = useWallpaperFeed({ ...POPULAR, ...resolution });
  const offline = useIsOffline();

  // The search card goes too, not just the feed: its input navigates to /search,
  // which offline has nothing to show either. Leaving it up would invite the user
  // to type a query and get nowhere.
  if (offline) {
    return (
      <div className="pt-5">
        <h1 className="text-2xl font-semibold py-4">Popular Wallpapers</h1>
        <OfflineNotice message="Browsing needs a connection. Wallpapers you've downloaded are still available on this device." />
      </div>
    );
  }

  return (
    <>
      <Home_SearchCard />
      <div className="pt-5">
        <h1 className="text-2xl font-semibold py-4">Popular Wallpapers</h1>
        <WallpaperFeedView
          feed={feed}
          emptyMessage="No wallpapers right now"
          emptyHint="Both providers came back empty — check your connection."
        />
      </div>
    </>
  );
}
