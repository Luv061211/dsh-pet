# @luv061211/dsh-desktop-companion

[English](README.md) | 中文

这是 Web profile 中可选 Electron companion renderer 的注册表。它提供 `ctx.desktopCompanion`；功能通过 `register({ id, entryPath, width, height, capabilities })` 注册，local discovery route 会在 disposer 运行前返回该 descriptor。重复 provider、外部 URL、带 query 的路径、无效尺寸和无效 capability 范围会在注册时失败。

通用 capability 对象可以声明拖拽转发、指针交互转发和有界 resize 范围。注册表不了解宠物，也不持久化窗口状态。Electron shell 在打开透明窗口前再次校验 descriptor，只暴露能力门控的 preload bridge，并负责定位持久化和显示器恢复。

## Model Experience

无；该注册表只提供本地桌面发现数据。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **单 companion**——shell 当前只拥有一个受约束的 companion 窗口；多个并发桌面 widget 需要另行决定组合方式。
