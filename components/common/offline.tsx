"use client"

import { CloudOff, HardDriveDownload, Loader2, RefreshCw } from "lucide-react"
// Not next/link — see the note in components/sidebar.tsx.
import { Link } from "next-transition-router"

import { cn } from "@/lib/utils"
import { DOWNLOADS_HREF } from "@/lib/downloads"
import { useOffline } from "@/lib/offline"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * A persistent bar shown while the app is offline.
 *
 * Mounted once in the app layout, so it is present on every page and the state is
 * never a surprise — the alternative is a user clicking Search, getting an
 * explanation, and having to infer the cause. Renders nothing while online, so it
 * costs a layout row only when it is saying something.
 */
export function OfflineBanner() {
  const online = useOffline((state) => state.online)
  const checking = useOffline((state) => state.checking)
  const check = useOffline((state) => state.check)

  if (online) return null

  return (
    <div className="border-border/70 bg-card text-muted-foreground mb-2 ml-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm">
      <CloudOff className="text-foreground h-4 w-4 shrink-0" />
      <span className="text-foreground font-medium">You&apos;re offline</span>
      <span className="hidden sm:inline">
        — only wallpapers saved to this device are available.
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href={DOWNLOADS_HREF}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <HardDriveDownload className="h-4 w-4" />
          Downloads
        </Link>
        {/* The app re-checks on its own, but waiting out a timer after plugging the
            cable back in feels broken — so let the user force it. */}
        <Button variant="ghost" size="sm" onClick={() => void check()} disabled={checking}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {checking ? "Checking…" : "Retry"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Replaces the body of a page that cannot work without a connection.
 *
 * Deliberately not a blank page or a hidden route: the surface stays reachable and
 * explains itself, then points at the one thing that does work. Every caller passes
 * what specifically is unavailable, because "You're offline" alone does not tell
 * someone whether they broke the app or the network did.
 */
export function OfflineNotice({
  title = "Not available offline",
  message,
  className,
  children,
}: {
  title?: string
  /** What this particular page needs a connection for. */
  message: string
  className?: string
  /**
   * Extra actions, placed before the Downloads button. For the case where the
   * page can name something specific that still works — e.g. the detail page
   * pointing at the copy of *this* wallpaper already on disk.
   */
  children?: React.ReactNode
}) {
  const checking = useOffline((state) => state.checking)
  const check = useOffline((state) => state.check)

  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-col items-center gap-4 py-24 text-center",
        className
      )}
    >
      <CloudOff className="h-8 w-8" />
      <div className="max-w-md">
        <p className="text-foreground font-medium">{title}</p>
        <p className="mt-1 text-sm">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
        <Link href={DOWNLOADS_HREF} className={buttonVariants({ variant: "default" })}>
          <HardDriveDownload className="h-4 w-4" />
          Go to Downloads
        </Link>
        <Button variant="ghost" onClick={() => void check()} disabled={checking}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {checking ? "Checking…" : "Retry"}
        </Button>
      </div>
    </div>
  )
}
