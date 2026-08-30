/** Host activity projection adapter consumed by the pet domain. */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { PetActivitySource, PetHostActivityRecord } from './types.ts'

/**
 * Owns detached host activity records and publishes whole replacements. When
 * constructed with a Context, it supplies the existing session lifecycle as
 * the default host producer; a richer host projection can instead be
 * provided to PetService through the `petActivity` service key.
 */
export class PetActivityProjection implements PetActivitySource {
  private readonly records = new Map<string, PetHostActivityRecord>()
  private readonly listeners = new Set<(records: readonly PetHostActivityRecord[]) => void>()

  /**
   * @param ctx - optional host context for the default session producer.
   */
  constructor(ctx?: Context) {
    if (ctx === undefined) return
    ctx.on('session/event', (session, event) => { this.observe(session, event) }, { global: true })
    ctx.on('session/disposed', (session) => { this.forget(session) }, { global: true })
  }

  /** Read a detached activity projection. */
  getSnapshot(): readonly PetHostActivityRecord[] {
    return [...this.records.values()].map(record => ({ ...record }))
  }

  /** Subscribe to whole detached projection replacements. */
  subscribe(listener: (records: readonly PetHostActivityRecord[]) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Publish one host-owned replacement after its producer commits.
   * @param records - detached records replacing the current projection.
   */
  publish(records: readonly PetHostActivityRecord[]): void {
    this.records.clear()
    for (const record of records) this.records.set(String(record.sessionId), { ...record })
    this.notify()
  }

  private observe(session: Session, event: SessionEvent): void {
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return
    const record: PetHostActivityRecord = event.type === 'turn/start'
      ? { sessionId: session.id, title: String(session.id), status: 'running', since: event.time, completed: false }
      : {
        sessionId: session.id,
        title: String(session.id),
        status: event.data.reason.kind === 'blocked' || event.data.reason.kind === 'error' ? 'blocked' : 'idle',
        since: event.time,
        completed: event.data.reason.kind !== 'blocked' && event.data.reason.kind !== 'error',
      }
    this.records.set(String(session.id), record)
    this.notify()
  }

  private forget(session: Session): void {
    if (this.records.delete(String(session.id))) this.notify()
  }

  private notify(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
