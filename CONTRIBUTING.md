# Contributing to dsh-pet / 参与 dsh-pet

[中文](#中文) | [English](#english)

<a id="中文"></a>
## 中文

`dsh-pet` 欢迎代码以外的贡献。这个项目的价值不仅在于内置示例宠物，也在于用户可以把自己的角色做成可导入的本地宠物包。

### 你可以贡献什么

- 制作、测试或改进一只宠物包。
- 报告某个 DeepSeek Harness、操作系统或 Electron 环境的安装兼容性。
- 提供设置页、桌面 companion 或终端呈现的截图与短 GIF。
- 改进中英文文档、安装说明或宠物包教程。
- 提议 Agent 活动状态与宠物动画的映射。
- 修复代码、补充测试或审查发布 tarball。

### 分享宠物包

先阅读 [宠物包入门](docs/PET_PACKS.md)，确认包能被本地设置页发现。提交 Issue 时请说明：宠物名称、预览图或 GIF、支持的 atlas 行数、使用的 DSH 版本，以及是否允许他人再分发素材。不要在 Issue 中上传 API key、个人目录、会话日志或未经授权的角色素材。

### 提交代码或文档

```sh
pnpm install
pnpm typecheck
pnpm test
```

请保持每项修改聚焦，并说明用户可观察到的结果。涉及发布包、依赖、bundle 组合或安装说明时，运行 `pnpm release:verify`。不要修改生成的 `lib/` 来代替源码，也不要提交凭据或本地 DSH 配置。

<a id="english"></a>
## English

`dsh-pet` welcomes contributions beyond code. The project is not limited to its bundled example pet: users can turn their own characters into importable local pet packs.

### Ways to contribute

- Create, test, or improve a pet pack.
- Report installation compatibility with a DeepSeek Harness, operating-system, or Electron environment.
- Share screenshots or short GIFs of Settings, the desktop companion, or terminal presentation.
- Improve English or Chinese documentation, installation steps, or the pet-pack guide.
- Propose mappings between agent activity and pet animations.
- Fix code, add tests, or review published tarballs.

### Share a pet pack

Read [Create a pet pack](docs/PET_PACKS.md) first and confirm that the local Settings page discovers the package. An Issue should include the pet name, a preview image or GIF, supported atlas row count, DSH version, and whether others may redistribute the artwork. Do not attach API keys, personal paths, session logs, or artwork you are not allowed to share.

### Submit code or documentation

```sh
pnpm install
pnpm typecheck
pnpm test
```

Keep each change focused and explain the observable user result. Run `pnpm release:verify` for changes to published packages, dependencies, bundle composition, or installation guidance. Do not edit generated `lib/` in place of source, and never commit credentials or local DSH configuration.
