# `@deepseek-ai/dsh-pet-tui`

English | [中文](README.zh.md)

This package is the minimal standalone terminal host for the DSH Codex-compatible pet consumer. It owns interactive-TTY lifecycle, one redraw queue, the `/pets` picker, composer and screen-bottom placement, Kitty/Sixel output, and deterministic text fallback. It does not import the agent loop, model, prompt, tool, session-log, or persistence packages.

The host accepts a validated `@deepseek-ai/dsh-pet-compat` package and a host-owned frame converter. Converted frames are written only after terminal capability detection; tmux, zellij, unsupported terminals, disabled images, and graphics write failures use text output. A stale preview request cannot replace the currently selected preview, and cleanup restores raw mode and the alternate screen at most once.

When animations are enabled, redraws follow each normalized track's `nextFrameInMs` cadence; pet changes, the picker, reduced motion, and disposal cancel pending timers.

The host exposes Codex's single notification slot through `setNotification` and `clearNotification`; running, waiting, review, and failed notifications select their recorded animation and expire after the source-derived lifetime.

Configuration is explicit: `tui.pet`, `tui.pet_anchor` (`composer` or `screen-bottom`), `tui.animations`, `reserveColumns`, `imageEnabled`, and `reducedMotion`. Defaults are exported as `DEFAULT_PET_TUI_CONFIG`. The package is a library surface because DSH currently has no shipped TUI application; an application profile can mount this host without changing the model or session pipeline.

## Model Experience

None, as the terminal pet host renders human-facing UI and registers no model-facing behavior.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The host does not decode WebP itself. The application-owned frame provider must convert a validated atlas cell to bytes suitable for Kitty or Sixel.
- The package does not provide a complete line editor or model-facing command dispatch. Slash commands remain host-local by design; a future TUI application owns those integrations.
