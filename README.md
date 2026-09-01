# dsh-pet — DeepSeek Harness 桌面宠物插件 / Desktop Pet Plugin

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议）的 Codex 风格桌面宠物伴侣插件家族。随仓库发布的唯一内置宠物是 **DeepSeek Whale**（小鲸鱼）；用户还可以向本地 DSH 管理目录导入经过校验的宠物包——这些包只存在于本机，永远不会随本仓库发布。

### 包一览

| 包 | 职责 |
|---|---|
| [`@luv1211/dsh-pet`](packages/pet/pet/README.zh.md) | `ctx.pets` Service Definition：持久化 v3 偏好、已校验包目录、实时活动读模型、`pet/update` 事件、同源 HTTP API |
| [`@luv1211/dsh-pet-compat`](packages/pet/compat/README.zh.md) | 浏览器安全的 Codex 兼容包解析、帧调度、终端协议探测 |
| [`@luv1211/dsh-command-pet`](packages/pet/command-pet/README.zh.md) | `/pet` 唤醒 / 收起 / 状态斜杠命令 |
| [`@luv1211/dsh-pet-tui`](packages/pet/pet-tui/README.zh.md) | 独立终端宠物宿主（库接口） |
| [`@luv1211/dsh-client-ui-pet`](packages/client/ui-pet/README.zh.md) | 浏览器界面：设置页与 `/pet` 命令输入投影 |
| [`@luv1211/dsh-pet-desktop`](packages/bundle/pet-desktop/README.zh.md) | Profile bundle：把伴侣注册表挂在 pet 行之前 |
| [`@luv1211/dsh-desktop-companion`](packages/desktop/companion/README.zh.md) | 可选的伴侣窗口描述符注册表 |
| [`desktop/`](desktop/README.md) | 可选 Electron 桌面壳，承载可拖拽伴侣窗口 |

### 使用

插件家族以 `@luv1211` scope 发布到 npm。`0.1.1-rc.3` 是修复发布版本：它包含所有运行时入口，并改用不依赖树外 Typert 生成物的同源浏览器 API。完整的变更、验证范围和已知限制见 [更新说明](docs/releases/0.1.1-rc.3.md)。

### 快速安装

需要 Node.js `^22.19.0` 或 `>=24`。普通用户只需要 npm；不需要克隆本仓库，也不需要安装 pnpm：

```sh
npm install --global @deepseek-ai/dsh@0.1.1-rc.2
dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
dsh web
```

