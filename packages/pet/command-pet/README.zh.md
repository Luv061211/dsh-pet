# @luv1211/dsh-command-pet

[English](README.md) | 中文

面向用户的 `/pet` 命令控制可选桌面宠物。`/pet` 与 `/pet toggle` 切换唤醒状态；`/pet wake`、`/pet tuck` 和 `/pet status` 提供明确操作。它不包含养成、经验、喂食、改名或换物种。

## 范围

命令只修改 `@luv1211/dsh-pet` 持有的持久化 `awake` 偏好。桌面伴侣由桌面能力齐备的 DSH profile 中的 `@luv1211/dsh-pet-desktop` 提供。

## Model Experience

无。该命令不贡献工具、提示词小节或模型可见输入。

#### KV Cache 影响

无。

## Known Limitations and Deferred Work

- **仅唤醒面**——命令只修改持久化的 `awake` 偏好；宠物选择、尺寸、导入和包目录操作由浏览器 UI 与 `pets` Remote API 提供。
