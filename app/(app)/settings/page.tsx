"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Check, Eye, EyeOff, Monitor, Moon, RotateCcw, Sun } from "lucide-react"

import { useSettings } from "@/lib/settings"
import { PALETTES, beginThemeSwitch, type PaletteId } from "@/lib/theme"
import {
  DEFAULT_RESOLUTION_FILTER,
  isDefaultResolution,
} from "@/lib/resolution"
import { usePalette } from "@/lib/use_palette"
import { FIT_MODES, type FitMode } from "@/lib/wallpaper"
import { cn } from "@/lib/utils"
import { ResolutionPicker } from "@/components/common/resolution_picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // `theme` is undefined until next-themes reads the stored preference on the
  // client, so render the control unselected rather than guessing wrong.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="bg-muted border-border/60 inline-flex rounded-lg border p-1">
      {THEMES.map((option) => {
        const Icon = option.icon
        const isActive = mounted && theme === option.value
        return (
          <button
            key={option.value}
            onClick={() => {
              beginThemeSwitch()
              setTheme(option.value)
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Miniature of the app rendered in an arbitrary palette.
 *
 * The tile carries `data-palette` itself, so the CSS variables resolve to that
 * palette on this subtree — the swatch reads its colours straight out of
 * `globals.css` instead of keeping a second copy of every palette in
 * TypeScript. Dark mode comes from the ancestor `.dark` class via the
 * descendant selectors in `globals.css`, deliberately *not* from
 * `resolvedTheme`: that is undefined on the first client render, so under
 * "system" every tile rendered light inside a dark window and then flipped.
 */
function PalettePreview({ palette }: { palette: PaletteId }) {
  return (
    <div
      data-palette={palette}
      className="bg-background border-border pointer-events-none flex h-13 gap-1 overflow-hidden rounded-md border p-1.5"
    >
      {/* Sidebar, matching the real one: a bordered card-coloured rail with the
          primary-coloured logo block at the top. */}
      <div className="bg-card border-border flex w-4 shrink-0 flex-col items-center gap-1 rounded-sm border py-1">
        <div className="bg-primary h-2 w-2 rounded-full" />
        <div className="bg-muted-foreground/40 h-1 w-1 rounded-full" />
        <div className="bg-muted-foreground/40 h-1 w-1 rounded-full" />
      </div>
      {/* Content: a heading in primary, body rows in muted. */}
      <div className="flex flex-1 flex-col justify-start gap-1 pt-1">
        <div className="bg-primary h-1.5 w-1/2 rounded-full" />
        <div className="bg-muted h-2 w-full rounded-sm" />
        <div className="bg-muted h-2 w-3/4 rounded-sm" />
      </div>
    </div>
  )
}

function PalettePicker() {
  const palette = usePalette((state) => state.palette)
  const setPalette = usePalette((state) => state.setPalette)

  // `AppBoot` normally does this; repeating it keeps the picker correct if it
  // ever renders outside that layout. `hydrate` returns early once done.
  useEffect(() => {
    usePalette.getState().hydrate()
  }, [])

  return (
    <div className="grid w-full max-w-[300px] grid-cols-3 gap-2">
      {PALETTES.map((option) => {
        const isActive = palette === option.id
        return (
          <button
            key={option.id}
            onClick={() => setPalette(option.id)}
            title={`${option.label} — ${option.hint}`}
            aria-pressed={isActive}
            className={cn(
              "group focus-visible:ring-ring flex flex-col gap-1.5 rounded-lg p-1 text-left transition-all focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? "ring-primary ring-2"
                : "ring-border/0 hover:ring-border ring-2"
            )}
          >
            <PalettePreview palette={option.id} />
            <span
              className={cn(
                "flex items-center gap-1 px-0.5 text-xs transition-colors",
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground group-hover:text-foreground"
              )}
            >
              {/* Always laid out, only revealed when active — inserting the
                  icon instead would shift every label sideways on selection. */}
              <Check
                className={cn(
                  "h-3 w-3 shrink-0 transition-opacity",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Text input that only commits on Save or Enter.
 *
 * Typing straight into the store would write a half-finished key on every
 * keystroke; the `touched` guard also means hydration landing after mount can
 * fill the field in without clobbering an edit in progress.
 */
function SavedField({
  value,
  onSave,
  placeholder,
  label,
  secret = false,
}: {
  value: string
  onSave: (next: string) => Promise<void>
  placeholder: string
  label: string
  secret?: boolean
}) {
  const hydrated = useSettings((state) => state.hydrated)

  const [draft, setDraft] = useState(value)
  const [revealed, setRevealed] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // Track whether the user has typed, so hydration landing after mount can
  // still populate the field without clobbering an in-progress edit.
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!touched) setDraft(value)
  }, [value, touched])

  const dirty = draft.trim() !== value

  const save = async () => {
    await onSave(draft)
    setTouched(false)
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="flex w-full max-w-md items-center gap-2">
      <div className="relative flex-1">
        <Input
          // `password` keeps a key off-screen by default; shoulder-surfing a
          // settings page is a real way for a credential to leak.
          type={secret && !revealed ? "password" : "text"}
          value={draft}
          disabled={!hydrated}
          spellCheck={false}
          autoComplete="off"
          aria-label={label}
          placeholder={hydrated ? placeholder : "Loading…"}
          onChange={(event) => {
            setTouched(true)
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) void save()
          }}
          className={cn(secret && "pr-9")}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            title={revealed ? "Hide key" : "Show key"}
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="sr-only">{revealed ? "Hide key" : "Show key"}</span>
          </button>
        )}
      </div>
      <Button size="sm" onClick={() => void save()} disabled={!dirty}>
        {justSaved ? <Check className="h-4 w-4" /> : "Save"}
      </Button>
    </div>
  )
}

function Row({
  label,
  hint,
  stacked = false,
  children,
}: {
  label: string
  hint?: string
  /**
   * Put the control below the label instead of beside it.
   *
   * For controls too wide to sit in the right-hand column — the resolution grid
   * is five columns of chips, which squeezed into half a row wraps into an
   * unreadable stack.
   */
  stacked?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-5",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-8"
      )}
    >
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const hydrated = useSettings((state) => state.hydrated)

  const fitMode = useSettings((state) => state.fitMode)
  const setFitMode = useSettings((state) => state.setFitMode)

  const smoothScroll = useSettings((state) => state.smoothScroll)
  const setSmoothScroll = useSettings((state) => state.setSmoothScroll)

  const resolution = useSettings((state) => state.resolution)
  const setResolution = useSettings((state) => state.setResolution)

  const apiKey = useSettings((state) => state.wallhavenApiKey)
  const setApiKey = useSettings((state) => state.setWallhavenApiKey)

  const fitLabel =
    FIT_MODES.find((mode) => mode.value === fitMode)?.label ?? fitMode

  return (
    <div className="w-full ">
      <h1 className="py-4 text-2xl font-semibold">Settings</h1>

      {/* The rows used to sit directly on the shell, which made the whole page
          read as one flat field. On a card they get their own surface, the way
          a macOS settings pane does. */}
      <div className="bg-card border-border shadow-sm divide-border divide-y rounded-xl border px-5">
        <Row label="Appearance" hint="Follows your system theme by default.">
          <ThemeToggle />
        </Row>

        <Row
          label="Colour theme"
          hint="Only the palette changes — layout, spacing and type stay the same. All six are tuned to be easy on the eyes in both light and dark."
        >
          <PalettePicker />
        </Row>

        <Row
          label="Default fit"
          hint="How a wallpaper is scaled when you apply it. Can be overridden per wallpaper."
        >
          <Select
            value={fitMode}
            onValueChange={(value) => void setFitMode(value as FitMode)}
          >
            <SelectTrigger size="sm" className="w-[170px]">
              <span>{fitLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {FIT_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row
          label="Smooth scrolling"
          hint="Eases the page along instead of jumping a notch at a time. Off by default — it puts an animation between your wheel and the pixels, which is a matter of taste."
        >
          <Switch
            checked={smoothScroll}
            // Disabled until the stored value has been read, so the switch never
            // shows "off" for a moment when it is really on and then flips.
            disabled={!hydrated}
            onCheckedChange={(checked) => void setSmoothScroll(checked)}
            aria-label="Smooth scrolling"
          />
        </Row>

        <Row
          label="Wallpaper sizes"
          hint="Which resolutions the app is allowed to show you. Defaults to 1920 × 1080 or larger in landscape — anything that fits a desktop or a laptop screen. Applies everywhere you browse; the search page can override it for one search."
          stacked
        >
          {/* Straight to disk on every click. There is nothing to submit — each
              chip is the whole change, and a Save button next to a grid of
              toggles only adds a way to lose the selection. */}
          <ResolutionPicker
            value={resolution}
            onChange={(next) => void setResolution(next)}
          />
          {!isDefaultResolution(resolution) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => void setResolution(DEFAULT_RESOLUTION_FILTER)}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </Button>
          )}
        </Row>

        <Row
          label="Wallhaven API key"
          hint="Optional. Browsing works without one — add a key to authenticate requests against your own Wallhaven account. Stored locally on this machine."
        >
          <SavedField
            label="Wallhaven API key"
            secret
            placeholder="Paste your API key"
            value={apiKey}
            onSave={setApiKey}
          />
        </Row>

        <Row
          label="Saved wallpapers"
          hint="Everything the app saves goes to Pictures/WallDesk — both explicit downloads and the file written when you apply a wallpaper, which the desktop reads back on every restart. Deleting one from Downloads deletes its file too."
        >
          <span />
        </Row>
      </div>

      <Separator className="my-6" />

      <p className="text-muted-foreground text-sm">
        Wallpapers are provided by{" "}
        <span className="text-foreground">Wallhaven</span>.
      </p>
    </div>
  )
}
