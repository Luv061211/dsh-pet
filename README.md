# dsh-pet — DeepSeek Harness 桌面宠物插件 / Desktop Pet Plugin

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议）的 Codex 风格桌面宠物伴侣插件家族。随仓库发布的唯一内置宠物是 **DeepSeek Whale**（小鲸鱼）；用户还可以向本地 DSH 管理目录导入经过校验的宠物包——这些包只存在于本机，永远不会随本仓库发布。

### 包一览

| 包 | 职责 |
|---|---|
| [`@luv1211/dsh-pet`](packages/pet/pet/README.zh.md) | `ctx.pets` Service Definition：持久化 v3 偏好、已校验包目录、实时活动读模型、`pet/update` 事件、Typert Remote 服务 |
| [`@luv1211/dsh-pet-compat`](packages/pet/compat/README.zh.md) | 浏览器安全的 Codex 兼容包解析、帧调度、终端协议探测 |
| [`@luv1211/dsh-command-pet`](packages/pet/command-pet/README.zh.md) | `/pet` 唤醒 / 收起 / 状态斜杠命令 |
| [`@luv1211/dsh-pet-tui`](packages/pet/pet-tui/README.zh.md) | 独立终端宠物宿主（库接口） |
| [`@luv1211/dsh-client-ui-pet`](packages/client/ui-pet/README.zh.md) | 浏览器界面：设置页与 `/pet` 命令输入投影 |
| [`@luv1211/dsh-pet-desktop`](packages/bundle/pet-desktop/README.zh.md) | Profile bundle：把伴侣注册表挂在 pet 行之前 |
| [`@luv1211/dsh-desktop-companion`](packages/desktop/companion/README.zh.md) | 可选的伴侣窗口描述符注册表 |
| [`desktop/`](desktop/README.md) | 可选 Electron 桌面壳，承载可拖拽伴侣窗口 |

### 使用

发布后，各包以 `@luv1211` scope（`@luv1211/dsh-pet`、`@luv1211/dsh-pet-desktop` 等）从 npm 安装。插件家族运行在 DeepSeek Harness 组合之内。目前最简单的方式是把 DeepSeek Harness 与本仓库并排克隆，然后在你的 profile 中组合宠物行：

```yaml
- id: desktop-companion
  name: '@luv1211/dsh-desktop-companion'

- id: pet
  name: '@luv1211/dsh-pet'
  config:
    petRoot: '<your-dsh-home>/pets'

- id: command-pet
  name: '@luv1211/dsh-command-pet'

- id: ui-pet
  name: '@luv1211/dsh-client-ui-pet'
```

`desktop-companion` 行必须先于 `pet` 行加载——pet 服务在插件加载时读取注册表以注册可拖拽伴侣窗口。端到端参考实现（含 api-remotes 客户端接线）见 [Luv061211/deepseek-harness 的 `feat/pet-companion` 分支](https://github.com/Luv061211/deepseek-harness/tree/feat/pet-companion)。

经过校验的用户包是一个包含 `pet.json` 与其清单所指向 WebP 精灵图的目录（192×208 单元、8 列、9 或 11 行）。把它放到配置的 `petRoot` 下，再在设置页刷新目录即可。当宿主组合提供原生目录选择能力时，原生导入、原地替换与打开文件夹操作会出现。

### 开发

```sh
pnpm install
pnpm typecheck   # 跨家族类型检查
pnpm test        # 宿主侧 vitest 套件（浏览器界面套件作为类型检查参考）
pnpm build       # 每个包 tsc + tsdown 构建
```

`packages/client/ui-pet/tests` 下的浏览器界面套件在本仓库中只做类型检查，执行需要在 harness 工作区内进行——npm 发布的客户端包是 window 加载器 bundle 格式，而非源码态 ESM。

### 限制

- 基于 DeepSeek Harness `0.1.1-rc.2`（npm 已发布线）构建；本家族以 `@luv1211` npm scope 发布；上游 master 已演进到 `0.1.2-alpha.1` 并更名了若干客户端内部结构，本仓库跟随已发布线。
- Typert Remote 客户端产物（`./typert`、`./remote`）目前以手写声明 `packages/pet/pet/remote-client.d.ts` 提供；运行时挂载由 harness 侧 api-remotes 组合完成（见参考 fork）。
- 没有外部目录监听：目录在启动、导入或替换之后、以及显式刷新时更新。

<a id="english"></a>
## English

A Codex-style desktop pet companion plugin family for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT). The only shipped pet is the built-in **DeepSeek Whale**; users can additionally import validated packages into a local, DSH-owned directory — those stay on the local machine and are never published.

