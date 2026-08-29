"use client"

import { Toast } from "@base-ui/react/toast"

/**
 * The app's one toast manager.
 *
 * Created here, in `lib`, rather than taken from the component that renders it:
 * the stores need to raise toasts and `lib` must not import from `components`.
 * Base UI's manager is designed for exactly this — it works outside React, so a
 * failure inside a zustand action can surface on its own without a component in
 * the middle to relay it through state.
 *
 * `components/ui/toast.tsx` pulls this instance in as `Toaster`'s default, so
 * there is one manager in the process no matter which module a caller imports.
 */
export const toast = Toast.createToastManager()

/**
 * How long each kind stays up, in milliseconds.
 *
 * A ladder rather than one number, ordered by how much there is to read and how
 * much it costs to miss it. Every one of these is shorter than Base UI's 5000
 * default except the two at the bottom, which need to be: the first sentence of
 * a success toast *is* the whole message, so it only has to survive being
 * glanced at, and anything longer is a notification sitting in the corner of a
 * desktop app for no reason.
 *
 * Errors get longer because they carry a path, an HTTP status or a permission
 * name in the description, and the toast dismisses itself whether or not the
 * user has finished reading. Undo gets longest because it is the only chance to
 * reverse a deleted file — it has to last long enough to notice, read, and act
 * on, which is three things rather than one.
 */
const TIMEOUTS = {
  success: 3000,
  info: 4000,
  error: 5000,
  undo: 6000,
} as const

/**
 * The readable half of a thrown value.
 *
 * `String(error)` on an `Error` prefixes "Error: ", which is noise in a message
 * the user is meant to take in at a glance. Non-`Error` throws — Tauri's
 * `invoke` rejects with a plain string — pass through unchanged.
 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Something worked. Title only, unless there is a detail worth reading. */
export function toastSuccess(title: string, description?: string): string {
  return toast.add({
    type: "success",
    title,
    description,
    timeout: TIMEOUTS.success,
  })
}

/** Something happened that is neither good nor bad. */
export function toastInfo(title: string, description?: string): string {
  return toast.add({
    type: "info",
    title,
    description,
    timeout: TIMEOUTS.info,
  })
}

/**
 * Something needs attention but isn't an error — e.g. an update available.
 * Longer timeout than info so the user has time to act.
 */
export function toastWarning(title: string, description?: string): string {
  return toast.add({
    type: "warning",
    title,
    description,
    timeout: TIMEOUTS.undo, // long enough to read and act
  })
}

/**
 * Something failed. `title` says what, in the app's own words; the thrown value
 * becomes the description, since it is the only place the real reason lives.
 */
export function toastError(title: string, error?: unknown): string {
  return toast.add({
    type: "error",
    title,
    description: error === undefined ? undefined : errorText(error),
    timeout: TIMEOUTS.error,
    // Announced urgently, unlike the two above: a screen reader user who has
    // moved on needs to hear that the thing they asked for did not happen.
    priority: "high",
  })
}

/**
 * Something is in progress. Returns the id to hand to `toastSettle`.
 *
 * A `loading` toast never auto-dismisses — the caller owns it until it settles.
 */
export function toastLoading(title: string, description?: string): string {
  return toast.add({ type: "loading", title, description })
}

/** Revise a pending toast in place — a progress figure, a changing step. */
export function toastProgress(
  id: string,
  update: { title?: string; description?: string }
): void {
  toast.update(id, update)
}

/**
 * Replace a pending toast with its outcome.
 *
 * Closes and re-adds rather than updating in place. `toast.update` does not
 * touch the timer the toast was created with, and a `loading` toast is created
 * with none — so updating one to `success` yields a toast that sits on screen
 * until it is dismissed by hand.
 */
export function toastSettle(
  id: string,
  outcome:
    | { kind: "success"; title: string; description?: string }
    | { kind: "error"; title: string; error?: unknown }
): string {
  toast.close(id)
  return outcome.kind === "success"
    ? toastSuccess(outcome.title, outcome.description)
    : toastError(outcome.title, outcome.error)
}

/**
 * Report a destructive action, with a single click to reverse it.
 *
 * The reason the app can delete a file on a hover button without a confirmation
 * dialog in front of it: the undo is offered after the fact instead of a
 * question before it, which costs nothing in the ordinary case where the user
 * meant it. The longest-lived of the toasts, for the reason given on `TIMEOUTS`.
 */
export function toastUndo(
  title: string,
  description: string | undefined,
  undo: () => void
): string {
  const id: string = toast.add({
    type: "info",
    title,
    description,
    timeout: TIMEOUTS.undo,
    actionProps: {
      children: "Undo",
      onClick: () => {
        // Dismissed by hand: the action it was offering has been taken, so
        // leaving it up invites a second click on something already done.
        toast.close(id)
        undo()
      },
    },
  })
  return id
}
