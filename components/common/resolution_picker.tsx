"use client"

import { useState } from "react"
import { Check, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  ALL_RESOLUTIONS,
  PC_RESOLUTIONS,
  RESOLUTION_GROUPS,
  RESOLUTION_MODES,
  formatResolution,
  parseDimensions,
  resolutionRatio,
  sortResolutions,
  type ResolutionFilter,
  type ResolutionMode,
} from "@/lib/resolution"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

/** Every resolution the grid offers, for telling a custom entry apart from a listed one. */
const LISTED = new Set(ALL_RESOLUTIONS.map((item) => item.value))

/**
 * One resolution, as a toggle.
 *
 * Rendered as a button rather than a real radio or checkbox because the same
 * chip serves both modes — a floor is single-select, a whitelist is
 * multi-select — and swapping the input type under it would lose focus on every
 * mode change. `aria-pressed` carries the state either way.
 */
function Chip({
  label,
  active,
  disabled,
  title,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2 py-1.5 text-center font-mono text-xs tabular-nums transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-primary/10 text-foreground ring-primary font-medium ring-2"
          : "bg-muted text-muted-foreground hover:text-foreground ring-border/0 hover:ring-border ring-1"
      )}
    >
      {label}
    </button>
  )
}

/**
 * Pick the resolutions a feed is allowed to return.
 *
 * Uncontrolled state lives entirely in the caller: Settings hands it the stored
 * default and writes changes straight back to disk, while the search page hands
 * it a local copy that is thrown away when you leave. Same component, and the
 * difference between "my preference" and "just this search" is whose `onChange`
 * it is.
 */
