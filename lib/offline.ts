"use client"

import { create } from "zustand"
import { fetch } from "@tauri-apps/plugin-http"

/**
 * Where the probe goes.
 *
 * Wallhaven itself, not a general-purpose connectivity endpoint: this app is
 * useless without Wallhaven, so "can we reach the thing we need" is the question
 * worth asking. A router with no uplink, a captive portal, and Wallhaven being
 * down all produce the same answer, and the answer is the same either way — browse
 * does not work, downloads do.
 */
const PROBE_URL = "https://wallhaven.cc/api/v1/search?page=1"

/** Long enough for a slow connection, short enough not to hold the UI in limbo. */
const PROBE_TIMEOUT_MS = 6000

/**
 * How often to re-probe while offline.
 *
 * Needed because the `online` event is not reliable in the direction that
 * matters: an interface that stays up while the uplink comes back fires nothing at
 * all. Nothing polls while online, so this costs nothing in the normal case.
 */
const RECHECK_INTERVAL_MS = 20_000

/** Ignore repeat failure reports inside this window, so a burst fires one probe. */
const FAILURE_DEBOUNCE_MS = 5000

/**
 * Whether this is running inside the Tauri webview.
 *
 * The probe uses the Rust HTTP client, which does not exist in a plain browser —
 * so in a browser (the export preview, or the prerender pass) probing would fail
 * for reasons that have nothing to do with connectivity. There, `navigator.onLine`
 * is the only signal, and it is the honest one.
 */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/** The browser's guess. Optimistic when unknown, which is the safer default. */
function navigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

type OfflineState = {
  /**
   * Whether the network is usable. Starts optimistic: assuming offline before
   * anything has been checked would flash the offline UI on every launch.
   */
  online: boolean
  /** A probe is in flight, so `online` is about to be confirmed or corrected. */
  checking: boolean
  /** `true` once a real check has settled. Before that, `online` is a guess. */
  checked: boolean
  /**
   * Probe now and adopt the result. Returns the outcome so a caller can act on
   * it directly, e.g. a Retry button.
   */
  check: () => Promise<boolean>
  /**
   * Report that a request failed for what looks like a network reason.
   *
   * This is the "or something" case — the connection is nominally up but nothing
   * is getting through. It does not flip the app to offline on its own: it
   * triggers a probe, and the probe decides. A single rate-limited response should
   * not take the whole app offline.
   */
  reportFailure: () => void
}

export const useOffline = create<OfflineState>((set, get) => ({
  // Hardcoded `true` rather than `navigatorOnline()`: this is a static export, so
  // the first client render has to match prerendered HTML that was built with no
  // `navigator` at all. Reading it here would mismatch on launch for a machine
  // that starts offline. `watchConnectivity` corrects this from an effect, which
  // is after hydration and within the same frame.
  online: true,
  checking: false,
  checked: false,

  check: async () => {
    // `navigator.onLine` is unreliable when it says *yes* — it only means an
    // interface exists. When it says *no* it is trustworthy, and it saves a
    // request that cannot succeed.
    if (!navigatorOnline()) {
      set({ online: false, checking: false, checked: true })
      lastCheckAt = now()
      return false
    }

    if (!inTauri()) {
      set({ online: true, checking: false, checked: true })
      lastCheckAt = now()
      return true
    }

    if (get().checking) return get().online

    set({ checking: true })
    let reachable = false
    try {
      // HEAD, because only the fact of a reply matters. And *any* reply counts:
      // a 429 or a 500 still proves packets are moving, which is the question
      // being asked here — not whether the API is healthy.
      await fetch(PROBE_URL, { method: "HEAD", connectTimeout: PROBE_TIMEOUT_MS })
      reachable = true
    } catch {
      reachable = false
    }

    lastCheckAt = now()
    set({ online: reachable, checking: false, checked: true })
    return reachable
  },

  reportFailure: () => {
    if (get().checking) return
    if (now() - lastCheckAt < FAILURE_DEBOUNCE_MS) return
    void get().check()
  },
}))

/**
 * `Date.now` behind a function so the store body stays free of direct clock reads,
 * and so the debounce is easy to reason about in one place.
 */
function now(): number {
  return Date.now()
}

let lastCheckAt = 0
let watching = false

/**
 * Begin watching connectivity. Idempotent, and never torn down.
 *
 * No teardown on purpose: this window lives for as long as the app does, and the
 * alternative — unsubscribing on unmount — would trade a listener for a class of
 * bug where the app silently stops noticing the network. `AppBoot` calls this
 * once.
 */
export function watchConnectivity(): void {
  if (watching || typeof window === "undefined") return
  watching = true

  // Going offline is the one transition `navigator` reports accurately, so take
  // it at face value rather than waiting on a probe that cannot succeed.
  window.addEventListener("offline", () => {
    useOffline.setState({ online: false, checking: false, checked: true })
  })

  // Coming back is the unreliable direction — confirm it before re-enabling
  // everything, or the app fetches into a dead connection and shows errors.
  window.addEventListener("online", () => {
    void useOffline.getState().check()
  })

  window.setInterval(() => {
    if (!useOffline.getState().online) void useOffline.getState().check()
  }, RECHECK_INTERVAL_MS)

  void useOffline.getState().check()
}

/**
 * Whether the app should be in offline mode.
 *
 * A hook of its own because this is the question nearly every caller has, and
 * `!online` at each of them reads worse.
 */
export function useIsOffline(): boolean {
  return useOffline((state) => !state.online)
}
