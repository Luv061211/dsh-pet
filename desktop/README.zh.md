# DeepSeek Harness 桌面版（本机自用）

[English](README.md) | 中文

Electron 桌面壳：双击启动后自动拉起 harness Web 服务器（子进程），在窗口内使用 Web UI，关闭窗口即退出。

## 前置条件

- 仓库已安装依赖并构建：在仓库根执行 `pnpm install` 和 `pnpm run build`（Web UI 由构建产物 `apps/web/dist` 提供，未构建则服务器无法出页面）。
- 已安装 Node.js（^22.19 或 >=24），服务器使用系统 Node 运行。

## 运行

```sh
cd desktop
npm install        # 下载 Electron 二进制较大；网络慢时先设置：
                   #   Windows: set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm start
```

首次启动服务器冷启动约需 10–30 秒，窗口会先显示加载页。

## 环境变量

| 变量 | 作用 |
|---|---|
| `DSH_DESKTOP_HARNESS_DIR` | 覆盖 harness 仓库路径（默认是 desktop 的上级目录） |
| `DSH_NODE` | 覆盖 Node 可执行文件路径（默认 `node`） |
| `ELECTRON_MIRROR` | 安装 Electron 时使用的下载镜像（仅安装阶段有效） |

模型调用需要 `DEEPSEEK_API_KEY`：直接设置在系统环境变量里，或在仓库根 `.env` 中填写（harness 启动时会自行加载）。

## 日志

服务器输出追加写入 Electron 用户数据目录下的 `run.log`：

- Windows：`%APPDATA%\dsh-desktop\run.log`

## 打包便携版（可选）

```sh
npm run dist
```

产出 `dist/DeepSeek Harness 0.1.0.exe` 便携版。便携版只包含桌面壳本身，仍需要仓库检出和系统 Node 才能运行（本机自用场景）。

运行便携版时，桌面壳按以下顺序寻找 harness 仓库：

1. 环境变量 `DSH_DESKTOP_HARNESS_DIR` 指定的路径（最高优先级）。
2. exe 所在目录（如果 exe 直接放在仓库根目录旁边）。
3. exe 的父目录。

都找不到时会弹出明确错误提示，按提示设置 `DSH_DESKTOP_HARNESS_DIR` 即可。

## 已知限制

- 桌面壳启动的是本地 HTTP 服务（仅监听 127.0.0.1），与 `pnpm dsh web` 等价，只是包了一个窗口。
- 仓库架构笔记预留了 Electron 的正式形态（`file://` 加载 + IPC 桥，见 `.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md`），本目录是简化路线，代码中已预留演进空间（端口、路径均可通过环境变量覆盖）。

## 常见问题

**双击 exe 后提示 "The harness server stopped unexpectedly (code 1)"？**

这是桌面壳找不到 harness 仓库导致的。打包版不会自动从 asar 内部路径推断仓库位置。解决办法：

1. 设置环境变量 `DSH_DESKTOP_HARNESS_DIR` 指向仓库根目录：
   ```powershell
   setx DSH_DESKTOP_HARNESS_DIR "C:\path\to\deepseek-harness-master"
   ```
   设置后重新启动应用。
2. 或者直接把 exe 放到仓库根目录旁边再运行。

日志位置：`%APPDATA%\dsh-desktop\run.log`，里面有每次启动的完整输出。
