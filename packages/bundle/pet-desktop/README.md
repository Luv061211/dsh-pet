# @luv1211/dsh-pet-desktop

English | [中文](README.zh.md)

The end-user installation bundle for the customizable `dsh-pet` system. Install it into the Web profile with `dsh plugin --profile web add @luv1211/dsh-pet-desktop`, then use the UI or `/pet` to select, wake, or tuck a pet. The bundled DeepSeek Whale is an example; the catalog also accepts validated local sprite-based pet packs.

The bundle composes the Codex-compatible 8×9 pet domain, command surface, and browser UI. It owns no default profile rows. The pet domain always exposes the built-in catalog and can load validated user packages from the DSH pet root. Its companion opens only in the DSH Electron desktop application; browser sessions retain catalog, activity, and preference controls without creating an always-on-top system window.

Native package import and package-folder opening are available only when the surrounding local host composition provides the native directory-picker capability. The browser profile advertises the capability flags and hides those controls when the provider is absent. Pet data is local to DSH and never reads Codex pet files.

## Model Experience

None, as the bundle only composes human-facing pet plugins.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Desktop-shell requirement** — transparent desktop presentation needs the Electron bridge composed by `dsh-web-app`.
- **External catalog edits** — package discovery occurs at startup and after an import; the bundle has no remove command or external-directory watcher.
