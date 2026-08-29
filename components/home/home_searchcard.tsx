
"use client"

import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { useEffect, useRef, useState } from "react"
// Not next/navigation's router: `auto` mode only intercepts link clicks, so a
// programmatic push would skip the cross-fade and jump. This one runs it.
import { useTransitionRouter } from "next-transition-router"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchIcon } from "lucide-react"
import { PROVIDER_LABEL } from "@/lib/api"


type WallpaperInfo = {
  path: string
  width?: number
  height?: number
  format?: string
  size_bytes?: number
}

export default function Home_SearchCard() {
  const router = useTransitionRouter()
  const [info, setInfo] = useState<WallpaperInfo | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imgLoaded, setImgLoaded] = useState<boolean>(false)
  const [imgError, setImgError] = useState<boolean>(false)
  const imgLoadTimer = useRef<number | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [query, setQuery] = useState<string>("")

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const term = query.trim()
    if (!term) return
    router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  useEffect(() => {
    invoke("get_wallpaper_info")
      .then((p: unknown) => setInfo(p as WallpaperInfo))
      .catch((e: unknown) => setInfo({ path: `error: ${String(e)}` }))
  }, [])

  useEffect(() => {
    // reset image loaded state when preview or path changes
    setImgLoaded(false)
    setImgError(false)
    if (imgLoadTimer.current) {
      window.clearTimeout(imgLoadTimer.current)
      imgLoadTimer.current = null
    }
    // Safety timeout: if onLoad never fires, stop showing skeleton after 4s
    imgLoadTimer.current = window.setTimeout(() => {
      setImgLoaded(true)
    }, 4000) as unknown as number

    return () => {
      if (imgLoadTimer.current) {
        window.clearTimeout(imgLoadTimer.current)
        imgLoadTimer.current = null
      }
    }
  }, [preview, info?.path])

  // compute assetUrl only on the client to avoid calling convertFileSrc during SSR
  useEffect(() => {
    if (typeof window === "undefined") {
      setAssetUrl(null)
      return
    }

    if (preview && preview !== "") {
      setAssetUrl(preview)
      return
    }

    if (info && info.path) {
      try {
        const url = convertFileSrc(info.path)
        setAssetUrl(url)
      } catch (e) {
        console.warn("convertFileSrc failed", e)
        setAssetUrl(null)
      }
      return
    }

    setAssetUrl(null)
  }, [preview, info])





  return (
    <>
      <div className="w-full flex flex-col lg:flex-row gap-6 items-start lg:items-stretch">
        {/* Left card column - 25% on large screens, full width on small */}
        <div className="w-full lg:w-3/8 flex">
          <Card className="w-full h-full">
            <CardHeader>
              <CardTitle>Your Current wallpaper</CardTitle>
              <CardDescription>This is your current wallpaper information.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Grid: stack on small, left column = image on lg+ */}
              <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <div className="w-full shrink-0 overflow-hidden rounded-md relative h-40 xl:h-44">
                  {!imgLoaded && (
                    <Skeleton className="w-full h-40 xl:h-44 rounded-md" />
                  )}
                  {assetUrl && (
                    <>
                      {!imgError ? (
                          <img
                            src={assetUrl}
                            alt="wallpaper"
                            onLoad={() => {
                              setImgLoaded(true)
                              if (imgLoadTimer.current) {
                                window.clearTimeout(imgLoadTimer.current)
                                imgLoadTimer.current = null
                              }
                            }}
                            onError={() => {
                              setImgError(true)
                              setImgLoaded(true)
                              if (imgLoadTimer.current) {
                                window.clearTimeout(imgLoadTimer.current)
                                imgLoadTimer.current = null
                              }
                            }}
                            className={`w-full h-40 xl:h-44 object-cover rounded-md ${imgLoaded ? "block" : "hidden"}`}
                          />
                      ) : (
                        <div className="w-full h-40 xl:h-44 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                          <div className="text-sm">Image not available</div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="text-sm gap-2 text-muted-foreground flex flex-col">
                  {info ? (
                    <>
                      <div className="underline text-secondary-foreground">
                        <a className="block wrap-break-word max-w-full" href={`file://${info?.path ?? ""}`}>
                          Path: {info.path}
                        </a>
                      </div>
                      <div>Dimensions: {info.width && info.height ? `${info.width} x ${info.height}` : "?"}</div>
                      <div>Format: {info.format ?? "?"}</div>
                      <div>Size: {info.size_bytes ? `${info.size_bytes} bytes` : "?"}</div>
                    </>
                  ) : (
                    <>
                      <Skeleton className="h-4 w-full sm:w-3/4 md:w-2/3" />
                      <Skeleton className="h-4 w-full sm:w-2/3 md:w-1/2" />
                      <Skeleton className="h-4 w-full sm:w-1/2 md:w-1/3" />
                      <Skeleton className="h-4 w-32" />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-2"></CardFooter>
          </Card>
        </div>

        {/* Right flexible content area - search UI */}
        <div className="w-full lg:flex-1 flex items-center">
          <div className="mx-auto w-full max-w-lg py-8 lg:py-0 text-center ">
            <h1 className="text-3xl font-extrabold mb-2 text-center ">Search Wallpapers</h1>
            <p className="text-muted-foreground mb-6 max-w-2xl text-center ">Search {PROVIDER_LABEL} by keyword.</p>

            <form onSubmit={submitSearch} className="w-full">
              <label className="relative block">
                <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  <SearchIcon className="w-4 h-4" />
                </span>
                <Input
                  value={query}
                  onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
                  placeholder="Mountains, neon, minimal…"
                  className="pl-10 pr-4"
                />
              </label>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{PROVIDER_LABEL}</div>
                <Button type="submit" disabled={!query.trim()}>
                  Search
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

    </>
  );
}
