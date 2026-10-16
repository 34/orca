# 多仓库需求工作区：Goal 会话交接

## 目标与权威设计

在本工作树交付可日常使用的 Orca 34 本机版：用户按需求选择不同项目组的本机仓库，在共同需求根下创建各仓库的真实独立 worktree，由一个根 Agent 同时开发全部成员。

实施前阅读 [已批准设计](fork-multi-repo-workspaces-plan.md)、根 AGENTS.md；涉及 UI 时读取 docs/STYLEGUIDE.md，涉及 macOS 打包身份时读取 docs/reference/macos-daemon-tcc-attribution.md。设计文件记录需求与边界，当前源码决定实际接入点；先核实再复用，不复制上游创建/删除流程。

## 已完成的准备

- 工作目录：`/Users/wzh/orca/workspaces/orca/loggerhead`。在此继续，不创建第二套 checkout，也不访问其他工作树修改源码。
- 开发分支：`34/multi-repo-workspaces-v1`，基线为 fork main 的 `b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。GitHub 官方仓库 compare 验证：官方 main 相对它 ahead 7 / behind 0；本地 origin/main 缓存较旧，不能据此判断最新远端历史。
- `origin` 保留官方 `https://github.com/stablyai/orca.git`；`fork` 为 `https://github.com/34/orca.git`。开发分支及 `34/local` 的 pushRemote 为 fork。
- `34/local` 是同基线的本地集成分支。原 `34/multi-repo-workspace-management` 保留原提交。准备时试验过 `v1.4.227`，但它与已分析主线大幅分叉且缺少关键源码/文档，最终选择上述固定 main SHA。没有推送或修改 GitHub 默认分支。
- 每个新 shell 先执行 `source .context/multi-repo-env.sh`：使用独立 Node 24 工具链、项目固定版本 pnpm/Bun、后台启动模式、工作树内独立 dev profile。该文件及工具链被 Git 忽略，不改变用户全局默认 Node 或正式 Orca 数据。
- 工具版本以所选 checkout 的 package.json 和 config/.bun-version 为准；当前为 Node 24.22.0、pnpm 12.8.1、Bun 1.4.3。试验 release 使用过 Bun 1.4.2，最终环境已按当前 pin 更新。
- 尚未实施产品功能。准备阶段没有安装/替换正式应用。

## 执行顺序与进度记录

按设计 P0 → P4 完成：接入与根 Agent 权限验证、端到端创建、故障恢复、安全清理、隔离身份的 macOS arm64 安装产物。P0 先用临时真实仓库证明目标目录与根 Agent 对成员文件及 Git metadata 的访问成立，再做完整 UI。

以小提交保留可审查进度；更新此文末尾的执行记录，记下当前阶段、验证命令及结果、下一步和阻塞证据。会话恢复先核对 Git 和实际文件状态，接着未完成步骤工作。自用功能集中在独立目录，现有接入点保持少量；源码与设计不符时记录最小调整及理由。

P5 是有限的同步演练：使用实施时已存在的后续官方稳定 tag，在独立 sync 分支演练合并和回归；若没有后续 tag，交付可执行的同步步骤并明确未做真实版本升级，不等待未来发布，也不把同一 SHA 的空合并记作升级成功。远端合并必须满足 AGENTS.md 的精确提交 CI 门禁；本地候选产物不冒充已通过远端 PR gate。

## 完成证据

- api+web 与 api+admin 两个需求同时工作，api 的两份 worktree 互不串文件，原 checkout 不变；选择跨项目组仓库成功。
- 根 Agent 只启动一次，确实能修改多个成员并在各成员执行 Git；沿用既有权限和会话机制。
- 重复请求、部分失败、重启恢复、setup/Agent 启动失败、profile 切换和外部删除符合设计，不重复创建或自动复活资源。
- 清理有预览、所有权复核、根 Agent 停止和实际删除完成确认；保留分支、用户文件及无法安全删除的目录。
- 相关真实 Git/故障测试、类型检查、changed code quality 和适用构建检查通过；普通单仓/文件夹行为不回归。跨平台路径测试覆盖规则，实机验证范围明确列出。
- UI 按仓库要求通过隐藏 renderer 的 Playwright CDP 检查并留下证据。当前技能目录未找到 `$electron`；先查找正式技能来源。无法取得时记录 UI 验证阻塞，继续独立后端工作；不能用 computer-use 替代或把未验收 UI 报为完成。
- 交付独立身份的 macOS arm64 产物、构建清单、使用和安装/回退说明；验证数据、CLI、daemon、协议和 updater 不串官方实例。保留官方安装及 profile。未获得有效签名时如实说明本机运行限制，不假冒官方身份。
- 交付接入点清单、上游同步步骤、未来切回官方的任务/分支导出方法与已知限制。

P1 演示不满足目标。只有上述可验证交付完成才标记 Goal complete；需要凭据、人工权限操作或缺失工具时说明具体阻塞，不编造成功。

## 执行记录

- 2026-10-16：设计已批准；remote、分支、隔离 dev 环境、当前架构依赖安装完成。`pnpm install --frozen-lockfile`、`pnpm test src/main/project-groups/nested-repo-import-target.test.ts`（6 个测试）与 `pnpm tc` 均通过。日志位于 `.context/preparation-{install,test,typecheck}.log`。测试有 Vite 的 ESM/CommonJS 配置提示，未影响通过；没有为此修改上游配置。
- 文档相对链接已核对，未改产品源码及 lockfile。完整测试、UI、产品构建与安装留给实施阶段；`$electron` 技能缺失仍是 UI 验收前置缺口。Codex CLI 已确认 `goals stable true`。
