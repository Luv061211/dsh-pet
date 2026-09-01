# @luv1211/dsh-client-ui-pet

English | [中文](README.zh.md)

Browser controls for the optional desktop pet companion. The package registers a feature-owned `Pet` section in `settings.section` and a keyed chat command-input row in `conversation.chat.node`. It reads `PetSnapshot` and sends mutations through the pet package's same-origin JSON API; polling converges changes made by other Host consumers. The draggable sprite itself is not a web registration — it renders in the always-on-top Electron companion window, never as a floating web overlay.

The settings shell receives a feature-owned `Pet` section from this plugin. It uses the same snapshot and mutation callbacks as the rest of the surface: a bordered row list renders each package's avatar, name, and description with a Select action and a disabled Selected marker on the active row; the group header carries a refresh control that rescans the user package root and a wake/sleep toggle; user rows grow an Update action when the host advertises native actions; a custom-pets footer shows the managed root path with import and open-folder actions; and an Appearance group keeps the sprite-size slider.

A complete package is a directory containing `pet.json` and a 1536×1872 WebP atlas. The manifest declares the package `id`, `displayName`, optional `description` and `animations`, and a safe relative `spritesheetPath`; the host reads the manifest-declared file and sends bytes to `@luv1211/dsh-pet` for validation and atomic publication. The HTTP API accepts no client-supplied paths — the native picker resolves packages host-side — and the snapshot exposes only the managed root path for display. See [`@luv1211/dsh-pet`](../../pet/pet/README.md) for the durable package and validation contract.

The native transparent, always-on-top sprite window belongs to the desktop companion bridge and renders `@luv1211/dsh-pet`'s `/__dsh/pet/overlay` page. Browser sessions retain the same catalog, activity, and wake/tuck controls without attempting to create a system window; native-only controls remain hidden when the snapshot advertises no host capability.

The plugin also projects persisted `/pet` command runs into a keyed chat input row before the generic command result. This presentation projection restores on reload and does not create a user message or a model turn.

## Model Experience

None, as the surface renders client state only and adds no tool, prompt text, or model-visible input.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Native smoke coverage** — Browser and helper tests cover the protocol, but a Windows Electron smoke test is still required to verify OS-level pointer forwarding and multi-display restoration.
- **Browser host actions** — The settings page keeps native-only package actions hidden without a native directory-picker; a browser composition offers catalog selection, refresh, and wake state only.
