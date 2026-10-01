"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ClipboardPaste,
  Copy,
  Download,
  Monitor,
  Scissors,
  TextCursorInput,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { toastSuccess, toastInfo, toastError } from "@/lib/toast"
import { applyWallpaper, parentDir, saveWallpaperCopy } from "@/lib/downloads"
import { useSettings } from "@/lib/settings"
import { FIT_MODE_LABELS } from "@/lib/wallpaper"

/**
 * A snapshot of what was under the cursor when the menu opened.
 *
 * The real element is captured here rather than held as a reference: it could
 * unmount or re-render between the right-click and the click on a menu item,
 * and reading from a stale node gives wrong answers exactly when it matters
 * most (an image swapped for a grid of spinners).
 */
type ContextTarget = {
  /** An `INPUT` / `TEXTAREA` — editable fields get the clipboard trio. */
  input: HTMLInputElement | HTMLTextAreaElement | null
  /** The wallpaper rendered under the cursor, when there is one. */
  wallpaper: CombinedWallpaper | null
  /** Whatever text is currently selected on the page. */
  selection: string
}

/**
 * Rebuild a wallpaper from the data attributes a browse card carries.
 *
 * This is what lets the context menu offer the app's *own* actions — set as
 * wallpaper, download — instead of web gestures like copying a URL. `null` when
 * the cursor is not over a card, so those actions simply don't appear.
 */
function wallpaperFromCard(card: HTMLElement | null): CombinedWallpaper | null {
  if (!card) return null
  const id = card.dataset.wpId
  const imageurl = card.dataset.wpImage
  if (!id || !imageurl) return null
  return {
    id,
    provider: card.dataset.wpProvider ?? "unknown",
    title: card.dataset.wpTitle ?? id,
    thumbnail: card.dataset.wpThumb ?? imageurl,
    imageurl,
    colors: [],
    type: "image",
  }
}

function inspectTarget(target: EventTarget | null): ContextTarget {
  const el = target as HTMLElement | null
  const input =
    el?.tagName === "INPUT" || el?.tagName === "TEXTAREA"
      ? (el as HTMLInputElement | HTMLTextAreaElement)
      : null
  const card = el?.closest?.("[data-wp-id]") as HTMLElement | null

  return {
    input,
    wallpaper: wallpaperFromCard(card),
    selection: window.getSelection()?.toString() ?? "",
  }
}

type MenuState = { open: boolean; x: number; y: number } | null

/**
 * Replacement for the native right-click menu.
 *
 * Registers a `contextmenu` listener at document level that suppresses the
 * webview's default menu — in a desktop app that menu is browser chrome nothing
 * applies to — and shows this one at the cursor instead. Only the actions that
 * mean something here are offered:
 *
 *   - an editable field gets cut / paste / select all, run through
 *     `navigator.clipboard` so it is not caught by the `ShortcutBlocker`, which
 *     suppresses the native `copy`/`cut` events outside editable fields;
 *   - a wallpaper card gets set-as-wallpaper / download, through the same
 *     backend pipeline as the card's own hover buttons.
 *
 * Web-shaped actions — copy link, copy image URL, open link in a browser — are
 * deliberately absent: there are no links to copy in a wallpaper app.
 *
 * Nothing under the cursor and no selection renders no menu at all, so a
 * right-click on blank space stays silent instead of popping a menu with one
 * helpful-for-nobody item.
 */
