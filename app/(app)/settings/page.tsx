"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { invoke } from "@tauri-apps/api/core"
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Monitor,
  Moon,
  Palette as PaletteIcon,
  RotateCcw,
  RefreshCw,
  SlidersHorizontal,
  Sun,
} from "lucide-react"

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { toastError, toastSuccess } from "@/lib/toast"

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
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98]",
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

function AnimatedSettingSwitch({
  checked,
  disabled,
  onCheckedChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={
        reduceMotion
          ? undefined
          : {
              scale: checked ? 1.04 : 1,
              filter: checked ? "drop-shadow(0 0 5px color-mix(in srgb, var(--primary) 35%, transparent))" : "drop-shadow(0 0 0 transparent)",
            }
      }
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
    >
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </motion.div>
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
function PalettePreview({ palette, compact = false }: { palette: PaletteId; compact?: boolean }) {
  if (compact) {
    // A scaled-down tile: the same sideare+content mini-app, small enough to sit
    // in the row against the Mode toggle instead of filling its own card.
    return (
      <div
        data-palette={palette}
        className="bg-background border-border pointer-events-none flex h-8 w-12 items-stretch gap-0.5 overflow-hidden rounded-md border p-0.5"
      >
        {/* Sidebar: a bordered card-coloured rail with the logo block at the top. */}
        <div className="bg-card border-border flex w-2.5 shrink-0 flex-col items-center gap-0.5 rounded-sm border py-0.5">
          <div className="bg-primary h-1 w-1 rounded-full" />
        </div>
        {/* Content: a heading in primary, a body row in muted. */}
        <div className="flex flex-1 flex-col justify-center gap-0.5">
          <div className="bg-primary h-1 w-3/5 rounded-full" />
          <div className="bg-muted h-1.5 w-full rounded-sm" />
        </div>
      </div>
    )
  }

  return (
    <div
      data-palette={palette}
      className="bg-background border-border pointer-events-none flex aspect-16/10 w-full gap-1.5 overflow-hidden rounded-md border p-2"
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
    <div className="grid w-full grid-cols-3 gap-4">
      {PALETTES.map((option) => {
        const isActive = palette === option.id
        return (
          <button
            key={option.id}
            onClick={() => setPalette(option.id)}
            title={`${option.label} — ${option.hint}`}
            aria-pressed={isActive}
            className={cn(
              "group rounded-md focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none aspect-16/10 transition-transform duration-200 ease-out hover:scale-[1.025] active:scale-[0.985]",
              isActive
                ? "ring-primary ring-offset-background ring-2 ring-offset-1"
                : "ring-border/0 hover:ring-border ring-2"
            )}
          >
            <PalettePreview palette={option.id} compact={false} />
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
        <AnimatePresence mode="wait" initial={false}>
          {justSaved ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.14 }}
            >
              <Check className="h-4 w-4" />
            </motion.span>
          ) : (
            <motion.span
              key="save"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              Save
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </div>
  )
}

function Row({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Each card in the list is one logical setting, with a heading, a hint, and
 * the control itself. Everything scrolls inside the page; the header above it
 * stays put so the tab you are showing never scrolls out from under you.
 */
function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className="settings-card">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const TAB_IDS = ["appearance", "advanced"] as const
type TabId = (typeof TAB_IDS)[number]

function UpdateCheckButton() {
  const [checking, setChecking] = useState(false)

  const checkAndUpdate = async () => {
    if (checking) return
    setChecking(true)
    try {
      const status = await invoke<{
        available: boolean
        version: string | null
      }>("check_for_update")

      if (!status.available) {
        toastSuccess("You are up to date", "No newer WallDesk release is available.")
        return
      }

      toastSuccess(
        `WallDesk v${status.version ?? "new"} is ready`,
        "Downloading and installing the update…"
      )
      await invoke("install_update")
    } catch (error: unknown) {
      toastError("Update check failed", error)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5 transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:shadow-sm active:scale-[0.98]"
      onClick={() => void checkAndUpdate()}
      disabled={checking}
    >
      <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
      {checking ? "Checking…" : "Check for updates"}
    </Button>
  )
}

export default function SettingsPage() {
  const hydrated = useSettings((state) => state.hydrated)

  const fitMode = useSettings((state) => state.fitMode)
  const setFitMode = useSettings((state) => state.setFitMode)

  const smoothScroll = useSettings((state) => state.smoothScroll)
  const setSmoothScroll = useSettings((state) => state.setSmoothScroll)
  const imageMotion = useSettings((state) => state.imageMotion)
  const setImageMotion = useSettings((state) => state.setImageMotion)

  const resolution = useSettings((state) => state.resolution)
  const setResolution = useSettings((state) => state.setResolution)

  const apiKey = useSettings((state) => state.wallhavenApiKey)
  const setApiKey = useSettings((state) => state.setWallhavenApiKey)

  const fitLabel =
    FIT_MODES.find((mode) => mode.value === fitMode)?.label ?? fitMode

  return (
    <div className="mx-auto w-full ">
      {/* Header + tabs pinned while the settings below scroll. */}
      <div className="bg-background/95 sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 backdrop-blur-sm">
        <h1 className="py-2 text-2xl font-semibold">Settings</h1>
        <Tabs defaultValue="appearance" className="mt-2">
          <div className="flex items-center justify-between gap-3">
            <TabsList className="max-w-sm bg-transparent">
              {(
                [
                  { id: "appearance", label: "Appearance", icon: PaletteIcon },
                  { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
                ] as { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map(({ id, label, icon: Icon }) => (
                <TabsTab key={id} value={id} className="flex-1 border bg-card">
                  <span className="flex items-center justify-center gap-1.5">
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                </TabsTab>
              ))}
            </TabsList>
            <UpdateCheckButton />
          </div>

          {/* Appearance */}
          <TabsPanel value="appearance" className="settings-tab-panel">
            <motion.div
              initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3"
            >
              <SettingsCard
                icon={Sun}
                title="Appearance"
                description="Theme follows your system by default. The palette is independent of it — pick any of the six colour sets, in light or dark, and switch how the page scrolls."
              >
                <div className="flex flex-col gap-6">
                  <Row label="Mode" hint="Light, dark, or follow your system.">
                    <ThemeToggle />
                  </Row>
                  <Row
                    label="Colour theme"
                    hint="Only the colours change — layout, spacing and type stay the same. All six are tuned to be easy on the eyes in both light and dark."
                  >
                    <PalettePicker />
                  </Row>
                  <Row
                    label="Smooth scrolling"
                    hint="Eases the page along instead of jumping a notch at a time. Off by default — it puts an animation between your wheel and the pixels, which is a matter of taste."
                  >
                    <AnimatedSettingSwitch
                      checked={smoothScroll}
                      // Disabled until the stored value has been read, so the
                      // switch never shows "off" for a moment when it is really
                      // on and then flips.
                      disabled={!hydrated}
                      onCheckedChange={(checked) => void setSmoothScroll(checked)}
                      label="Smooth scrolling"
                    />
                  </Row>
                  <Row
                    label="Image animations"
                    hint="Fade thumbnails and skeleton placeholders smoothly. On by default."
                  >
                    <AnimatedSettingSwitch
                      checked={imageMotion}
                      disabled={!hydrated}
                      onCheckedChange={(checked) => void setImageMotion(checked)}
                      label="Image animations"
                    />
                  </Row>
                </div>
              </SettingsCard>
            </motion.div>
          </TabsPanel>

          {/* Advanced */}
          <TabsPanel value="advanced" className="settings-tab-panel">
            <motion.div
              initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3"
            >
              <SettingsCard
                icon={Monitor}
                title="Applying wallpapers"
                description="How a wallpaper is scaled when you apply it. Can be overridden per wallpaper."
              >
                <Row label="Default fit">
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
              </SettingsCard>

              <SettingsCard
                icon={Monitor}
                title="Wallpaper sizes"
                description="Which resolutions the app is allowed to show you. Defaults to 1920 × 1080 or larger in landscape — anything that fits a desktop or a laptop screen. Applies everywhere you browse; the search page can override it for one search."
              >
                {/* Straight to disk on every click. There is nothing to submit —
                    each chip is the whole change, and a Save button next to a
                    grid of toggles only adds a way to lose the selection. */}
                <ResolutionPicker
                  value={resolution}
                  onChange={(next) => void setResolution(next)}
                />
                {!isDefaultResolution(resolution) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit mt-2"
                    onClick={() => void setResolution(DEFAULT_RESOLUTION_FILTER)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to default
                  </Button>
                )}
              </SettingsCard>

              <SettingsCard
                icon={CheckCircle2}
                title="Wallhaven API key"
                description="Optional. Browsing works without one — add a key to authenticate requests against your own Wallhaven account. Stored locally on this machine."
              >
                <SavedField
                  label="Wallhaven API key"
                  secret
                  placeholder="Paste your API key"
                  value={apiKey}
                  onSave={setApiKey}
                />
              </SettingsCard>

              <SettingsCard
                icon={CheckCircle2}
                title="Saved wallpapers"
                description="Everything the app saves goes to Pictures/WallDesk — both explicit downloads and the file written when you apply a wallpaper, which the desktop reads back on every restart. Deleting one from Downloads deletes its file too."
              >
                <p className="text-muted-foreground text-sm">
                  Wallpapers are provided by{" "}
                  <span className="text-foreground font-medium">Wallhaven</span>.
                </p>
              </SettingsCard>
            </motion.div>
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
