# @luv061211/dsh-desktop-companion

English | [中文](README.zh.md)

The Web-profile registry for one optional Electron companion renderer. It provides `ctx.desktopCompanion`; a feature calls `register({ id, entryPath, width, height, capabilities })`, and the local discovery route returns that descriptor until its disposer runs. Duplicate providers, external URLs, query-bearing paths, invalid dimensions, and invalid capability ranges fail during registration.

The generic capability object can advertise drag forwarding, pointer-interaction forwarding, and a bounded resize range. The registry has no pet knowledge and does not persist window state. The Electron shell validates the descriptor again before opening a transparent window, exposes only the capability-gated preload bridge, and owns placement persistence and display restoration.

## Model Experience

None, as this registry only serves local desktop discovery data.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **One companion** — the shell currently owns one constrained companion window; multiple concurrent desktop widgets require a separate composition decision.
