"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { usePalette } from "@/lib/use_palette"

/**
 * Thin wrapper around next-themes' ThemeProvider.
 *
 * next-themes only manages the `class` attribute (for light/dark/system).
 * It wipes any `data-*` attributes it doesn't own during its hydration effect.
 * We re-apply `data-palette` in a child effect that runs AFTER next-themes'
 * effect (React runs child effects before parent effects, so this wrapper's
 * effect runs last).
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // Re-apply palette after next-themes finishes its hydration effect.
  // This effect runs after next-themes' internal effect because:
  // 1. NextThemesProvider is a child of this component
  // 2. React fires effects bottom-up (children first, then parents)
  React.useEffect(() => {
    usePalette.getState().hydrate()
  }, [])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
