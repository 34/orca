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

### 2026-10-16：P0 计划预检与真实 Git 探针

- 本轮开始核对：工作树干净，产品模块尚不存在；上一阶段属于已验证的准备进展。当前新增 `src/main/multi-repo-workspaces/multi-repo-workspace-plan.ts` 及相邻真实 Git 测试，尚未接入 Runtime 或 UI，不构成 P0 全部完成。
- 只读预检复用现有执行主机判断、项目运行时解析、Git runner、common-dir 兼容探测、分支冲突检查和 setup 策略。输出真实父目录、成员 common-dir、固定起始 commit 和精确目录；拒绝 folder/SSH/runtime/WSL、重复 Git 身份、跨平台非法名、大小写冲突、元文件目录冲突、已有根路径、已有分支及未决 setup。新入口还需 IPC schema 和执行前重新核验，预检结果本身不是写入或删除授权。
- 真实 Git 测试用临时 api/web/admin 仓库（不同 projectGroupId），通过既有 `addWorktree` 建立 api+web 与 api+admin；验证原 checkout 的脏文件保留、两任务不串文件、起始分支前进不改变计划 commit、根目录 `git -C <member> commit` 成功。该证据只证明本机进程可操作目录和 Git metadata，**未证明根 Agent sandbox 权限**。
- 验证：`ORCA_BACKGROUND_LAUNCH=1 pnpm test src/main/multi-repo-workspaces/multi-repo-workspace-plan.test.ts`（20 项）、`pnpm tc:node` 和 `pnpm run check:code-quality:changed b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。日志为 `.context/multi-repo-plan-{test,typecheck,quality}.log`。使用显式基线避免旧 origin/main 缓存把上游改动计入本功能。
- 后续接入已定位：`runtime-managed-worktree-create-types.ts`、`runtime-local-worktree-create.ts`、`runtime-local-worktree-create-candidate.ts`、`runtime-local-git-worktree-create.ts`、`runtime-local-worktree-materialization.ts`。内部 placement 应只传 task/member 身份，由模块从持久计划读取目录；任务成员跳过预创建缓存和自动后缀，保留分支并记录实际布局。不得把裸路径加入公共 wire schema。
- 下一步：完成 journal/执行 owner 与内部 placement 接入，再通过真实 Runtime 和根 Agent 验证 P0；随后 P1–P4 及有限 P5。当前技能列表已有 `/Users/wzh/.codex/skills/electron/SKILL.md`，先前“技能缺失”的记录不再作为已确认阻塞；执行 UI 验收时读取并使用它。
- 未启动应用、未修改用户正式数据、未推送或安装；UI、Agent、恢复/清理、独立身份和产物仍待实现及验收。当前无已确认的人工阻塞，Goal 保持 active。

### 2026-10-16：任务 journal 与共享记录契约

- 继续中断前已落盘的未提交代码；上一轮为代码进展，未留下运行中的测试进程。本轮完成共享 Zod 契约和 `MultiRepoWorkspaceStore`，计划类型改由契约推导，避免 main/preload/UI 后续各自定义。
- 每任务 JSON 位于显式 profile 目录，使用既有 `writeFileDurableSync`、临时文件命名和 0600 文件权限。taskId 复用 UUID requestId，使重试能直接定位同一记录；创建用 expectedRevision=null，后续写入校验 revision 并递增。记录包含固定计划、根入口、成员步骤、setup 和根 Agent 启动状态，不镜像 Git dirty 或 Agent live 状态。
- schemaVersion 非 1、损坏 JSON、文件名/任务/profile 身份不符、成员和计划不符都拒绝读取/覆盖；持久计划不可修改。close 后旧实例拒绝操作。同步提交避免同一主进程中读改写交错；**profile 生命周期中的唯一 owner 与异步 Runtime 操作收敛尚未接入**，不能据此声称切换 profile 已端到端安全。
- 验证：`ORCA_BACKGROUND_LAUNCH=1 pnpm test src/main/multi-repo-workspaces` 29 项通过（20 项计划/真实 Git、9 项 journal）；`pnpm tc:node` 通过；changed-code quality 使用固定基线。日志 `.context/multi-repo-journal-{test,typecheck,quality}.log`。journal 测试涵盖重新打开、重复创建、过期写入、关闭 owner、错误 profile、路径穿越、新 schema/损坏记录保留、计划不可变、持久化失败保留旧记录及忽略遗留临时文件。
- 下一步仍是将执行 owner、持久计划和 Runtime 内部 placement 连起来，然后完成真实根 Agent 权限验收。尚未新增公共 IPC、启动应用或修改正式 profile。P0–P5 未完成项保持原范围，Goal active。

### 2026-10-16：Runtime 内部固定 placement 接入

- 新增 `multi-repo-workspace-placement.ts`，按 Runtime store 对象绑定 journal owner；重复绑定拒绝，解绑关闭 journal。main 内部创建请求只增加 `{taskId, repoId}`，公共 wire schema 不变。该绑定 API 尚待任务服务和 profile 生命周期调用。
- 解析必须找到根已创建、成员 creating 的持久意图，核对 repo 身份、真实 common-dir、根/父目录 realpath、直接子目录布局、目标路径不存在、分支及 pending removal 无冲突；读取期间 revision 或 owner 改变则拒绝。目录已有内容须走后续恢复流程，不能重新 add。
- 现有 Runtime 本机创建复用原 Git add/materialization：任务模式从 journal 取精确名称/路径/分支/commit，绕过默认 base 与远端 refresh、自动改名、预创建缓存；Git add 前再次检查 owner/计划。metadata 写实际根布局并设置 preserveBranchOnDelete，repo 自定义 worktreeBasePath 不覆盖任务布局。普通创建仍走原路径；上层进入远端/folder 路由前拒绝不支持的 placement host。
- 验证：模块及 Runtime 创建、执行 host、rearm 回归共 75 项通过；最终 base 解析调整后单独复跑 Runtime 创建测试。`pnpm tc:node` 与固定基线 changed-code quality 检查，日志 `.context/multi-repo-placement-{test,runtime-test,typecheck,quality}.log`。新增真实磁盘/Git 探针覆盖 owner 关闭、重复绑定、SSH 拒绝、已有成员目录、根被 symlink 替换；Runtime 测试验证固定 commit/目录、缓存不消费、元数据保留分支及二次检查失败时不 add。
- **尚未完成**：操作 owner 的 drain/profile 切换接线、根目录独占创建与 Folder Workspace 登记、逐成员 service/recovery、真实 Runtime + 根 Agent 端到端验收。尤其 Git 已开始后 profile 切换仍需 owner 生命周期协调；本提交只保证 add 前拒绝无效 owner，不把它记作完整切换安全。后续 UI、清理、打包和有限同步范围不变。
