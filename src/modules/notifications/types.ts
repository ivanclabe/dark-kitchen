/** One notice of the bell (ADR 0037), as dk_my_notifications() returns it. */
export interface AppNotification {
  /** Stable key that carries the state: when the state changes, it is new again. */
  key: string
  group: 'operation' | 'ai' | 'account'
  type: string
  severity: 'error' | 'warning' | 'info'
  title: string
  detail: string | null
  /** The AI feature that produced it («Sugerencias de Cocina en vivo»). */
  source?: string | null
  /** Where it leads, inside the account. */
  to: string
  action: string
  at: string
  /** A current condition (late orders now), not something that happened at `at`. */
  ongoing: boolean
  read: boolean
}

export interface NotificationFeed {
  generatedAt: string
  items: AppNotification[]
  unread: number
}
