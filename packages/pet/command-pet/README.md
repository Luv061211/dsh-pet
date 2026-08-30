# @deepseek-ai/dsh-command-pet

English | [中文](README.zh.md)

Human-facing `/pet` command for the optional desktop companion. `/pet` and `/pet toggle` switch its wake state; `/pet wake`, `/pet tuck`, and `/pet status` are explicit alternatives. It does not create gameplay, progression, feeding, names, or species changes.

## Scope

The command changes only the durable `awake` preference owned by `@deepseek-ai/dsh-pet`. The desktop companion itself is supplied by `@deepseek-ai/dsh-pet-desktop` in a desktop-capable DSH profile.

## Model Experience

None, as the command contributes no tool, prompt section, or model-visible input.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Awake-only surface** — the command changes only the durable `awake` preference; pet selection, size, import, and package-folder actions belong to the browser UI and the `pets` Remote API.
