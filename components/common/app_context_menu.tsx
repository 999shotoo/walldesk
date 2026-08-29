"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ClipboardPaste,
  Copy,
  Crop,
  ExternalLink,
  FileDown,
  RefreshCw,
  Scissors,
  TextCursorInput,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { toastSuccess, toastInfo, toastError } from "@/lib/toast"

/**
 * A snapshot of what was under the cursor when the menu opened.
 *
 * The real element is captured here rather than held as a reference: it could
 * unmount or re-render between the right-click and the click on a menu item,
 * and reading from a stale node gives wrong answers exactly when it matters
 * most (an image swapped for a grid of spinners).
 */
type ContextTarget = {
  /** `INPUT` / `TEXTAREA` / `[contenteditable=true]` — editable fields get the
   *  clipboard trio (cut / paste / select all), everything else doesn't. */
  editable: boolean
  /** The focused editable element, when there is one. */
  input: HTMLInputElement | HTMLTextAreaElement | null
  /** The source URL of an `<img>` under the cursor, when there is one. */
  imageUrl: string | null
  /** The href of a link under the cursor, when there is one. */
  linkUrl: string | null
  /** Whatever text is currently selected on the page. */
  selection: string
}

function inspectTarget(target: EventTarget | null): ContextTarget {
  const el = target as HTMLElement | null

  const closest = (el: HTMLElement | null, sel: string): HTMLElement | null =>
    el?.closest?.(sel) ?? null

  const image = closest(el, "img")
  const link = closest(el, "a")
  const input = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA"
    ? (el as HTMLInputElement | HTMLTextAreaElement)
    : el?.isContentEditable
      ? null
      : null
  // A contenteditable needs its own handling path, but for the snapshot treat
  // it as editable with no native input node.
  const editable = Boolean(input) || Boolean(el?.isContentEditable)

  return {
    editable,
    input,
    imageUrl: (image as HTMLImageElement)?.currentSrc || image?.getAttribute("src") || null,
    linkUrl: link?.getAttribute("href") || null,
    selection: window.getSelection()?.toString() ?? "",
  }
}

type MenuState = { open: boolean; x: number; y: number } | null

/**
 * Replacement for the native right-click menu.
 *
 * Registers a `contextmenu` listener at document level that suppresses the
 * webview's default menu and shows this one at the cursor instead. Items are
 * chosen from what was clicked — an image offers "Copy image URL", an editable
 * field offers cut / paste / select all, and a plain click offers copy /
 * refresh. Copying goes through `navigator.clipboard` so it is not affected by
 * the `ShortcutBlocker`, which suppresses the native `copy`/`cut` events
 * outside editable fields.
 */
