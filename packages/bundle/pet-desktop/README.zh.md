# @luv1211/dsh-pet-desktop

[English](README.md) | 中文

可自定义 `dsh-pet` 系统的普通用户安装 bundle。使用 `dsh plugin --profile web add @luv1211/dsh-pet-desktop` 安装到 Web profile，然后通过 UI 或 `/pet` 选择、唤醒或收起宠物。随包提供的 DeepSeek Whale 是示例；目录也接受经过校验的本地精灵图宠物包。

该 bundle 组合 Codex 兼容的 8×9 宠物域、命令界面和浏览器 UI，不拥有任何默认 profile 行。宠物域始终暴露内置目录，并能从 DSH 宠物根目录加载经过校验的用户包。companion 只在 DSH Electron 桌面应用中打开；浏览器会话保留目录、活动和偏好控制，但不会创建置顶系统窗口。

原生包导入和包目录打开仅在周围的本机 Host 组合提供 native directory-picker capability 时可用。browser profile 会公布 capability 标志；没有 provider 时这些控件会隐藏。宠物数据属于 DSH，不读取 Codex 宠物文件。

## Model Experience

无；该 bundle 只组合面向人的宠物插件。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **需要桌面 shell**——透明桌面展示需要由 `dsh-web-app` 组合提供 Electron bridge。
- **外部目录变更**——包发现发生在启动和导入之后；bundle 没有 remove 命令，也没有外部目录 watcher。
