# `@deepseek-ai/dsh-pet-tui`

[English](README.md) | 中文

本包是 DSH Codex 兼容宠物的最小独立终端宿主。它负责交互式 TTY 生命周期、单一重绘队列、`/pets` 选择器、composer 与 screen-bottom 定位、Kitty/Sixel 输出和确定性的文本降级；不会导入 agent loop、模型、提示词、工具、会话日志或持久化包。

宿主接收已由 `@deepseek-ai/dsh-pet-compat` 校验的宠物包，以及由宿主负责的帧转换器。只有在终端能力检测通过后才写入图形帧；tmux、zellij、不支持的终端、禁用图像和图形写入失败都会降级到文本。过期的预览请求不能覆盖当前选择，清理最多执行一次并恢复 raw 模式和备用屏幕。

启用动画时，重绘遵循每条规范化轨道的 `nextFrameInMs` 节拍；切换宠物、打开选择器、减少动画和销毁宿主都会取消待处理定时器。

宿主通过 `setNotification` 与 `clearNotification` 暴露 Codex 的单一通知槽；running、waiting、review 和 failed 通知会选择记录中的动画，并在来源规定的生命周期结束后过期。

配置是显式的：`tui.pet`、`tui.pet_anchor`（`composer` 或 `screen-bottom`）、`tui.animations`、`reserveColumns`、`imageEnabled` 和 `reducedMotion`。默认值由 `DEFAULT_PET_TUI_CONFIG` 导出。由于 DSH 当前没有已发布的 TUI 应用，本包提供的是库接口；未来应用配置可以挂载它，而不改动模型或会话管线。

## Model Experience

无。本包只渲染面向人的终端 UI，不注册面向模型的工具、提示词小节或会话输入。

#### KV Cache 影响

无。

## 已知限制与后续工作

- 宿主本身不解码 WebP。应用拥有的帧提供器必须把已校验图集单元转换成 Kitty 或 Sixel 可用的字节。
- 本包不提供完整的行编辑器或面向模型的命令分发；slash 命令按设计仍属于宿主本地能力，未来 TUI 应用负责集成。
