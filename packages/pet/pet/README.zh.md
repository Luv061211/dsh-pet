# @luv061211/dsh-pet

[English](README.md) | 中文

由 settings 持久化的桌面宠物领域。它拥有持久化宠物偏好、经过校验的内置与用户包目录，以及浏览器和桌面 companion 客户端消费的活动读模型。该服务不新增模型可见状态。

## 服务契约

`ctx.pets` 是全局 `pet` settings 命名空间的唯一写者。持久化偏好为 `{ version: 3, selectedPetId, awake, sizePx }`；缺少该节时默认为已唤醒的内置 `deepseek-whale`，尺寸为 112 CSS 像素。任何版本不是 3 的已存偏好都会在服务启动时失败，不会被迁移。空 id、非法尺寸，以及不在已加载目录中的 id，会在服务启动或变更时失败。

目录始终包含内置 `deepseek-whale`，也可以从配置的 `<dshHome>/pets` 根目录加载经过校验的用户包。一个包由 `pet.json` 和其中安全的清单相对 `spritesheetPath` 所指向的 WebP 组成；封闭清单接受 `id`、`displayName`、`description`、`spritesheetPath`、`frame` 和 `animations`，以及 Codex 生成的 `kind` 与 `spriteVersionNumber` 字段（解析但忽略）。WebP 必须是完整的 8 列图集，单元尺寸 192×208；标准九行的 1536×1872 图集与十一行 v2 的 1536×2288 图集都被接受，清单未提供 `frame` 时依据解码后的图片尺寸推导行与列。宿主在读取文件前根据元数据拒绝超限文件，使用 `image-dimensions` 检查有界图片头，在隔离进程中使用 Sharp 完整解码用户包像素，并执行标识符、文本、目录包含关系和普通文件规则；随后由 `@luv061211/dsh-pet-compat` 校验几何、路径、动画帧和回退。`maxManifestBytes`、`maxSpriteBytes` 和 `decodeTimeoutMs` 配置三项宿主资源限制。包目录可以命名为 `<id>.codex-pet` 或任意其他目录名：清单 id 是权威标识，点开头的目录（包括陈旧的 `.tmp` 残留）会被跳过，重复 id 会被排除。用户包按确定性的 id 顺序加载，格式错误的包会被静默排除；导入会先校验，再通过临时目录和原子重命名发布。目录描述符带有 `builtin` 或 `user` 来源、不可变的帧与动画元数据，以及相对当前 origin 的资源 URL。客户端永不提供路径 —— 原生选择器在宿主侧解析包；读模型只暴露一个仅用于展示的路径：用户包根目录。

`pets.getSnapshot()` 返回分离的偏好、目录、用户包根目录、宿主能力标志和按确定性规则排序的活动记录。`pets.getCatalog()` 返回分离的目录。`pets.selectPet(id)`、`pets.setSize(sizePx)` 和 `pets.setAwake(awake)` 通过完整偏好写入链串行化，并返回已提交的快照。`pets.importPetPackage()` 请求可选的原生宿主选择包字节，并报告 `published`、`cancelled` 或 `host-unavailable`。`pets.refreshCatalog()` 无需重启即重扫用户根目录；放入后校验失败的包不会出现，也没有任何解释。`pets.updatePetPackage(id)` 请求同一原生宿主为某个已存在的用户包挑选替换字节，并通过固定的三步改名序列原位换入：同步失败时旧内容保持完整，两次改名之间该包短暂缺席，进程中断的残留是同 id 的 `.tmp` 目录，由该 id 的下一次替换清扫。所选 manifest id 与目标不一致，或目标不是 user 包时，会在写入任何内容之前失败。`pets.openPetFolder()` 请求同一宿主打开 DSH 所有的包目录，并报告 `opened` 或 `host-unavailable`。

可选的 `petActivity` service key 提供由宿主拥有的活动投影。没有该服务时，领域适配器观察现有的 `session/event` 和 `session/disposed` 流：turn 开始变为 `running`，blocked 或 error 结束变为 `blocked`，其他结束变为 `ready`，销毁则移除记录。宿主投影还可以提供待处理交互和面向用户的标题。这些记录是展示状态，不会被写回为 session 事件。

每次偏好或活动发布都会发出 `pet/update`。伴侣客户端通过生成的 `pets` Remote 命名空间消费快照和事件。桌面伴侣页面（`/__dsh/pet/overlay`）轮询 `/__dsh/pet/overlay-state`，其右键菜单中的"关闭宠物"项通过 `POST /__dsh/pet/overlay-awake` 收起宠物；该写入只接受恰好为 `{ awake: boolean }` 的 `application/json` 请求体，跨站 POST 无法触达。原生导入与打开目录操作由能力标志控制；纯浏览器组合不提供原生服务，也不会报告这些能力可用。

## 扩展点

当宿主已经拥有更丰富的会话投影时，提供 `petActivity`。只应由可信的本地宿主提供 `petNative`；其选择器返回字节而不是由客户端控制的路径，其目录打开器接收由服务拥有的包根目录。桌面 companion 注册表是可选的，因此领域也可以在浏览器组合中运行，并提供相同的目录和活动 Remote API。

## Model Experience

无。宠物领域只存储本地偏好和展示状态。

#### KV Cache 影响

无。

## Known Limitations and Deferred Work

- **默认活动回退**——内置适配器覆盖会话生命周期事件；更丰富的待交互和标题数据需要宿主提供 `petActivity` 投影。
- **外部目录编辑**——包会在启动、导入或替换之后，以及显式刷新时被发现；没有删除操作，也没有外部目录监听，校验失败的包不会出现且没有任何解释。
- **桌面窗口**——置顶透明窗口仍需要 Electron companion shell；浏览器组合会继续禁用原生操作。
