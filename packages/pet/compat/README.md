# @luv1211/dsh-pet-compat

English | [中文](README.zh.md)

`@luv1211/dsh-pet-compat` is a browser-safe value library for DSH-owned pet packages that use Codex-compatible 192×208, 8×9 sprite atlases. It parses host-normalized manifest data, selects animation frames, applies the Codex single-slot notification lifetimes and replacement rule, derives cache keys from host-provided digests, and selects a terminal image protocol from host-provided terminal facts. Its exported normalized default tracks are the single animation source shared by the browser, Electron, and TUI consumers; `FRAME_AT_SOURCE` is used when the Electron overlay must run the selector inside an inline document.

Hosts own filesystem reads, image decoding, hashing, timers, and asynchronous request ordering. The library accepts only committed values, imports neither Node APIs nor Codex files, and does not create model-visible, session, or durable state.

## Model Experience

None, as the browser-safe compatibility library parses and renders pet values without registering model-facing behavior.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Host-owned I/O** — callers must decode spritesheet dimensions and calculate the content digest before calling this package; the browser-safe entry never reads package directories or image bytes.
