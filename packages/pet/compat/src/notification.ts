/** Codex-derived single-slot notification semantics. */

import type { PetNotification, PetNotificationKind, PetNotificationSpec } from './types.ts'

/** Source-derived notification semantics for Codex version 26.818.5229.0. */
export const PET_NOTIFICATION_SPECS: Readonly<Record<PetNotificationKind, PetNotificationSpec>> = Object.freeze({
  running: Object.freeze({ animation: 'running', label: 'Running', fallbackBody: 'Thinking', lifetimeMs: 3 * 60 * 1000 }),
  waiting: Object.freeze({ animation: 'waiting', label: 'Needs input', fallbackBody: 'Needs input', lifetimeMs: 24 * 60 * 60 * 1000 }),
  review: Object.freeze({ animation: 'review', label: 'Ready', fallbackBody: 'Ready', lifetimeMs: 7 * 24 * 60 * 60 * 1000 }),
  failed: Object.freeze({ animation: 'failed', label: 'Blocked', fallbackBody: 'Blocked', lifetimeMs: 60 * 60 * 1000 }),
})

/**
 * Return the immutable source-derived semantics for one notification kind.
 * @param kind - notification kind to resolve.
 * @returns source-derived animation, labels, and lifetime.
 */
export function notificationSpec(kind: PetNotificationKind): PetNotificationSpec {
  return PET_NOTIFICATION_SPECS[kind]
}

/**
 * Create a detached notification with the recorded fallback body.
 * @param kind - notification kind to commit.
 * @param updatedAtMs - epoch timestamp at which the notification was committed.
 * @param body - optional body that replaces the kind's fallback body.
 * @returns an immutable single-slot notification value.
 */
export function createNotification(kind: PetNotificationKind, updatedAtMs: number, body?: string): PetNotification {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs < 0) throw new TypeError('pet notification timestamp is invalid')
  const fallbackBody = PET_NOTIFICATION_SPECS[kind].fallbackBody
  return Object.freeze({ kind, updatedAtMs, body: body ?? fallbackBody })
}

/**
 * Return the current notification or `undefined` once its source-derived lifetime has elapsed.
 * @param notification - current single-slot notification, when present.
 * @param nowMs - epoch timestamp used for expiry evaluation.
 * @returns the visible notification or undefined after expiry.
 */
export function visibleNotification(notification: PetNotification | undefined, nowMs: number): PetNotification | undefined {
  if (notification === undefined) return undefined
  if (!Number.isFinite(nowMs)) return undefined
  return nowMs - notification.updatedAtMs >= PET_NOTIFICATION_SPECS[notification.kind].lifetimeMs
    ? undefined
    : notification
}

/**
 * Commit a later ambient notification over the prior single-slot value.
 * @param current - currently visible notification, if one exists.
 * @param incoming - newly committed notification.
 * @returns a detached notification that supersedes the previous value.
 */
export function replaceNotification(current: PetNotification | undefined, incoming: PetNotification): PetNotification {
  void current
  return Object.freeze({ ...incoming })
}