### Packages

| Package | Role |
|---|---|
| [`@luv1211/dsh-pet`](packages/pet/pet/README.md) | `ctx.pets` Service Definition: durable v3 preference, validated package catalog, live session-activity read model, `pet/update` events, Typert Remote service |
| [`@luv1211/dsh-pet-compat`](packages/pet/compat/README.md) | Browser-safe Codex-compatible package parser, frame scheduler, terminal protocol detection |
| [`@luv1211/dsh-command-pet`](packages/pet/command-pet/README.md) | The `/pet` wake / tuck / status slash command |
| [`@luv1211/dsh-pet-tui`](packages/pet/pet-tui/README.md) | Standalone terminal pet host (library surface) |
| [`@luv1211/dsh-client-ui-pet`](packages/client/ui-pet/README.md) | Browser surface: settings section and `/pet` command-input projection |
| [`@luv1211/dsh-pet-desktop`](packages/bundle/pet-desktop/README.md) | Profile bundle mounting the companion registry ahead of the pet row |
| [`@luv1211/dsh-desktop-companion`](packages/desktop/companion/README.md) | Optional companion-window descriptor registry |
| [`desktop/`](desktop/README.md) | Optional Electron desktop shell that hosts the draggable companion window |

### Using it

The packages install from npm under the `@luv1211` scope (`@luv1211/dsh-pet`, `@luv1211/dsh-pet-desktop`, ...). The plugin family runs inside a DeepSeek Harness composition. Today the simplest path is to clone DeepSeek Harness and this repository side by side, then compose the pet rows from your profile (see the YAML above).

The `desktop-companion` row must load before `pet` — the pet service reads the registry once at plugin-load time to register the draggable companion window. A working end-to-end reference (including the api-remotes client wiring) lives at [Luv061211/deepseek-harness, branch `feat/pet-companion`](https://github.com/Luv061211/deepseek-harness/tree/feat/pet-companion).

A validated user package is a directory with `pet.json` and the WebP spritesheet its manifest names (192×208 cells, 8 columns, 9 or 11 rows). Drop it under the configured `petRoot`, then refresh the catalog from the settings page. Native import, in-place replacement, and folder opening appear when the host composition serves the native directory-picker capability.

### Development

The commands are identical to the Chinese section above. The browser-surface specs under `packages/client/ui-pet/tests` are typechecked here but executed inside the harness workspace, because the npm-published client packages ship window-loader bundles rather than source-plane ESM.

### Limitations

- Built against DeepSeek Harness `0.1.1-rc.2` (the npm-published line); the family publishes under the `@luv1211` npm scope. The upstream master line moved to `0.1.2-alpha.1` and renamed several client internals; this repository tracks the published line.
- The generated Typert Remote client artifacts (`./typert`, `./remote`) ship as a hand-maintained declaration in `packages/pet/pet/remote-client.d.ts`; the runtime contribution is mounted by the harness-side api-remotes assembly in the reference fork.
- No external directory watcher: the catalog refreshes at startup, after an import or replacement, and on explicit refresh.

## 许可 / License

[MIT](LICENSE) —— DeepSeek Harness 的衍生作品 / a derivative work of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