export function AppContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null)
  const [target, setTarget] = useState<ContextTarget | null>(null)
  // Measured after paint so the menu can be clamped to the viewport.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuSignal = useRef(0)

  // Only render the portal when window is defined (client-side)
  if (typeof window === "undefined") {
    return null
  }

  const menuItems = menu?.open ? buildMenuItems(target) : []

  const close = useCallback(() => {
    setMenu(null)
    setTarget(null)
  }, [])

  // Global right-click: suppress the native menu, show ours when the cursor is
  // over something actionable.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const target = inspectTarget(e.target)
      if (buildMenuItems(target).length === 0) {
        // Nothing useful under the cursor — don't open an empty menu.
        setMenu(null)
        setTarget(null)
        return
      }
      setTarget(target)
      setMenu({ open: true, x: e.clientX, y: e.clientY })
      // Bump so the size-measure effect below re-runs for this new menu.
      menuSignal.current += 1
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [])

  // Measure the menu once it is open so it stays inside the window, and hand
  // keyboard focus to the first item — a menu that opens without a focused
  // letter can only be dismissed, not used with the keyboard.
  useLayoutEffect(() => {
    if (!menu?.open || !menuRef.current) return
    setSize({
      width: menuRef.current.offsetWidth,
      height: menuRef.current.offsetHeight,
    })
    menuRef.current
      .querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true })
  }, [menu?.open, menuSignal.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss on outside interaction, scroll, resize, or Escape. A mousedown that
  // lands *inside* the menu is not a reason: it is about to select an item, and
  // closing on it would unmount the menu between the mousedown and the click, so
  // the action would never run.
  useEffect(() => {
    if (!menu?.open) return

    const isInside = (e: Event) =>
      e.target instanceof Node &&
      Boolean(menuRef.current?.contains(e.target))

    const closeOnOutside = (e: MouseEvent) => {
      if (!isInside(e)) close()
    }
    const closeOnScroll = (e: WheelEvent) => {
      if (!isInside(e)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("mousedown", closeOnOutside, true)
    window.addEventListener("wheel", closeOnScroll, true)
    window.addEventListener("resize", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", closeOnOutside, true)
      window.removeEventListener("wheel", closeOnScroll, true)
      window.removeEventListener("resize", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu?.open, close])

  // Arrow keys move focus between the items — Enter/Space then act on the
  // focused button, which a native `<button>` does on its own.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ??
        []
    )
    if (buttons.length === 0) return
    let index = buttons.findIndex((button) => button === document.activeElement)
    if (index === -1) {
      index = e.key === "ArrowDown" ? -1 : 0
    }
    index =
      e.key === "ArrowDown"
        ? (index + 1) % buttons.length
        : (index - 1 + buttons.length) % buttons.length
    buttons[index].focus({ preventScroll: true })
  }

  return createPortal(
    <div className="fixed inset-0 z-50" style={{ pointerEvents: "none" }}>
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        data-open={menu?.open ? "true" : undefined}
        onKeyDown={onMenuKeyDown}
        className={cn(
          "bg-popover text-popover-foreground min-w-40 origin-(--transform-origin) rounded-lg p-1 shadow-md ring-1 ring-foreground/10",
          "fixed data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          menu?.open ? "pointer-events-auto block" : "hidden"
        )}
        style={{
          left: Math.max(4, Math.min(menu?.x ?? 0, window.innerWidth - size.width - 8)),
          top: Math.max(4, Math.min(menu?.y ?? 0, window.innerHeight - size.height - 8)),
        }}
      >
        {menuItems.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-col">
            {groupIndex > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
            {group.map((item) => (
              <button
                key={item.key}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  close()
                  item.action()
                }}
                className={cn(
                  "group/context-menu-item flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none",
                  "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                  item.destructive && "text-destructive"
                )}
              >
                <span className="pointer-events-none shrink-0 [&_svg]:size-4">
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && (
                  <span className="ml-auto pl-4 text-xs tracking-widest text-muted-foreground">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}

type MenuItem = {
  key: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  destructive?: boolean
  action: () => void
}

/**
 * The actions a right-click under this target offers, grouped so a divider can
 * be drawn between unrelated sets. Returns an empty list when nothing is
 * actionable — the menu then stays closed.
 */
function buildMenuItems(target: ContextTarget | null): MenuItem[][] {
  if (!target) return []
  const groups: MenuItem[][] = []

  // A selected input gets the clipboard trio the native menu would have offered.
  if (target.input) {
    const input = target.input
    groups.push([
      {
        key: "cut",
        label: "Cut",
        icon: <Scissors />,
        shortcut: "Ctrl+X",
        action: () => cutFromInput(input),
      },
      {
        key: "copy",
        label: "Copy",
        icon: <Copy />,
        shortcut: "Ctrl+C",
        action: () => copyFromInput(input),
      },
      {
        key: "paste",
        label: "Paste",
        icon: <ClipboardPaste />,
        shortcut: "Ctrl+V",
        action: () => void pasteInto(input),
      },
      {
        key: "selectAll",
        label: "Select all",
        icon: <TextCursorInput />,
        shortcut: "Ctrl+A",
        action: () => input.select(),
      },
    ])
  } else if (target.selection) {
    // Selected text outside an input still deserves a Copy.
    groups.push([
      {
        key: "copy",
        label: "Copy",
        icon: <Copy />,
        shortcut: "Ctrl+C",
        action: () => void copySelection(),
      },
    ])
  }

  // A wallpaper under the cursor gets the app's two real actions, through the
  // same backend pipeline as the card's hover buttons — the only download path
  // that writes a tracked file rather than hoping the webview honors an
  // `<a download>`.
  if (target.wallpaper) {
    const wallpaper = target.wallpaper
    groups.push([
      {
        key: "set",
        label: "Set as wallpaper",
        icon: <Monitor />,
        action: () => void applyFromContext(wallpaper, "set"),
      },
      {
        key: "download",
        label: "Download",
        icon: <Download />,
        action: () => void applyFromContext(wallpaper, "download"),
      },
    ])
  }

  return groups
}

/* ── Actions ───────────────────────────────────────────────────────────────── */

async function copyText(text: string, successTitle: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toastSuccess(successTitle)
  } catch (error: unknown) {
    toastError("Could not copy to clipboard", error)
  }
}

/** Copy text, with no toast for the common case (copied via an input event). */
async function copyTextSilent(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Nothing to fall back to; the caller decides how to surface it.
  }
}

async function copySelection(): Promise<void> {
  const text = window.getSelection()?.toString() ?? ""
  if (!text) {
    toastInfo("Nothing selected to copy")
    return
  }
  await copyText(text, "Copied")
}

function copyFromInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const value = start === end ? input.value : input.value.slice(start, end)
  input.setSelectionRange(0, input.value.length)
  void copyTextSilent(value).then(() => {
    input.setSelectionRange(start, start)
    toastSuccess("Copied")
  })
}

function cutFromInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? start
  const text = input.value.slice(start, end)
  if (!text) {
    toastInfo("Nothing selected to cut")
    return
  }
  const next = input.value.slice(0, start) + input.value.slice(end)
  input.value = next
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.focus()
  input.setSelectionRange(start, start)
  void copyTextSilent(text).then(() => toastSuccess("Cut"))
}

async function pasteInto(
  input: HTMLInputElement | HTMLTextAreaElement
): Promise<void> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch (error: unknown) {
    toastError("Could not read your clipboard", error)
    return
  }
  if (!text) {
    toastInfo("Your clipboard is empty")
    return
  }

  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  input.value = input.value.slice(0, start) + text + input.value.slice(end)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.focus()
  const caret = start + text.length
  input.setSelectionRange(caret, caret)
  toastSuccess("Pasted")
}

/**
 * Set or apply a wallpaper from the menu, mirroring the two actions on the
 * card's hover buttons so both entry points behave — and toast — identically.
 */
async function applyFromContext(
  wallpaper: CombinedWallpaper,
  action: "set" | "download"
): Promise<void> {
  try {
    const fitMode = useSettings.getState().fitMode
    const record =
      action === "set"
        ? await applyWallpaper(wallpaper, fitMode)
        : await saveWallpaperCopy(wallpaper)

    if (action === "set") {
      toastSuccess("Wallpaper applied", FIT_MODE_LABELS[fitMode])
    } else {
      toastSuccess(`Saved ${record.filename}`, parentDir(record.path))
    }
  } catch (error: unknown) {
    toastError(
      action === "set"
        ? `${wallpaper.title} could not be set as your wallpaper`
        : `${wallpaper.title} could not be downloaded`,
      error
    )
  }
}
