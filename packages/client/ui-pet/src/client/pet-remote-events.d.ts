/**
 * The pet surface's forwarded-event seat: `pet/update` rides the Host
 * assembly's forwarded-event allowlist in integrated compositions; this
 * standalone declaration keeps the client `$on` face typed.
 */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection {
    'pet/update': unknown
  }
}

export {}