export function ResolutionPicker({
  value,
  onChange,
  className,
}: {
  value: ResolutionFilter
  onChange: (next: ResolutionFilter) => void
  className?: string
}) {
  const [customWidth, setCustomWidth] = useState("")
  const [customHeight, setCustomHeight] = useState("")

  const custom = parseDimensions(customWidth, customHeight)
  // Distinguishes "nothing typed yet" from "typed something unusable", so the
  // field is not red before it has been filled in.
  const customAttempted = customWidth.trim() !== "" || customHeight.trim() !== ""

  const selected = new Set(value.mode === "exact" ? value.exact : [])

  /** Resolutions in the whitelist that the grid does not offer. */
  const extras =
    value.mode === "exact"
      ? sortResolutions(value.exact.filter((entry) => !LISTED.has(entry)))
      : []

  const setMode = (mode: ResolutionMode) => onChange({ ...value, mode })

  /** In `atleast` mode a click replaces the floor; in `exact` mode it toggles membership. */
  const pick = (resolution: string) => {
    if (value.mode === "atleast") {
      onChange({ ...value, atleast: resolution })
      return
    }
    const next = new Set(value.exact)
    if (next.has(resolution)) next.delete(resolution)
    else next.add(resolution)
    onChange({ ...value, exact: sortResolutions([...next]) })
  }

  const addCustom = () => {
    if (!custom) return
    // Routed through `pick` so the custom field means the same thing the grid
    // does in each mode — set the floor, or add to the whitelist. Adding one
    // that is already selected in `exact` mode would otherwise remove it.
    if (value.mode === "exact" && selected.has(custom.value)) {
      setCustomWidth("")
      setCustomHeight("")
      return
    }
    pick(custom.value)
    setCustomWidth("")
    setCustomHeight("")
  }

  const gridDisabled = value.mode === "off"

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* Mode. A segmented control rather than a Select because the three
          options are the thing being explained — the difference between a floor
          and an exact match is the whole feature, and a collapsed dropdown hides
          two thirds of it behind a click. */}
      <div className="bg-muted border-border/60 inline-flex w-fit rounded-lg border p-1">
        {RESOLUTION_MODES.map((option) => {
          const isActive = value.mode === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              title={option.hint}
              aria-pressed={isActive}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {RESOLUTION_MODES.find((option) => option.value === value.mode)?.hint}
      </p>

      {/* The floor, spelled out. Needed because a custom minimum need not be one
          of the grid's resolutions — set 3440 × 1440 by hand and no chip lights
          up, leaving nothing on screen to say what the filter actually is. */}
      {value.mode === "atleast" && (
        <p className="text-sm">
          Minimum{" "}
          <span className="font-mono font-medium tabular-nums">
            {formatResolution(value.atleast)}
          </span>
          {resolutionRatio(value.atleast) && (
            <span className="text-muted-foreground">
              {" "}
              ({resolutionRatio(value.atleast)})
            </span>
          )}
        </p>
      )}

      {/* Columns by aspect ratio, matching wallhaven.cc's own picker. Dimmed
          rather than unmounted in "Any size" mode, so the layout does not jump
          and the previous selection is visibly still there to come back to. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-5",
          gridDisabled && "pointer-events-none opacity-40"
        )}
        aria-hidden={gridDisabled}
      >
        {RESOLUTION_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1.5">
            <span
              title={group.hint}
              className="text-muted-foreground px-1 text-xs font-medium"
            >
              {group.label}
            </span>
            {group.items.map((item) => (
              <Chip
                key={item.value}
                label={formatResolution(item.value)}
                title={
                  value.mode === "atleast"
                    ? `${formatResolution(item.value)} or larger`
                    : formatResolution(item.value)
                }
                active={
                  value.mode === "atleast"
                    ? value.atleast === item.value
                    : selected.has(item.value)
                }
                disabled={gridDisabled}
                onClick={() => pick(item.value)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Custom entries live in their own row because they have no column to
          belong to — the grid's five are aspect ratios, and an arbitrary
          resolution is whatever shape it happens to be. */}
      {extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">Custom</span>
          {extras.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => pick(entry)}
              title={`Remove ${formatResolution(entry)}`}
              className="bg-primary/10 ring-primary text-foreground hover:bg-destructive/10 flex items-center gap-1 rounded-md px-2 py-1.5 font-mono text-xs font-medium tabular-nums ring-2 transition-colors"
            >
              {formatResolution(entry)}
              <span className="text-muted-foreground text-[10px]">
                {resolutionRatio(entry)}
              </span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Custom resolution. Two fields rather than one "1920x1080" box: the
          separator is the part people get wrong, and there is nothing to get
          wrong here. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-end gap-1.5">
          <Input
            value={customWidth}
            onChange={(event) => setCustomWidth(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addCustom()
              }
            }}
            disabled={gridDisabled}
            inputMode="numeric"
            placeholder="Width"
            aria-label="Custom width"
            className="h-8 w-[86px] text-center font-mono text-xs tabular-nums"
          />
          <span className="text-muted-foreground pb-1.5 text-xs">×</span>
          <Input
            value={customHeight}
            onChange={(event) => setCustomHeight(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addCustom()
              }
            }}
            disabled={gridDisabled}
            inputMode="numeric"
            placeholder="Height"
            aria-label="Custom height"
            className="h-8 w-[86px] text-center font-mono text-xs tabular-nums"
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          // Guarded rather than left to fail: Wallhaven answers a malformed
          // `resolutions` value with HTTP 200 and an empty page, so a typo would
          // arrive as "no wallpapers match" instead of "that is not a size".
          disabled={gridDisabled || !custom}
          onClick={addCustom}
        >
          {value.mode === "atleast" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {value.mode === "atleast" ? "Use as minimum" : "Add size"}
        </Button>

        {customAttempted && !custom && (
          <span className="text-destructive text-xs">
            Enter two whole numbers, e.g. 3440 × 1440.
          </span>
        )}
      </div>

      {/* Shortcuts, only where a list is what is being built. */}
      {value.mode === "exact" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...value, exact: sortResolutions([...PC_RESOLUTIONS]) })}
          >
            Common PC sizes
          </Button>
          {value.exact.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...value, exact: [] })}
            >
              <X className="h-4 w-4" />
              Deselect all
            </Button>
          )}
          <span className="text-muted-foreground text-xs">
            {value.exact.length === 0
              ? "Nothing selected — every size is allowed until you pick one."
              : `${value.exact.length} selected`}
          </span>
        </div>
      )}

      {/* Absent in exact mode because it is not sent there — a whitelist already
          fixes the shape, and `ratios=landscape` alongside a portrait custom size
          is a guaranteed empty feed. A switch that does nothing is worse than no
          switch.

          Not a <label> wrapping the control, either: Base UI renders a
          `role="switch"` button alongside a hidden checkbox, so a label
          containing both gets a click on the text *and* a click on the button —
          the toggle fires twice and lands back where it started. `aria-label`
          does the naming instead, same as the smooth-scrolling row in Settings. */}
      {value.mode !== "exact" && (
        <div className="flex items-start gap-2.5 pt-1">
          <Switch
            checked={value.landscapeOnly}
            onCheckedChange={(checked) =>
              onChange({ ...value, landscapeOnly: checked })
            }
            aria-label="Landscape only"
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="text-sm">Landscape only</span>
            <span className="text-muted-foreground text-xs">
              A minimum size alone still lets tall phone wallpapers through — a
              2160 × 3840 clears a 1920 × 1080 floor on both axes.
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