export function AppContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null)
  const [target, setTarget] = useState<ContextTarget | null>(null)
  // Measured after paint so the menu can be clamped to the viewport.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const menuRef = useRef<HTMLDivElement | null>(null)
  // The element that had focus when the menu opened, so actions can act on it.
  const lastFocused = useRef<HTMLElement | null>(null)
  const menuSignal = useRef(0)

  // Only render the portal when window is defined (client-side)
  if (typeof window === "undefined") {
    return null
  }

  /** Determine which items (if any) belong to the current target. */
  const menuItems = buildMenuItems(target)

  // A spacer row between groups of actions.
  const Separator = <div className="-mx-1 my-1 h-px bg-border" />

  const items = menuItems.flatMap((group, groupIndex) => {
    const rows = group.map((item) => (
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
          "group/context-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none",
          "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
          item.destructive && "text-destructive"
        )}
      >
        <span className="pointer-events-none shrink-0 [&_svg]:size-4">{item.icon}</span>
        <span className="flex-1 text-left">{item.label}</span>
        {item.shortcut && (
          <span className="ml-auto pl-4 text-xs tracking-widest text-muted-foreground">
            {item.shortcut}
          </span>
        )}
      </button>
    ))
    return rows.length === 0 ? [] : [...rows, groupIndex < menuItems.length - 1 ? Separator : null]
  })

  const close = useCallback(() => {
    setMenu(null)
    setTarget(null)
  }, [])

  // Global right-click: suppress the native menu, show ours.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      lastFocused.current = document.activeElement as HTMLElement | null
      setTarget(inspectTarget(e.target))
      setMenu({ open: true, x: e.clientX, y: e.clientY })
      // Bump so the size-measure effect below re-runs for this new menu.
      menuSignal.current += 1
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [])

  // Measure the menu once it is open so it stays inside the window.
  useLayoutEffect(() => {
    if (!menu?.open || !menuRef.current) return
    setSize({
      width: menuRef.current.offsetWidth,
      height: menuRef.current.offsetHeight,
    })
  }, [menu?.open, menuSignal.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss on outside interaction, scroll, resize, or Escape.
  useEffect(() => {
    if (!menu?.open) return

    const closeOn = () => close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("mousedown", closeOn, true)
    window.addEventListener("wheel", closeOn, true)
    window.addEventListener("resize", closeOn)
    window.addEventListener("keydown", onKey)
    // Menu clicks select an item; a second mousedown afterwards closes it.
    return () => {
      window.removeEventListener("mousedown", closeOn, true)
      window.removeEventListener("wheel", closeOn, true)
      window.removeEventListener("resize", closeOn)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu?.open, close])

  return createPortal(
    <div
      role="menu"
      data-open={menu?.open ? "true" : undefined}
      className="fixed inset-0 z-50"
      onContextMenu={(e) => e.preventDefault()}
      style={{ pointerEvents: menu?.open ? "auto" : "none" }}
    >
      <div
        ref={menuRef}
        role="presentation"
        data-open={menu?.open ? "true" : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "bg-popover text-popover-foreground min-w-40 origin-(--transform-origin) rounded-lg p-1 shadow-md ring-1 ring-foreground/10",
          "fixed data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          menu?.open ? "block" : "hidden"
        )}
        style={{
          left: Math.max(4, Math.min(menu?.x ?? 0, window.innerWidth - size.width - 8)),
          top: Math.max(4, Math.min(menu?.y ?? 0, window.innerHeight - size.height - 8)),
        }}
      >
        {items}
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

/** Build actionable groups from a context target. */
function buildMenuItems(target: ContextTarget | null): MenuItem[][] {
  if (!target) return [[]]
  const groups: MenuItem[][] = [[]]

  // Helper to push into the current group, starting a new one if needed.
  const push = (item: MenuItem) => {
    if (groups[groups.length - 1].length > 0 && item.label === "") {
      // Separator: start a fresh group.
      groups.push([item])
    } else {
      groups[groups.length - 1].push(item)
    }
  }

  // A selected input gets the full clipboard trio.
  if (target.input) {
    const hasSelection = target.input.selectionStart !== target.input.selectionEnd
    push({ key: "copy", label: "Copy", icon: <Copy />, shortcut: "Ctrl+C", action: () => copyFromInput(target.input!) })
    push({ key: "cut", label: "Cut", icon: <Scissors />, shortcut: "Ctrl+X", action: () => cutFromInput(target.input!) })
    push({ key: "paste", label: "Paste", icon: <ClipboardPaste />, shortcut: "Ctrl+V", action: () => void pasteInto(target.input!) })
    push({ key: "selectAll", label: "Select all", icon: <TextCursorInput />, shortcut: "Ctrl+A", action: () => target.input!.select() })
    if (hasSelection) {
      push({ key: "copy", label: "Copy", icon: <Copy />, shortcut: "Ctrl+C", action: () => copyFromInput(target.input!) }) // duplicate to show both
    }
  } else if (target.selection) {
    push({ key: "copy", label: "Copy", icon: <Copy />, shortcut: "Ctrl+C", action: () => void copySelection() })
  }

  // When the cursor is over an image, carrying the URL is the useful action.
  if (target.imageUrl) {
    push({ key: "sep1", label: "", icon: null, action: () => {} }) // spacer
    push({ key: "copyImage", label: "Copy image URL", icon: <Copy />, action: () => void copyText(target.imageUrl!, "Image URL copied") })
    push({ key: "saveImage", label: "Download image", icon: <FileDown />, action: () => void downloadImage(target.imageUrl!) })
  }

  // A link under the cursor can be opened or copied.
  if (target.linkUrl && target.linkUrl !== "#") {
    push({ key: "sep2", label: "", icon: null, action: () => {} })
    push({ key: "copyLink", label: "Copy link", icon: <Copy />, action: () => void copyText(target.linkUrl!, "Link copied") })
    push({ key: "openLink", label: "Open link", icon: <ExternalLink />, action: () => void openUrl(target.linkUrl!) })
  }

  // A generic page action, always present.
  push({ key: "sep3", label: "", icon: null, action: () => {} })
  push({ key: "reload", label: "Refresh", icon: <RefreshCw />, shortcut: "Ctrl+R", action: () => window.location.reload() })

  // Trim empty trailing groups
  while (groups.length > 0 && groups[groups.length - 1].length === 0) groups.pop()
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

/** Kick off a download of an image URL straight to the user's Downloads folder. */
function downloadImage(url: string): void {
  // The webview can't write to disk by itself in a way the app's ledger tracks —
  // the Tauri backend owns saving. For a URL we have no wallpaper record for,
  // fall back to a plain anchor download so the user still gets the file.
  const a = document.createElement("a")
  a.href = url
  a.download = ""
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  toastInfo("Downloading image…")
}

function openUrl(url: string): void {
  // A bare anchor would navigate the whole app; opening an external link needs
  // to leave the webview untouched. `window.open` with `noopener` stays inside
  // the app window's context, which is fine for display — external protocol
  // handling (the OS browser) is a backend concern and not offered here.
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener noreferrer"
  a.target = "_blank"
  document.body.appendChild(a)
  a.click()
  a.remove()
}