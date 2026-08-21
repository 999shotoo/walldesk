"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Check, Eye, EyeOff, Monitor, Moon, Sun } from "lucide-react"

import { useSettings } from "@/lib/settings"
import { FIT_MODES, type FitMode } from "@/lib/wallpaper"
import { cn } from "@/lib/utils"
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
    <div className="bg-muted inline-flex rounded-lg p-1">
      {THEMES.map((option) => {
        const Icon = option.icon
        const isActive = mounted && theme === option.value
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
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

function ApiKeyField() {
  const saved = useSettings((state) => state.wallhavenApiKey)
  const hydrated = useSettings((state) => state.hydrated)
  const setWallhavenApiKey = useSettings((state) => state.setWallhavenApiKey)

  const [draft, setDraft] = useState(saved)
  const [revealed, setRevealed] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // Track whether the user has typed, so hydration landing after mount can
  // still populate the field without clobbering an in-progress edit.
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!touched) setDraft(saved)
  }, [saved, touched])

  const dirty = draft.trim() !== saved

  const save = async () => {
    await setWallhavenApiKey(draft)
    setTouched(false)
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="flex w-full max-w-md items-center gap-2">
      <div className="relative flex-1">
        <Input
          // `password` keeps the key off-screen by default; shoulder-surfing a
          // settings page is a real way for a credential to leak.
          type={revealed ? "text" : "password"}
          value={draft}
          disabled={!hydrated}
          spellCheck={false}
          autoComplete="off"
          placeholder={hydrated ? "Paste your API key" : "Loading…"}
          onChange={(event) => {
            setTouched(true)
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) void save()
          }}
          className="pr-9"
        />
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
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const fitMode = useSettings((state) => state.fitMode)
  const setFitMode = useSettings((state) => state.setFitMode)
  const error = useSettings((state) => state.error)

  const fitLabel =
    FIT_MODES.find((mode) => mode.value === fitMode)?.label ?? fitMode

  return (
    <div className="w-full pt-5">
      <h1 className="py-4 text-2xl font-semibold">Settings</h1>

      {error && (
        <p className="text-destructive mb-4 text-sm">
          Settings could not be saved: {error}
        </p>
      )}

      <div className="divide-border divide-y">
        <Row label="Appearance" hint="Follows your system theme by default.">
          <ThemeToggle />
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
          label="Wallhaven API key"
          hint="Optional. Browsing works without one — add a key to authenticate requests against your own Wallhaven account. Stored locally on this machine."
        >
          <ApiKeyField />
        </Row>

        <Row
          label="Saved wallpapers"
          hint="Applied wallpapers are kept in Pictures/WallDesk so the desktop keeps working after a restart. Explicit downloads go to your Downloads folder."
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
