# @luv1211/dsh-pet

English | [中文](README.zh.md)

Settings-backed desktop-pet domain. It owns the durable pet preference, the validated built-in and user package catalog, and the activity read model consumed by browser and desktop companion clients. The service adds no model-visible state.

## Service contract

`ctx.pets` is the single writer of the global `pet` settings namespace. The durable preference is `{ version: 3, selectedPetId, awake, sizePx }`; a missing section defaults to the awake built-in `deepseek-whale` at 112 CSS pixels. Any stored preference whose version is not 3 fails during service setup instead of being migrated. Empty ids, invalid sizes, and ids absent from the loaded catalog fail during service setup or mutation.

The catalog always contains the embedded `deepseek-whale` package and may contain validated packages under the configured `<dshHome>/pets` root. A package consists of `pet.json` and the WebP named by its safe manifest-relative `spritesheetPath`; the closed manifest accepts `id`, `displayName`, `description`, `spritesheetPath`, `frame`, and `animations`, plus the Codex-authored `kind` and `spriteVersionNumber` fields, which are parsed but ignored. The WebP must be a complete image of 192×208 cells in an 8-column grid; the standard nine-row 1536×1872 atlas and the eleven-row v2 1536×2288 atlas are both accepted, and a manifest without a `frame` derives its rows and columns from the decoded image. The host rejects oversized files from metadata before reading them, checks bounded image headers through `image-dimensions`, fully decodes user-package pixels with Sharp in an isolated process, and enforces identifier, text, containment, and regular-file rules before `@luv1211/dsh-pet-compat` validates geometry, paths, animation frames, and fallbacks. `maxManifestBytes`, `maxSpriteBytes`, and `decodeTimeoutMs` configure the three host-side resource limits. A package directory may be named `<id>.codex-pet` or any other directory name; the manifest id is authoritative, dot-prefixed directories (including stale `.tmp` residue) are skipped, duplicate ids are excluded. User packages are loaded in deterministic id order, malformed packages are excluded silently, and imports validate before publishing through a temporary directory and atomic rename. Catalog descriptors carry their `builtin` or `user` origin, immutable frame and animation metadata, and origin-relative asset URLs. Clients never supply paths — the native picker resolves packages host-side — and the read model exposes exactly one display-only path: the user package root.

`pets.getSnapshot()` returns detached preference, catalog, user package root, host capability flags, and deterministically ordered activity records. `pets.getCatalog()` returns the detached catalog. `pets.selectPet(id)`, `pets.setSize(sizePx)`, and `pets.setAwake(awake)` serialize complete preference writes and return the committed snapshot. `pets.importPetPackage()` asks an optional native host to select package bytes and reports `published`, `cancelled`, or `host-unavailable`. `pets.refreshCatalog()` rescans the user root without a restart; a dropped package that fails validation stays absent without explanation. `pets.updatePetPackage(id)` asks the same native host to pick replacement bytes for one existing user package and swaps them in place through a fixed three-rename sequence: a synchronous failure leaves the old content intact, the package is briefly absent between two renames, and crash residue is a same-id `.tmp` directory that the next replacement of that id sweeps. A picked manifest whose id differs from the target, or any non-user target, fails before anything is written. `pets.openPetFolder()` asks the same host to open the DSH-owned package directory and reports `opened` or `host-unavailable`.

The optional `petActivity` service key supplies a host-owned activity projection. Without it, the domain adapter observes the existing `session/event` and `session/disposed` streams: turn start becomes `running`, blocked or error completion becomes `blocked`, other completion becomes `ready`, and disposal removes the record. A host projection can additionally report pending interaction and user-facing titles. The records are presentation state and are not written back as session events.

Every preference or activity publication emits `pet/update`. Companion clients consume the snapshot and event through the generated `pets` Remote namespace. The desktop companion page (`/__dsh/pet/overlay`) polls `/__dsh/pet/overlay-state`, and its right-click close item tucks the pet through `POST /__dsh/pet/overlay-awake`, which accepts only an `application/json` body of exactly `{ awake: boolean }` so a cross-site POST cannot reach it. Native import and folder actions are capability-gated; browser-only compositions leave the native service absent and expose neither action as available.

## Extension points

Provide `petActivity` when the host already owns a richer session projection. Provide `petNative` only from a trusted local host; its picker returns bytes rather than a client-controlled path, and its folder opener receives the service-owned package root. The desktop companion registry is optional, so the domain also runs in a browser composition with the same catalog and activity Remote API.

## Model Experience

None, as the pet domain stores local preferences and presentation state only.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Default activity fallback** — the built-in adapter covers session lifecycle events; richer pending-interaction and title data requires a host-provided `petActivity` projection.
- **External catalog edits** — packages are discovered at startup, after an import or replacement, and on an explicit refresh; there is no remove operation, no external-directory watch, and a package that fails validation stays absent without explanation.
- **Desktop window** — an always-on-top transparent window still requires the Electron companion shell; browser compositions keep the native actions unavailable.
