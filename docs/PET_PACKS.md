# Create a pet pack / 创建宠物包

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

`dsh-pet` 不把内置 DeepSeek Whale 当作唯一角色。你可以创建本地宠物包，把自己的角色、精灵图和动画元数据交给同一套宠物系统加载。

### 最小目录

```text
my-pet.codex-pet/
├── pet.json
└── spritesheet.webp
```

目录名只用于整理；`pet.json` 的 `id` 才是宠物的权威标识。

### 最小清单

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A custom companion for DeepSeek Harness.",
  "spritesheetPath": "spritesheet.webp",
  "frame": {
    "width": 192,
    "height": 208,
    "columns": 8,
    "rows": 9
  }
}
```

`id` 必须唯一且非空；`spritesheetPath` 必须是包目录内的安全相对路径。未定义自定义动画时，系统会从 atlas 尺寸推导可用帧和默认行为。

### 精灵图要求

- 每个单元为 **192×208** 像素。
- 每行固定 **8 列**。
- 支持标准 **9 行** atlas（1536×1872）和 v2 **11 行** atlas（1536×2288）。
- 资源格式为完整的 **WebP** 图片，而不是单帧图像或外部 URL。

参考随包提供的 [DeepSeek Whale 清单](../packages/pet/pet/assets/deepseek-whale/pet.json) 和 `spritesheet.webp`。另一个完整、可复制的社区示例是 [Nailong](../examples/pets/nailong/)。它们都是可替换的示例，不是角色主题限制。

### 导入和排错

把目录放入已配置的宠物根目录后，在 **设置 → Pet** 中刷新目录。提供原生目录选择能力的本地宿主还会显示导入、更新和打开文件夹操作。

系统在发布目录前校验清单、资源路径、文件类型、图像尺寸和资源限制。不合格的包不会出现于宠物列表。常见原因是：id 重复、WebP 路径写错、精灵图不是 8 列，或尺寸不符合单元网格。

<a id="english"></a>
## English

`dsh-pet` does not treat the bundled DeepSeek Whale as its only character. Create a local pet pack to load your own artwork, sprite atlas, and animation metadata through the same pet system.

### Smallest directory

```text
my-pet.codex-pet/
├── pet.json
└── spritesheet.webp
```

The directory name only organizes files. The `id` in `pet.json` is the authoritative pet identity.

### Smallest manifest

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A custom companion for DeepSeek Harness.",
  "spritesheetPath": "spritesheet.webp",
  "frame": {
    "width": 192,
    "height": 208,
    "columns": 8,
    "rows": 9
  }
}
```

`id` must be non-empty and unique. `spritesheetPath` must be a safe relative path inside the package. When the manifest omits custom animations, the system derives usable frames and default behavior from the atlas dimensions.

### Sprite-atlas requirements

- Each cell is **192×208** pixels.
- Every row has **8 columns**.
- The standard **9-row** atlas (1536×1872) and v2 **11-row** atlas (1536×2288) are supported.
- The asset is one complete **WebP** image, not a single frame or an external URL.

Use the bundled [DeepSeek Whale manifest](../packages/pet/pet/assets/deepseek-whale/pet.json) and `spritesheet.webp` as a reference. A second complete, copyable community example is [Nailong](../examples/pets/nailong/). Both are replaceable examples, not character-theme restrictions.

### Import and troubleshooting

Put the directory under the configured pet root, then refresh the catalog in **Settings → Pet**. A local host that provides native directory picking can also expose import, update, and open-folder actions.

The system validates the manifest, asset paths, file type, image geometry, and resource limits before publishing a package to the catalog. An invalid pack does not appear in the pet list. Common causes are a duplicate id, an incorrect WebP path, an atlas that is not eight columns wide, or dimensions that do not match the cell grid.
