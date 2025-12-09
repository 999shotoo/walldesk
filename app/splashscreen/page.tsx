"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GalleryVerticalEnd } from "lucide-react";

export default function SplashscreenPage() {

  useEffect(() => {

    let cancelled = false

    const statuses = [
      "Loading user settings",
      "Initializing plugins",
      "Preparing UI",
      "Caching images",
      "Finalizing startup",
    ];

    async function setup() {
      console.log("Performing really heavy frontend setup task...");

      // pick a random image from an inline list
      const list: string[] = [
        "/splashscreen/one_piece.png",
        "/splashscreen/girl.jpg",
        "/splashscreen/yourname.jpg",
        "/splashscreen/aot.jpg",
      ];
      if (list.length > 0) {
        const idx = Math.floor(Math.random() * list.length);
        setImageSrc(list[idx]);
      }

      // simulate progress over ~5s with status messages
      const total = 5000; // ms
      const step = 100; // ms
      let elapsed = 0;

      while (elapsed < total && !cancelled) {
        const pct = Math.min(100, Math.round((elapsed / total) * 100));
        setProgress(pct);
        // pick a status based on elapsed
        const idx = Math.floor((elapsed / total) * (statuses.length));
        setStatus(statuses[Math.min(idx, statuses.length - 1)]);
        await new Promise((r) => setTimeout(r, step));
        elapsed += step;
      }

      if (cancelled) return;

      // finish
      setProgress(100);
      setStatus("Complete");
      console.log("Frontend setup task complete!");

      // If running inside Tauri, notify the backend that the frontend setup finished.
      invoke("set_complete", { task: "frontend" }).catch((e) => {
        console.warn("set_complete invoke failed", e);
      });
    }

    setup();

    return () => {
      cancelled = true
    }
  }, []);
  const [progress, setProgress] = useState<number>(0)
  const [status, setStatus] = useState<string>("Starting")
  const [imageSrc, setImageSrc] = useState<string | null>("/splashscreen/one_piece.png")
  const [imgLoaded, setImgLoaded] = useState<boolean>(false)
  return (
    <>
      <div className="grid min-h-svh md:grid-cols-2">
        <div className="flex flex-col gap-4 p-6 md:p-10">
          <div className="flex justify-center gap-2 md:justify-start">
            <a href="#" className="flex items-center gap-2 font-medium">
              <div className="w-full flex items-center justify-center">
                <div className="w-7 h-7 bg-primary rounded-xl flex items-center justify-center">
                  <div className="w-3 h-3 bg-primary-foreground rounded-full" />
                </div>
              </div>
              WallDesk
            </a>
          </div>

          <div className="flex flex-col gap-4 items-center md:items-start">
            <div className="text-lg font-semibold">Starting WallDesk</div>
            <div className="text-sm text-muted-foreground">{status}</div>

            <div className="w-full max-w-sm mt-4">
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="bg-primary h-3"
                  style={{ width: `${progress}%`, transition: "width 120ms linear" }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <div>{progress}%</div>
                <div>Initializing…</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-primary animate-spin" />
                <div className="text-sm">Loading…</div>
              </div>
            </div>

            <ul className="mt-6 text-sm space-y-1 w-full max-w-sm">
              <li className={`${status === 'Loading user settings' ? 'text-primary' : 'text-muted-foreground'}`}>Loading user settings</li>
              <li className={`${status === 'Initializing plugins' ? 'text-primary' : 'text-muted-foreground'}`}>Initializing plugins</li>
              <li className={`${status === 'Preparing UI' ? 'text-primary' : 'text-muted-foreground'}`}>Preparing UI</li>
              <li className={`${status === 'Caching images' ? 'text-primary' : 'text-muted-foreground'}`}>Caching images</li>
              <li className={`${status === 'Finalizing startup' ? 'text-primary' : 'text-muted-foreground'}`}>Finalizing startup</li>
            </ul>
          </div>
        </div>

        <div className="bg-muted relative hidden md:block">
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-primary animate-spin" />
            </div>
          )}
          <img
            src={imageSrc ?? "/splashscreen/one_piece.png"}
            alt="Image"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover dark:brightness-[0.6] dark:grayscale ${imgLoaded ? "" : "opacity-0"}`}
          />
        </div>
      </div>
    </>
  );
}