第一条命令安装 `dsh` 命令。若 Windows 仍显示“`dsh` 不是内部或外部命令”，关闭并重新打开终端后再运行后两条命令；npm 的全局可执行目录需要重新加入该终端的 `PATH`。若只想临时运行，不安装全局命令，也可以使用：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.1-rc.2 -- dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
npm exec --yes --package=@deepseek-ai/dsh@0.1.1-rc.2 -- dsh web
```

安装 bundle 会安装其余运行时包并把 patch 加入指定的 DeepSeek Harness profile：

```sh
dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
```

如需手工组合，可在 profile 中使用以下行：

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

`desktop-companion` 行必须先于 `pet` 行加载——pet 服务在插件加载时读取注册表以注册可拖拽伴侣窗口。npm bundle 已按这个顺序提供配置。

经过校验的用户包是一个包含 `pet.json` 与其清单所指向 WebP 精灵图的目录（192×208 单元、8 列、9 或 11 行）。把它放到配置的 `petRoot` 下，再在设置页刷新目录即可。当宿主组合提供原生目录选择能力时，原生导入、原地替换与打开文件夹操作会出现。

### 开发

```sh
pnpm install
pnpm typecheck   # 跨家族类型检查
pnpm test        # 宿主侧 vitest 套件（浏览器界面套件作为类型检查参考）
pnpm build       # 每个包 tsc + tsdown 构建
pnpm release:verify # 发布前完整门禁：类型、测试、构建、tarball 与安装烟雾测试
```

`packages/client/ui-pet/tests` 下的浏览器界面套件在本仓库中只做类型检查，执行需要在 harness 工作区内进行——npm 发布的客户端包是 window 加载器 bundle 格式，而非源码态 ESM。

### 限制

- 基于 DeepSeek Harness `0.1.1-rc.2`（npm 已发布线）构建；本家族以 `@luv1211` npm scope 发布；上游 master 已演进到 `0.1.2-alpha.1` 并更名了若干客户端内部结构，本仓库跟随已发布线。
- 浏览器控制界面使用 `@luv1211/dsh-pet` 注册的同源 JSON API；发布不依赖树外 Typert 生成物。
- 没有外部目录监听：目录在启动、导入或替换之后、以及显式刷新时更新。

<a id="english"></a>
## English

A Codex-style desktop pet companion plugin family for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT). The only shipped pet is the built-in **DeepSeek Whale**; users can additionally import validated packages into a local, DSH-owned directory — those stay on the local machine and are never published.

### Packages

| Package | Role |
|---|---|
| [`@luv1211/dsh-pet`](packages/pet/pet/README.md) | `ctx.pets` Service Definition: durable v3 preference, validated package catalog, live session-activity read model, `pet/update` events, same-origin HTTP API |
| [`@luv1211/dsh-pet-compat`](packages/pet/compat/README.md) | Browser-safe Codex-compatible package parser, frame scheduler, terminal protocol detection |
| [`@luv1211/dsh-command-pet`](packages/pet/command-pet/README.md) | The `/pet` wake / tuck / status slash command |
| [`@luv1211/dsh-pet-tui`](packages/pet/pet-tui/README.md) | Standalone terminal pet host (library surface) |
| [`@luv1211/dsh-client-ui-pet`](packages/client/ui-pet/README.md) | Browser surface: settings section and `/pet` command-input projection |
| [`@luv1211/dsh-pet-desktop`](packages/bundle/pet-desktop/README.md) | Profile bundle mounting the companion registry ahead of the pet row |
| [`@luv1211/dsh-desktop-companion`](packages/desktop/companion/README.md) | Optional companion-window descriptor registry |
| [`desktop/`](desktop/README.md) | Optional Electron desktop shell that hosts the draggable companion window |

### Using it

The family is published to npm under the `@luv1211` scope. `0.1.1-rc.3` is the repair release: it ships every runtime entry and replaces the out-of-tree Typert generation dependency with a same-origin browser API. See the [release notes](docs/releases/0.1.1-rc.3.md) for the complete change list, verification coverage, and known limitations.

### Quick start

Node.js `^22.19.0` or `>=24` is required. End users need npm only; cloning this repository and installing pnpm are not required:

```sh
npm install --global @deepseek-ai/dsh@0.1.1-rc.2
dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
dsh web
```

The first command installs `dsh`. If Windows still reports that `dsh` is not recognized, close and reopen the terminal before running the final two commands so the npm global executable directory reaches `PATH`. To run without a global install, use:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.1-rc.2 -- dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
npm exec --yes --package=@deepseek-ai/dsh@0.1.1-rc.2 -- dsh web
```

Installing the bundle installs its runtime packages and adds its patch to the selected DeepSeek Harness profile:

```sh
dsh plugin --profile web add @luv1211/dsh-pet-desktop@0.1.1-rc.3
```

For a manual composition, use the YAML shown above.

The `desktop-companion` row must load before `pet` — the pet service reads the registry once at plugin-load time to register the draggable companion window. The npm bundle supplies this order.

A validated user package is a directory with `pet.json` and the WebP spritesheet its manifest names (192×208 cells, 8 columns, 9 or 11 rows). Drop it under the configured `petRoot`, then refresh the catalog from the settings page. Native import, in-place replacement, and folder opening appear when the host composition serves the native directory-picker capability.

### Development

The commands are identical to the Chinese section above. `pnpm release:verify` is the publication gate; it installs only the generated tarballs, boots the packed pet through the real Cordis Loader, and exercises the same-origin API. The browser-surface specs under `packages/client/ui-pet/tests` are typechecked here but executed inside the harness workspace, because the npm-published client packages ship window-loader bundles rather than source-plane ESM.

### Limitations

- Built against DeepSeek Harness `0.1.1-rc.2` (the npm-published line); the family publishes under the `@luv1211` npm scope. The upstream master line moved to `0.1.2-alpha.1` and renamed several client internals; this repository tracks the published line.
- Browser controls use the same-origin JSON API registered by `@luv1211/dsh-pet`; publication does not depend on out-of-tree Typert artifacts.
- No external directory watcher: the catalog refreshes at startup, after an import or replacement, and on explicit refresh.

## 许可 / License

[MIT](LICENSE) —— DeepSeek Harness 的衍生作品 / a derivative work of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
