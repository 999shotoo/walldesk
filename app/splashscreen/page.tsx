"use client";

import React, { useEffect, useState } from "react";

const IMAGES = [
  "/splashscreen/one_piece.png",
  "/splashscreen/girl.jpg",
  "/splashscreen/yourname.jpg",
  "/splashscreen/aot.jpg",
];

export default function SplashscreenPage() {
  const [imageSrc, setImageSrc] = useState<string>(IMAGES[0]);
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);

  // Randomize on the client only: picking during render would differ between
  // the prerendered HTML and the first client render.
  useEffect(() => {
    setImageSrc(IMAGES[Math.floor(Math.random() * IMAGES.length)]);
  }, []);

  // This window no longer drives the handoff. It used to fake 5 seconds of
  // progress and then report "frontend ready"; the main window now reports its
  // own readiness (see `components/common/app_boot.tsx`), so this screen is
  // purely something to look at while that happens — and it closes as soon as
  // the app is genuinely up.
  return (
    <div className="grid min-h-svh md:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <span className="flex items-center gap-2 font-medium">
            <span className="w-7 h-7 bg-primary rounded-xl flex items-center justify-center">
              <span className="w-3 h-3 bg-primary-foreground rounded-full" />
            </span>
            WallDesk
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3 items-center md:items-start">
          <div className="text-lg font-semibold">Starting WallDesk</div>
          <div className="text-sm text-muted-foreground">
            Loading your wallpapers…
          </div>

          <div className="mt-2 w-full max-w-sm bg-muted rounded-full h-1.5 overflow-hidden">
            {/* Indeterminate: the real work has no measurable percentage. */}
            <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
          </div>
        </div>
      </div>

      <div className="bg-muted relative hidden md:block">
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
        )}
        <img
          src={imageSrc}
          alt=""
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 dark:brightness-[0.6] dark:grayscale ${
            imgLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}
