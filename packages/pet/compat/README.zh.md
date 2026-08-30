# @luv1211/dsh-pet-compat

[English](README.md) | 中文

`@luv1211/dsh-pet-compat` 是一个 browser-safe 值库，用于 DSH 自有且兼容 Codex 的宠物包：精灵图集单元为 192×208，网格为 8×9。它解析宿主标准化后的清单数据，应用 Codex 的单槽通知生命周期和替换规则，选择动画帧，从宿主提供的摘要生成缓存键，并根据宿主提供的终端事实选择图像协议。它导出的规范化默认轨道是 Browser、Electron 与 TUI 消费者共享的唯一动画来源；Electron 必须在内联文档中运行选择器时使用 `FRAME_AT_SOURCE`。

宿主负责文件读取、图像解码、哈希、定时器和异步请求顺序。该库只接受已提交的值，不导入 Node API 或 Codex 文件，也不创建模型可见、会话或持久化状态。

## Model Experience

无。该包不贡献工具、提示词小节或模型可见输入。

#### KV Cache 影响

无。

## Known Limitations and Deferred Work

- **宿主负责 I/O** ——调用方必须在调用本包前解码精灵图尺寸并计算内容摘要；browser-safe 入口永不读取宠物目录或图像字节。
