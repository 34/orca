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

### 2026-10-16：任务执行服务与关闭时等待

- 新增 `MultiRepoWorkspaceService`：create 预检并持久化任务；run 独占 mkdir 根目录、写描述 marker/TASK.md、通过既有 createFolderWorkspace 登记根入口，再按序 createManagedWorktree。projectGroupId 由调用方提供，后续初始化负责创建/持久化专用组；当前尚无 IPC/UI 调用方。
- 同一 taskId 的并发操作共享进行中的 Promise；重复 create 找回日志，已处理成员不再创建。成员绑定 folder lineage，显式 setupOnly/不激活，未请求子 Agent。setupReceipt running/失败保留为 registered，不把 checkout 完成冒充 setup 已成功；根 Agent 仍 pending，后续必须接 setup 完成观察及独立根启动。
- 目录创建、Folder Workspace 登记、成员 Git 创建都有事前意图。已有根拒绝写入；root 登记丢回复保持 creating，明确要求对账，不重复登记；成员失败保留前面成功结果，后续成员暂停。恢复入口尚未实现，当前保守停机不等于 P2 完成。
- close 先停止接收请求，等待进行中操作返回并落盘，再解绑/关闭 journal；循环不再开始下一个成员。该 drain 行为已有测试，**应用 profile 切换必须 await 它的接线仍未完成**。
- 验证：模块测试 37 项通过；调整测试 fixture 类型后单独复跑服务的 5 项测试；`pnpm tc:node` 和固定基线 changed-code quality。日志 `.context/multi-repo-service-{test,final-test,typecheck,quality}.log`。服务测试使用临时真实 Git 仓库做预检、模拟 Runtime 返回做协调故障注入，不能作为完整 Runtime/UI/Agent 端到端证据。
- 下一步：实际 runtime/profile 初始化与根 Folder Workspace/Agent 接入，补 setup 收敛、失败恢复；再完成 IPC/UI、清理、身份/打包与同步演练。无人工阻塞，Goal active。

### 2026-10-16：主进程 IPC 与 profile/退出生命周期接线

- 主窗口 core handlers 注册多仓本机 IPC：list/get/create/continue。统一严格 Zod 创建请求校验、UUID 校验、可信 UI renderer + mainFrame 校验；绑定注册时 profile，active profile 改变后拒绝新请求。create 返回持久任务后后台 run，窗口无需等全部 checkout；公共远端 RPC 未扩展。
- 专用项目组延迟到首个任务根登记时创建，group.json 在 profile 模块目录保存 groupId。先写创建意图，再调用上游 createProjectGroup；中断/记录损坏/用户删除已记录组时拒绝自动重建，后续管理恢复流程仍需实现。未移动任何源 repo 的项目分组。
- 服务的项目组依赖改为延迟 getter。应用重启/profile relaunch 的 onBeforeRelaunch 等待 service.close。普通退出在进入既有 will-quit teardown 前等待多仓任务 drain，再继续终端关闭和 Store 最终 flush/freeze；最终 flush 前也执行幂等 close。只在已注册 owner 时增加等待，未使用模块的测试/serve 保持原路径。
- 验证：模块与 profile/退出基础回归 60 项；新增 IPC 边界 4 项；退出更新 veto 等最后回归 10 项。增加 pending-writer 中“多仓操作完成前不最终 flush/freeze”测试并单独复跑。`pnpm tc:node`、固定基线 changed-code quality 通过。日志 `.context/multi-repo-ipc-{test,boundary-test,final-test,typecheck,quality}.log` 与 `.context/multi-repo-quit-order-test.log`。
- 仍缺 preload/UI 调用入口、setup 状态收敛、根 Agent、恢复/清理管理、产物及同步演练。后台 run 的非成员异常目前记录 console，恢复界面需呈现对应 journal 阶段并提供对账；不将这些暂停状态当成可日常使用。未启动应用、未修改用户正式数据，Goal active。

### 2026-10-16：根 Agent 接入与 setup 结果门禁

- 创建契约增加可选 agent（复用上游 AgentLaunchFields 校验）。任务保存 selected/operationId/result；没有选择 Agent 的旧记录继续停留 pending，新 UI 必须提供既有 Agent 选择器。
- 根启动走既有 `agent.launch` RPC 方法和桌面 caller 身份，不复制终端/原生 Chat 会话创建。目标是已登记的根 Folder Workspace，prompt 引用 TASK.md，presentation=background。首次启动前持久化时间戳 operationId；后续失败/丢回复只通过 `agent.launchReplay` 查询/回放同一操作，started 不再次启动。不会在应用启动时自动 run 或重新发需求。
- 成员 setup running 保存 terminal handle，并通过现有 waitForSetupTerminalCompletion 等待最多 60 秒；只有 exitCode=0 转 succeeded/ready，丢失句柄、异常、超时、非零结果保留 failed/registered，阻止根 Agent。skipped/not_configured 才可直接 ready。setup 的恢复观察、显式跳过及独立重试入口仍待管理流程补齐。
- 模块 45 项测试通过、`pnpm tc:node` 和 fixed-baseline changed-code quality 通过，日志 `.context/multi-repo-agent-{test,typecheck,quality}.log`。新增测试覆盖根启动前落盘、started 去重、失败保持 operationId 并 replay、setup 未完成阻止启动，以及 setup 成功/失败状态。测试 launch 回调是受控替身，**不是实际 Agent sandbox、账户或多仓 Git 写权限验收**。
- 下一步必须完成 P0 真实根 Agent 验收，接 preload/UI 使流程可操作，并继续 P2/P3 恢复、清理、管理和 P4/P5。当前仍未启动应用或交付安装包，Goal active。

### 2026-10-16：preload 接入与真实根 Agent 权限探针

- 新增 typed preload API/bridge，暴露既有 list/get/create/continue IPC。`pnpm tc` 全部通过，`pnpm run build:electron-vite` 和 Electron runtime 校准完成；changed-code quality 初次发现 interface 风格问题，改为 type 后通过。日志 `.context/multi-repo-preload-{typecheck,quality}.log`、`.context/multi-repo-app-build.log`。
- 使用 Electron skill 和 Playwright CDP 连接独立 profile 的隐藏 renderer（端口 9567），没有 show/focus 或 computer-use。跨三个项目组注册临时 api/web/admin，真实创建 A=api+web、B=api+admin；四个成员 ready，linked worktree 分支/commit/目录正确，源 main 干净且未改变。隐藏截图 `.context/multi-repo-hidden-created.png` 已检查，Git 证据 `.context/multi-repo-live-git.json`。尚未验收根 Explorer 交互或创建表单。
- 真实根 Codex 会话在第三个任务两个成员各写入并提交 PROBE.md。检查发现测试 profile 继承的上游 Codex 默认参数含 bypass，因此该次只算启动/多仓提交证据，不能作为 sandbox 验收。
- 随后只修改独立测试 profile，将 Codex 设置为 workspace-write、approval never，加精确 api/.git 和 web/.git 两个目录授权；第四个任务由单一根会话成功在两成员提交，提交为 a148063947599c39b56fd89832aac25370fd4db9 与 2703f7be3620f9b4cd4c66c404320ea8e4553e45。工作树干净、原 checkout 不变、仅 PROBE.md 被提交。实际进程参数确认 workspace-write=true、hasBypass=false。证据 `.context/multi-repo-sandbox-agent-{screen,verified}.json` 与 `.context/multi-repo-sandbox-process-policy.json`。
- 这证明精确 Git metadata 授权可行，**尚未实现产品自动授权**：当前测试 profile 参数包含测试仓库的固定目录。正式实现应从持久成员身份生成权限，并覆盖终端及原生 Chat；已查明 agent.launch 的 agentArgs 仅作用于终端，原生 Chat 使用 host settings，不能仅追加该字段就报告完整支持。不能关闭 sandbox 或改全局配置解决。
- 本轮保留隐藏测试应用/CDP 供继续验证，启动日志 `.context/multi-repo-live-app.log`，exec session 24704；两个探针 Agent 已完成任务并停在输入提示。继续前核对实际进程/CDP，不能假定旧句柄存活。`.context/multi-repo-live-fixture/manifest.json` 记录任务身份与路径，测试 profile 仍保持上述受限参数。没有修改正式 profile、安装或推送。
- 下一步：正式成员授权路径、创建/管理 UI、恢复与安全清理、独立身份产物及有限同步验收。P0–P5 未完成范围不变，Goal active。

### 2026-10-16：根启动前的真实成员身份复核

- 上一轮为有效进展：82a26f2bf0 已提交 preload 与实际 Agent 探针。本轮工作树起始干净；未重新启动应用或重发探针任务。
- 新增独立 identity 校验并接入根 Agent 首次启动及 replay 之前。核对根/父目录真实路径、成员直接子目录布局、非 symlink 的 linked `.git` 文件、Git top-level/common-dir、任务分支以及 Git 管理目录的 gitdir 反向登记。成员被移走、切到其他分支、替换 Git 指针或篡改登记时拒绝启动，不凭 ready 状态扩大授权。允许任务分支正常前进，未要求 HEAD 保持创建 commit。
- 复用既有 readRepoLocation/readCheckedOutBranchRef，包括 Git 2.25 能力回退；未新增 Git 选项或公共 wire 字段。47 项模块测试与 tc:node 通过；新真实 Git 测试验证上述变更拒绝和正常提交后的通过。Windows symlink 探针跳过，尚无 Windows 实机证据。日志 `.context/multi-repo-identity-{test,typecheck,quality}.log`；质量初次发现两处测试单行 if 缺花括号，修正后固定基线 changed-code quality 通过。
- 自动权限仍未接入。进一步查明 Codex structured launch 会主动丢弃 --add-dir 和 sandbox_workspace_write 配置覆盖；应沿现有 thread writable-roots 合并机制接入，不能只传 agentArgs 或修改 host settings。Claude 已有 additionalDirectories，终端需沿既有 shell quoting/launch 参数机制接入。后续还需确认 root Folder Workspace 与 journal 路径/instance 对应以及恢复操作边界；当前检查不宣称消除磁盘 TOCTOU。
- 当前变更仅完成启动前磁盘身份防线；管理 UI、自动授权、P2/P3、P4/P5 未完成，Goal active。

### 2026-10-16：Codex 原生 Chat 的自动 metadata 授权

- 上轮 6619d9e001 为已验证进展，本轮开始工作树干净。新增按 runtime Store/profile owner 解析授权：仅匹配已登记的任务 Folder Workspace，要求启动 cwd 精确等于任务根、所有成员 ready，重新核对真实 Git 身份，完成异步读取后再次检查 owner/revision。返回精确成员 common-dir，不读取 marker 提供的授权路径，不给普通 Git 工作区增加目录。
- 通过现有 structured launch sources/basis 加入可选本机 callback；Codex 每次解析启动（含恢复）从持久 session 的 workspaceId 与 launchDirectory 读取授权。Codex thread/start/resume 前复用现有 writable-roots 合并，保留用户既有 roots 和 visuals 根，去重加入 metadata；不改 permission mode、global settings、公共 wire 字段或 sandbox。必需授权读不到原配置时拒绝启动，普通 visuals 仍为 best effort。
- 123 项相关测试通过（多仓模块、Codex launch/visuals、跨 Agent 启动 parity），tc:node 与固定基线 changed-code quality 通过。另执行 ORCA_REAL_CODEX_CLI_TEST=1 的真实 app-server visuals 测试，2 项通过，确认 thread/start 返回 workspaceWrite 且包含原 roots、精确 api/.git/web/.git 和 visuals 目录；该测试不调用模型/账户。日志 `.context/multi-repo-permissions-{test,typecheck,quality,real-codex}.log`。
- 已接入的是 Codex 原生 Chat；**终端自动参数与 Claude additionalDirectories 尚未接入**。真实 app-server 证据证明配置生效，不冒充已通过新构建 renderer 创建并由模型跨仓提交；旧隐藏应用仍是上一构建。当前 callback 从 journal.list 查找根，损坏任务会使 Folder Workspace 授权解析失败，后续管理恢复需显示/处理该错误。还需核对启动恢复时 owner 绑定顺序与实例身份。
- 下一步接终端/Claude，重建隔离应用验证自动授权并移除测试 profile 手工目录参数，继续 UI、恢复清理、独立包和同步演练。Goal active，未交付日常版本。

### 2026-10-16：Claude/终端自动授权及新构建端到端探针

- 上轮 b33d12bad6 为已验证进展，本轮起始工作树干净。Claude structured launch 将同一份主机校验目录合入 additionalDirectories，保留用户配置及附件/visuals 授权。两条主机终端规划路径（createAgentSession 与 agent terminal startup）复用新增小模块，把精确目录以现有 shell quoting 生成 --add-dir，放在用户参数之前以避开 -- 终止符；不改用户 sandbox/approval 选项。远端和普通非任务启动不变；有任务授权但终端 Agent 不是 Codex/Claude 时明确拒绝，未声称所有 Agent 适配完成。
- 157 项相关测试通过，包括 posix/PowerShell/cmd 的空格及中文路径、保留权限选项、普通/远端无改动、身份错误拒绝、Claude launch 和 runtime 启动回归。tc:node、固定基线 changed-code quality、Electron build 均通过，日志 `.context/multi-repo-terminal-permissions-{test,typecheck,quality}.log` 和 `.context/multi-repo-permissions-app-build.log`。
- 按 AGENTS 启动真实 Claude 两个指定测试文件，exec session 5501，日志 `.context/multi-repo-terminal-permissions-real-claude.log`。截至本记录最近一次工具查询仍在运行，fold 用例已报告失败（约 32 秒），完整失败原因尚未输出。不得称真实 Claude 验收通过；后续先查询同一句柄和日志，不因观察超时重启测试。
- 使用 Electron skill/Playwright CDP，在隐藏 renderer 调用正常 app.restart，加载新 build（runtimeId 6b6b634d-c3a9-41ae-b3c5-a564064f4cc3，CDP 9567）。测试 profile Codex 参数已改为仅 --sandbox workspace-write --ask-for-approval never，移除两条手工 --add-dir；未改正式 profile 或全局 Agent 配置。
- 新任务 06d907c2-9514-4765-9510-9afb689eb9b5，根 `.context/multi-repo-live-fixture/tasks/automatic-probe`，单一根 terminal handle term_ae9f3a09-762a-4a0c-ad31-b99d1adc06ff。实际进程 cwd/argv 确认自动加入两个精确 metadata 路径且无 bypass；模型在 api/web 各提交 PROBE.md（f1fe3316bdb331ddb3f32cae1b47eb37278fb905、57f32c1cf2cc04f5f3d001abb1552fb1502d7287），两树干净、只改该文件、源 checkout 未出现该文件。证据 `.context/multi-repo-automatic-{process-policy,agent-screen,agent-verified}.json`；脚本 `.context/multi-repo-live-automatic.mjs` 与 manifest 保存稳定请求 ID。
- 仍需处理：真实 Claude 回归失败；新构建原生 Chat 模型级跨仓提交；休眠终端使用保存 launchConfig 恢复时的身份/授权再校验；其他 Agent 的能力边界；启动恢复 owner 顺序、UI、P2/P3、P4/P5。当前不将初次自动授权成功视作全目标完成。隐藏应用保留供后续验证，Goal active。

### 2026-10-16：无已创建资源的失败成员重试

- 上轮 bdd38a6021 为已提交且有真实 Codex 证据的进展。本轮起始工作树干净；先查询原 Claude exec session 5501，确认仍活跃后继续独立工作，没有重启该测试。
- 新增 recovery 模块，显式 continue 才调用。失败/creating 成员若从未记录 worktreeId/instanceId 且 setup 仍 pending，复用 placement 的主机、真实路径、common-dir、分支/路径冲突、owner/revision 校验；确认没有路径或分支后恢复 planned，再走原顺序创建。已存在路径/分支、已有登记或其他 setup 状态保留，需要后续对账，不自动复活外部删除的工作树。普通 run/启动没有自动恢复副作用。
- 57 项模块测试通过；增加并发 retry 断言后服务测试 11 项通过；tc:node 与固定基线 changed-code quality 通过（测试 if/else 风格初次失败，按规则修正）。日志 `.context/multi-repo-retry-{test,concurrency-test,typecheck,quality}.log`。测试覆盖失败后重试、重复 continue 去重、目录或分支已存在拒绝、已有登记但目录缺失不重建。
- 这只完成“没有已创建资源”的可重试分支。Git 已创建但 metadata/journal 未登记、根 Folder Workspace 回复丢失、setup 恢复/显式跳过、入口外部删除和安全清理仍未实现，不能把本提交当作 P2 完成。
- Claude 指定真实回归最终退出 1（约 442 秒），两个文件失败、6 项失败，并有 1 个 Vitest source-map EISDIR 错误。日志明确显示模型 glm-5.1 与测试预期 claude-haiku-4-5-20251001 不符；多个请求返回 rate_limit，fold/中断/回复断言未通过。未改变全局账户、模型映射或测试预期，也未将这些失败归结为本功能已证明无回归。后续需在可用且匹配的 Claude 执行环境复验；当前不再等待 session 5501，也不盲目重复消耗请求。
- 下一步推进已有资源对账、创建/管理 UI 和后续交付范围。隐藏应用仍是 bdd38a6021 对应 build，本轮 recovery 只经过测试，未重建 renderer 验证。Goal active，无需因 Claude 外部回归失败阻断其余工作。

### 2026-10-16：根 Folder Workspace 丢回复对账

- 上轮 ffd1bb9d2a 已提交安全重试，属于有效进展。本轮开始工作树干净；Claude 真实回归已终止失败，不再作为等待中的进程。
- 根登记意图新增可选 projectGroupId，在调用 createFolderWorkspace 前持久化；旧 schema 记录仍可读取，已登记的旧入口继续按 ID 校验。缺少组意图的旧“登记中”记录保守拒绝自动恢复，不猜测所属组。
- 显式 continue 可恢复已创建但丢回复的根入口：检查父/根 realpath、实际目录、marker 的 taskId 和成员计划，与预先保存的项目组内唯一的本机 Folder Workspace 匹配，补记原 ID；不再次创建入口。缺失、歧义、远端入口、marker 改动均保存 root.error 并拒绝。每次 run 对已知入口也检查实际路径、host、组及 marker，外部删除或修改入口不会触发复活。
- 63 项模块测试及 tc:node 通过；后续将 marker 校验扩展到已有入口并补充用例，单独复跑服务测试 18 项通过；固定基线 changed-code quality 通过。日志 `.context/multi-repo-root-recovery-{test,final-test,typecheck,quality}.log`。测试使用真实临时 Git/目录和模拟 Folder Workspace catalog；不是主进程强制退出后的完整实机恢复验收。
- 尚未覆盖根 mkdir/元文件中途失败、Git 成功后 metadata 未登记、setup 恢复及完整清理。下一步继续这些对账分支和 UI；P2–P5 未完成，Goal active。本轮未重建运行应用，隐藏应用仍为之前自动授权探针对应 build。

### 2026-10-16：根目录元文件初始化恢复

- 上轮 269d5738f8 已完成根入口丢回复对账，本轮起始工作树干净。把原先内联的 marker/TASK.md 生成抽到 root-files 模块，正常创建仍按原内容和 wx/0600 独占写入，后续恢复与清理可复用同一内容来源。
- 显式 continue 在根 creating/needs-attention、尚无入口登记、所有成员仍 planned/pending 且无登记身份时核对初始化。根不存在可恢复 planned；根已存在必须为真实目录、父路径未替换，具有内容精确匹配的 marker，且没有未知条目。只有 marker 时独占补写 TASK.md；两个文件内容都匹配则补记 created。空目录、symlink、未知文件、改过/截断的元文件均保留并记录错误，不覆盖或删除。
- 70 项模块测试、tc:node 和固定基线 changed-code quality 通过。测试覆盖三个成功中断点及空目录/未知文件/用户修改 TASK.md 的保留。补充登记身份保护后单独复跑服务测试 24 项通过；日志 `.context/multi-repo-root-files-{test,final-test,typecheck,quality}.log`。测试通过真实文件与持久意图模拟中断，尚非真实强制退出全过程验收。
- 未修改运行中的隐藏应用；完整已创建成员 metadata 对账、setup 恢复、创建/管理 UI、安全清理、独立安装包与同步演练仍待完成。Claude 实机回归仍保留上一轮失败结论，未重试限流请求。Goal active。

### 2026-10-16：预分配成员实例身份与已有 metadata 对账

- 上轮 a0d88cb0ea 已提交根初始化恢复，本轮起始工作树干净。检查上游创建顺序发现 metadata 先于文件准备、lineage 和 setup 完成；因此不能把找到 metadata 当作全部创建已成功，也不能只按路径/分支认领。
- 在成员 creating 意图中预先持久化可选 plannedInstanceId；Runtime placement 读取该 ID，materialization 使用它而非另外生成实例。普通创建仍用 randomUUID。创建结果若提供不同 instanceId 则拒绝接纳；Store 原有显式 instanceId 写入语义已核对。旧任务记录兼容读取，缺少预期 ID 时保守保留，不推测归属。
- 显式 continue 对无结果的失败成员先尝试恢复现有登记：metadata instance 必须等于预期 ID，实际布局、preserveBranchOnDelete、本机 host、源 common-dir 与真实 linked worktree 的路径/branch/gitdir 反向登记均须匹配。只补记原 worktreeId/instanceId，状态为 registered/setup pending，明确要求检查文件准备/setup；不重新 Git add，不重跑 setup，不启动根 Agent。找不到 metadata 才尝试已有的“无目录/分支”安全重试；身份不符保留错误。
- 111 项模块与 Runtime 创建测试通过，tc:node 通过；补充创建回复 instance 不符断言后服务测试 27 项通过，固定基线 changed-code quality 通过。日志 `.context/multi-repo-member-recovery-{test,final-test,typecheck,quality}.log`。新故障测试真实创建 Git worktree，以已有元数据丢回复模拟匹配/不匹配实例；尚未进行实机进程强制退出恢复。
- 仍缺 Git 已成功但 metadata 尚未持久化的接管、lineage/文件准备中断处理、setup 完成观察/显式决策及后续 UI/清理/产物。预分配 ID 为上述恢复提供依据，不等于已完成 P2。当前隐藏应用未重建这些变更；Claude 实机回归失败继续保留。Goal active。

### 2026-10-16：恢复 setup 结果观察

- 上轮 e363c06c23 已完成预期实例与已有 metadata 对账，本轮起始工作树干净。把正常创建时的 setup 完成等待抽为统一函数，显式 continue 对 registered 且持有原 setupTerminalHandle 的 running/failed 成员再次观察同一个终端；不重新执行 setup，不新建终端。
- 恢复观察前检查持久 worktreeId/instanceId 与当前 metadata 一致，并核对真实 Git 身份；确认 exitCode=0 后再复核一次，避免等待期间实例更换后错误标记 ready。非零、stale、超时或身份变化保留失败/needs-attention，根 Agent 仍被门禁阻止。close 期间不开始观察下一个成员；已有观察沿原 60 秒上限完成。
- 77 项模块测试与 tc:node 通过；补充等待期间实例替换用例后单独复跑服务测试 32 项通过。固定基线 changed-code quality 通过，日志 `.context/multi-repo-setup-recovery-{test,final-test,typecheck,quality}.log`。测试使用真实 Git/metadata 身份和受控 setup completion；不将其当作 daemon 重启后 token/输出必然可恢复的证据。
- 已查明上游 waitForSetupTerminalCompletion 在句柄失效时明确返回 terminal_handle_stale；无法证明原脚本退出成功时继续拒绝，不把失联解释为完成。仍需显式跳过/重试 setup 的产品决策与 UI、未完成文件准备/lineage 的处理，以及 metadata 尚未写入的成员接管。完整 UI、安全清理、独立产物和同步演练仍未完成；Claude 实机失败结论未改变。Goal active。

### 2026-10-16：侧栏创建表单及隐藏 renderer 验收

- 新增独立创建 Dialog/成员字段/侧栏 Launcher，复用 RepoMultiCombobox、AgentCombobox 和现有 Folder Workspace 激活。可跨组选择本机仓库，填写名称、任务说明、绝对父目录、根/成员目录、ref、分支及 setup 策略，可选 Codex/Claude 根 Agent。显示路径计划、轮询阶段/实际错误、继续/重试及打开根入口；稳定 requestId 在未知提交结果时保持原请求，已确认未落盘的预检失败允许编辑。轮询不重叠并在卸载时清理。
- 两个既有选择器只增加可选 trigger id，多仓选择器另增加可选空选提示，供 Label 关联，不改变既有调用默认行为。使用浏览器兼容 UUID 和现有样式 tokens/primitives；初次路径/curly/scrollbar 检查问题已修正，滚动样式放在普通内层容器。
- tc:web、固定基线 changed-code quality、Electron build/runtime 校验通过；选择器相关 2 文件 6 测试通过。日志 `.context/multi-repo-ui-{typecheck,quality,build,runtime,combobox-tests}.log`。
- 使用 electron skill、Playwright CDP 9567、隐藏 renderer，正常 app.restart 加载新 build，全程 ORCA_BACKGROUND_LAUNCH=1。真实点击侧栏入口，从两个项目组选择 Probe api/web，选择跳过 setup、无根 Agent，创建 task 069c8876-e015-48fd-a5aa-aad934f696dd；两成员 ready/skipped，真实 Git 核对路径/分支 task/069c8876 且干净，点击打开根入口成功。证据 `.context/multi-repo-ui-{submit.mjs,submit.log,created-task.json,plan.png,ready.png}`。最终标签版本再验证无障碍关联、空选提示及 relative-path 预检失败，任务数不变、字段仍可编辑：`.context/multi-repo-ui-invalid.{mjs,log,png}`。未在此 UI 用例调用模型，先前自动 Codex 证据继续有效但不冒充表单 Agent 选择已实机验收。
- 此提交仅创建入口第一阶段：尚缺管理列表/关闭后重开任务、命令面板、默认父目录及 Agent 偏好、提交前解析 commit 的完整计划、中文友好阶段与全套 i18n、完成自动进入、未知结果/关闭中提交回归。当前父目录须手输，进度仍为内部状态文字；关闭表单不会取消后台任务，但尚不能从 Launcher 找回进度。仍需 P2 恢复剩余分支、安全清理、独立安装产物及有限同步演练；Claude 实机回归失败结论不变。Goal active，未交付完整日常版本。

### 2026-10-16：重启后找回任务及 Folder Workspace 读取修复

- 上轮 8ff70bb128 已提交创建表单，本轮开始工作树干净，属于有效进展。新增管理列表，创建 Dialog 的“查看已有需求”进入当前 profile 的持久任务列表；可看详情、继续同一任务、打开根工作区、返回列表或新建。抽取统一 TaskDetails 供创建和管理复用，中文阶段/实际错误、无重叠轮询、较旧 revision 不覆盖新结果，记录不存在时禁用操作。侧栏按 activeOrcaProfileId 重挂入口，避免跨配置保留旧表单。
- 实机首次重启验收失败，发现普通项目组的根 Folder Workspace 被读取规范化丢弃：runtime/store 的创建接口允许显式 folderPath，但 normalizeFolderWorkspaces 只认可有 parentPath 的组。已修正公共读取逻辑保留任意现存组中的明确路径；仍过滤孤儿及没有可解析路径的记录，不改变 SSH connectionId 归属。这是创建/重启契约不一致，未绕过多仓所有权校验。此前被旧读取逻辑清掉的 6 个测试任务根入口未自动复活，原 task 069c8876 仍保存错误；这些记录与文件留作恢复验收素材。
- 20 项 Folder Workspace/持久化测试通过（新增普通组本机/SSH明确路径及再读取、缺路径/孤儿过滤回归）；全量 pnpm tc、固定基线 changed-code quality、Electron build/runtime 校验通过。日志 `.context/multi-repo-manager-{folder-tests,typecheck,quality,build,runtime}.log`。
- 使用 electron skill + Playwright CDP 9567，后台新构建从真实表单创建 task ae88941e-e886-4c06-a942-9c170482d90e（api/web 两组），普通 app.restart 后管理页找回该任务，两成员 ready/skipped、根入口仍可用。点击继续后 task 总数仍 7，worktreeId/instanceId 未变化；返回列表→新建→关闭→重新管理→打开根工作区通过。脚本和证据 `.context/multi-repo-manager-{create.mjs,created-task.json,check.mjs,check.log,verified.json,list.png,detail.png}`。未用 API 直接替代被验收的 UI 操作，API 仅取记录作断言；全程隐藏 renderer，无激活窗口。
- 管理基础入口已具备，不代表完整 P2/P3：仍缺归档/重命名、成员导航、安全清理、失去根入口后的显式恢复、其余中断恢复、命令面板/完整创建预览/默认设置/i18n、安装包和同步演练。历史测试 task 根入口丢失不影响磁盘 worktree 数据，但不会因修复读取自动恢复；正式发布前须完成恢复说明与验收。Claude 实机失败结论未改变，Goal active。

### 2026-10-16：清理影响只读预览

- 上轮 57f3d7eaab 为有效提交，本轮起始工作树干净。接通 previewRemoval 的模块/service、受信主帧与 profile 校验 IPC、preload 类型及管理详情按钮。只读返回 task/revision、成员路径/保留分支、未提交/未跟踪/ignored 内容、列表截断及身份错误；根目录列出内容未变的模块元文件与需保留的未知/修改条目。任务活跃操作/关闭时拒绝，读完 revision 改变则要求刷新。未提供删除执行按钮。
- 将已有成员登记恢复中的身份检查抽成同文件函数，恢复与预览共用 host、instance、preserveBranchOnDelete、创建布局、源 common-dir 和实际 Git 工作树身份校验。复用 getStatus(includeIgnored, includeLineStats=false, limit=200)，未另写 Git 执行/解析。根文件仍复用 multiRepoRootFiles 内容来源；symlink 元文件不会列为可清理。
- 模块首次测试中的 5 个既有文件通过，新预览 3 项因测试 fixture 漏绑 owner 失败；补齐真实 owner 后新预览 4 项全过，覆盖真实 dirty/untracked/ignored、修改 TASK/根笔记保持、metadata 实例替换、symlink、detached HEAD。新增 IPC 权限/ID 用例后该文件 5 项通过。全量 pnpm tc、固定基线 changed-code quality、Electron build/runtime 检查通过。日志 `.context/multi-repo-removal-preview-{tests,tests-final,ipc-test,tc,quality,build,runtime}.log`。
- electron skill + Playwright CDP 9567 隐藏 renderer 实测，在隔离任务 ae88941e 的 api 写入测试 .gitignore 与 preview-ignored.txt，根加入 preview-notes.md；从管理详情点击“检查清理影响”，显示未跟踪 .gitignore、ignored 内容及保留根笔记，读取确认 ignored 原文仍在、成员状态未改变。证据 `.context/multi-repo-removal-preview-check.{mjs,log}` 与 `.context/multi-repo-removal-preview.png`。测试文件有意保留供后续安全删除验收，脚本 wx 写入不可直接重复运行。
- 本轮是清理预览第一阶段，不是完整清理授权：尚未列出/停止根会话及服务、未检查所有上游删除保护（锁/归档 hook/PTY退出等），也未调用 removeManagedWorktree。下一步必须接根停机门禁、执行时重新核验、保留 ignored/用户内容策略、waitForBackgroundRemoval 完成确认及逐成员失败恢复，之后才能开放删除。其余恢复、归档/改名、默认设置/命令面板、P4/P5 交付仍未完成。Goal active，Claude 实机回归失败结论不变。

### 2026-10-16：根会话严格停机入口与本机主机边界

- 上轮 f2222ce5b3 已提交清理预览，本轮工作树起始干净。新增 stopRootForCleanup service/IPC/preload 和预览区域的“停止根会话”确认操作；先核对持久根登记/marker、实际 folder ID/path/group/local host，再调用已有 killAllProcessesForWorktree(requirePhysicalStop=true)。不使用 Folder Workspace 移除入口的 best-effort teardown，不设置 allowUnverifiedStop；失败直接返回，不改变成员/删除文件。当前活跃任务操作拒绝并发 stop，profile close 等待已发起停机。
- 发现通用 teardown 的 resolvedConnectionId 类型与 truthy 转发无法保留 null（主机 fence 已定义 null=仅本机，undefined=未限定），将该可选参数扩为 string|null 并按 !==undefined 转发。新入口显式传 null；原字符串/省略行为不变。现有 SSH 转发用例参数化覆盖 null，避免同 ID 的远端 PTY 被 runtime sweep 包含。
- 4 个停机/多仓服务测试文件 120 项通过；追加 null 与 IPC 权限回归后 2 文件 36 项通过。服务测试覆盖根入口外部删除拒绝、unverifiable 传播且成员保持。全量 pnpm tc、固定基线 changed-code quality、Electron build/runtime 检查通过；日志 `.context/multi-repo-root-stop-{tests,host-tests,tc,quality,build,runtime}.log`。
- electron skill + Playwright CDP 隐藏 renderer 实测 task ae88941e：取消确认保留根 PTY；确认后 folder:14020651-07e4-41d3-aaa5-2370aeaa04d1@@a08cdd44 从 daemon session list 消失，其他 18 个原有会话均在，成员记录不变。证据 `.context/multi-repo-root-stop-check.{mjs,log}`、`.context/multi-repo-root-stop-verified.json`、`.context/multi-repo-root-stop.png`。该用例为真实根 shell，不声称新增真实模型/structured agent 停机验收；后者目前由既有回归覆盖。脚本要求根 PTY 活跃，停止后不能直接重复运行。
- 尚未开放成员删除。此入口只确认当次停止，不是永久许可，用户随后可重新开会话；删除时必须再次停止、重新校验、调用已有 removeManagedWorktree 并等待后台完成。还需补齐独立 cwd 服务/没有 folder-ID 前缀的根进程归属、archive hook 后 ignored 内容保护、根会话新启动与删除互斥、逐成员失败恢复和根目录最终清理。不能把“停根成功”当作清理门禁全部完成。P2 剩余恢复、P3 归档/清理执行、P4/P5 等目标仍未完成，Goal active。

### 2026-10-17：根目录内未登记归属 PTY 停机

- 上轮 367b28db83 已提交根会话停机，本轮起始工作树干净。补齐 Folder Workspace ID 无法推导文件路径导致的 cwd fallback 缺口：主进程内部 teardown 可接收 verifiedLocalRootPath，复用现有 provider sweep 的路径包含判断、并发停机、失败退出核验。多仓入口只有在 service 已核对 root marker/实际路径和 Folder Workspace 身份后才传 task.plan.rootPath。
- 此参数必须同时显式指定 resolvedConnectionId=null 且无 runtime environment，其他主机/省略 fence 在读取 provider inventory 前拒绝。仅匹配未携带 worktreeId 且 cwd 位于根下的 provider 会话；有其他权威 worktreeId 的成员/兄弟会话仍留给自己的停机流程，相邻字符串前缀路径不匹配。不新增 RPC/wire 字段，也不改变普通工作树已有路径推导。
- 2 个停机文件初次 49 项通过；补充 untagged PTY 停止失败且仍 live 时拒绝用例后，teardown 文件 34 项通过。tc:node、固定基线 changed-code quality、Electron build/runtime 校验通过。日志 `.context/multi-repo-root-cwd-{tests,final-tests,tc,quality,build,runtime}.log`。
- electron skill + Playwright CDP 隐藏 renderer 验收：通过本机 PTY API 创建无 worktreeId 的隔离探针 6bbbea4e-2ac6-43ff-aa6d-3a453708c58e。首次 shell 实际 cwd 为 /Users/wzh（初始 inventory cwd 为空），故未匹配需求根、探针未停；这是探针前置条件未成立，未重启/重建探针。向同一 PTY 输入 cd 并通过 getCwd/listSessions 确认进入 task ae88941e/api 后，点击管理页“停止根会话”并确认，探针退出且原有 18 会话均保留。证据 `.context/multi-repo-root-cwd-{probe.json,check.mjs,check.log,png}`（图片实际为 `.context/multi-repo-root-cwd.png`）。探针已终止，脚本不能原样重跑。
- 该证据覆盖 Orca provider inventory 中的未登记 PTY，不声称发现/停止所有脱离 PTY 的系统进程。仍需完整删除执行路径、archive hook 后文件检查、根新会话与删除互斥、后台删除完成/部分失败恢复、只清理未改元文件与空根目录；以及 P2 剩余恢复、P3 归档、P4/P5 产物/同步。Goal active，未缩减原范围。
- 提交钩子发现既有 teardown 测试文件超过 800 行上限，已把新增 4 项移至 worktree-teardown-root-cwd.test.ts，未修改/禁用上限。拆分后 4 项测试与 changed-code quality 再次通过，日志 `.context/multi-repo-root-cwd-split-tests.log`。

### 2026-10-17：受保护的单成员清理执行

- 上轮 b3b3d54b88 为有效进展，本轮起始工作树干净。接通 removeMember(taskId, repoId, revision) 的严格 Zod/主帧/profile IPC、preload、service 任务串行化及清理预览中的逐成员确认按钮。过期预览拒绝；已移除成员显示已清理，dirty/untracked/ignored/截断或身份错误时不允许 UI 清理，主机仍独立复核。
- 删除前复用成员身份和 getStatus 检查，持久记录 removing 意图。既有 removeManagedWorktree 新增 main-only beforeDelete 回调，在 archive hook、成员停机、watcher/terminal fence 内且 unlink shared paths 前调用；多仓回调严格停止根会话，再核验实例/Git/文件。普通删除未传回调时保持原行为；带回调的新请求拒绝拼接已有删除。多仓删除保持调用方等待实际完成，不写入上游自动续删 sidecar，崩溃后由持久任务 removing 状态待显式对账，避免自动破坏性恢复。force=false、runHooks=true、waitForBackgroundRemoval=true，元数据保留分支；目录确认不存在且门禁回调确实执行才标 removed，失败保存 needs-attention/错误。
- 7 文件 1478 项测试通过、1 项跳过；补充 IPC 与 guard 内根/成员终端安装拒绝断言后，2 文件 1395 项通过、1 项跳过。真实临时 Git 测试覆盖保留分支、ignored 在任何停机前拒绝、停机中新写 ignored 时保留成员、根 unverifiable 不删；runtime 测试覆盖 archive 成功后仍由 owner guard 拒绝、无 unlink/delete。全量 pnpm tc、固定基线 changed-code quality、Electron build/runtime 校验通过，日志 `.context/multi-repo-delete-{tests,final-tests,tc,quality,build,runtime}.log`。
- 此轮全量 tc 发现上轮拆分后的 root-cwd 测试窄 provider stub 单层断言不能通过 TypeScript；改为带已有 SAFETY 原因的 unknown 中转断言，仅测试 stub。上轮 tc:node 发生在拆分之前，因此不能把该上轮结论外推为拆分后已验。本轮最终全量 tc 已覆盖修正。
- electron skill + Playwright CDP 隐藏 renderer 实测 task ae88941e：api 有 .gitignore/ignored 文件，清理按钮禁用；web 干净，取消后目录仍在，确认后目录移除且 task.members 中对应 state=removed；保留 task/ae88941e 分支及原 head 2f4ee251d831a691c0b55dccfa2dea2c7552068d。api/preview-ignored.txt 与根 preview-notes.md 内容不变。证据 `.context/multi-repo-delete-check.{mjs,log}`、`.context/multi-repo-delete-verified.json`、`.context/multi-repo-delete.png`。该 web 测试成员已删除，不再可原样复跑之前要求两成员 ready 的脚本。
- 仍未完成：全部成员移除后的根元文件/空根目录清理、删除中断后 metadata/Git 部分成功对账与显式恢复、独立进程验收、原生 Chat 启动与删除的在途竞态（终端 fence 已验，不能冒充 structured launch 全部覆盖）。archive hook 新生成 ignored 时的真实应用端到端用例也待补；当前相关逻辑由分层回归覆盖。其余 P2 恢复、归档/改名/完整 UI、P4/P5 产物与同步保持原范围。Goal active，未作为日常版本交付。
- 提交钩子发现 service 超过 300 行；将删除的记录读取/版本校验归入 removal 模块并统一 stopRootForCleanup 参数名，未禁用上限。重构后 8 项真实 Git 预览/删除测试、tc:node、changed-code quality 再次通过（`.context/multi-repo-delete-{refactor-test,final-tc,quality}.log`）。运行中隐藏应用仍为此次模块归位前的等价构建，后续实机操作前需重建。

### 2026-10-17：原生 Chat 启动与成员清理互斥

- 上轮 a21bb93939 为有效进展。共享 structured acquisition 增加主机侧启动门禁，生产 runtime 按既有 launch-directory resolver 解析真实本机目录；在 provider acquire 之前登记，直到成功持久化 owner 或失败清理完成才释放。保留已有 pre-spawn 错误分类；没有新增 RPC 字段或依赖。
- 复用 watcher/terminal removal gate，新增不可超时丢弃的 agent startup slot。根 Chat 启动会阻止子成员删除，子目录启动也阻止父目录删除；已有删除阻止重叠目录的新启动。启动不结束时删除超时失败并释放删除门禁，不继续破坏性操作。SSH 同名路径、相邻目录不受本机 slot 影响。
- 全共享会话回归 251 文件中 250 文件通过，2158 项通过、5 todo，唯一失败为新增测试误断言用户层错误文案；修正为 pre-spawn 类型和 provider 未被调用断言后，门禁/新会话竞态/runtime 创建与停机 4 文件 35 项通过。用受控 provider 覆盖启动成功、启动失败清理尚未结束、删除期间拒绝启动；不冒充真实模型竞态实机验收。tc:node 与固定基线 changed-code quality 均通过。日志 `.context/multi-repo-chat-fence-{tests,final-tests,final-tc,quality}.log`。
- 本轮未改 UI、未启动真实模型或应用，隐藏应用仍需重建后才能检验最新逻辑。未完成的根目录最终清理、删除中断恢复、其余 P2/P3、独立应用和 P4/P5 交付仍保持原范围；Claude 实机失败结论未改变，Goal active。
- 提交钩子发现 runtime 接入文件超出 300 行，将门禁回调构造收进新模块，未禁用规则；重构后 2 文件 21 项通过，oxlint 通过，tc:node 复验。日志 `.context/multi-repo-chat-fence-refactor-tests.log`。

### 2026-10-17：已完成删除和外部移除的显式对账

- 上轮 061fbe5e76 已提交启动门禁，属于有效进展，本轮起始工作树干净。扩展既有“继续任务”恢复流程，对已登记成员复用本机 host、root 布局、source common-dir、instance/layout 身份校验。目录不存在时，使用现有 Git 兼容列表读取器检查原路径及分支是否仍登记，再检查 Orca metadata；三者均不存在才持久标记 removed，不重建成员、不重跑删除、不清理分支。
- 删除被打断但原成员完整时改为 needs-attention，要求刷新清理预览并重新确认；目录替换/移动、残余 Git 登记、残余 Orca metadata、源仓库无法验证、缺少 durable instance 均拒绝推断成功。已有 setup 观察仍复用原句柄；测试夹具补齐生产创建实际写入的 preserveBranch/layout 元数据，未降低校验。
- 6 文件 100 项模块测试通过；追加无实例身份回归及最终状态分支后清理/对账文件 18 项通过。tc:node、oxlint、固定基线 changed-code quality 通过。证据 `.context/multi-repo-reconcile-{tests,final-tests,tc,quality}.log`，真实临时 Git 用例包含保留分支、重开 journal、Git 残留、worktree move、路径新笔记保留、source 缺失及完整成员要求再次确认。
- 未启动应用或模型；本轮证据为主机模块与真实 Git 测试，不宣称隐藏 UI 的继续按钮已经实机验收。仍需处理目录已删但 Orca/Git 登记残留的显式修复、全部成员清理后的根目录收尾、根入口恢复、其余 P2/P3 和 P4/P5；不将只读对账当作完整删除恢复。Goal active。

### 2026-10-17：仅剩 Orca 登记的显式清理与旁路封堵

- 上轮 b2f8b2636e 为有效进展，本轮起始工作树干净。将成员检查复用于对账、预览与删除，区分完整 worktree、仅有 Orca 登记、全部已移除。保留原 metadata 实例/layout/native/source common-dir 检查，目录缺失且 Git 未登记原路径或分支时，预览允许再次确认清理登记；不把缺失当作可重建或可强删。
- 复用 removeManagedWorktree 的 unregistered 分支，在 watcher/terminal 门禁内严格停止成员、调用多仓根停机和再次身份检查，随后再次验证路径仍不存在，再执行原有 push-target/metadata/history 清理。新目录在停机等待期间出现则失败并保留登记和文件；实际分支不删除。旧后台删除记录不能被带新 guard 的请求自动续跑；repo 变成 folder/失去登记、特殊 stale Git 清理路径也拒绝绕过 guard。
- 原 workspace-removal 接入超过 300 行，抽出已有 stale registration 分支为 runtime-stale-worktree-removal，保留原分支保存、remote 清理、purge/通知顺序；未调整规则或复制整套删除。普通删除路径保持已有行为。
- 模块 6 文件 104 项通过，runtime aggregate 1392 项通过、1 跳过；新增真实 Git 用例覆盖登记残留成功、实例被替换拒绝、停根中新建 notes 保留，runtime 用例覆盖 gate 内回调、回调拒绝、目录重现及旧后台记录不被续跑。首次 runtime 用例因 fixture 未标 hostId=local 被精确 host 解析拒绝，补齐匹配生产登记的 host 后通过，未放宽主机校验。tc:node、oxlint、固定基线 changed-code quality 通过，日志 `.context/multi-repo-remnant-{tests,runtime-tests,tc,quality}.log`。
- 未启动真实应用/模型，本轮尚无 UI 实机证据。仍有 Git 登记残留的安全修复、根目录最终清理、根入口恢复、其余 P2/P3、独立安装包及 P4/P5 验收待完成。此处仅补齐 metadata-only 残留，不能声称完整清理恢复已完成。Goal active。
- 最终补齐缺失目录的布局边界：member 路径仍须与 root/directoryName 严格匹配且直属根目录；防止缺失路径绕过原 present-worktree 的布局校验。追加外部路径用例后清理文件 22 项通过，固定基线质量检查再次通过，日志 `.context/multi-repo-remnant-final-tests.log`。

### 2026-10-17：根目录与入口的受保护收尾

- 上轮 19cf35b6f0 为有效进展，本轮起始工作树干净。新增 removeRoot(taskId,revision) 的 service 串行化、主帧/profile/严格 schema IPC、preload 和管理页确认按钮；只有全部成员已移除时显示收尾入口。主机仍重新检查真实成员目录/Git/metadata，拒绝依赖 journal 单方面声明。
- 收尾持有原有 root watcher/terminal/startup 删除门禁，严格停根后复核成员。删除前持久记录 root.cleanupIdentity（device/inode 字符串）；只 unlink 内容与生成器相同的普通文件，保留 symlink/修改/未知内容，marker 最后删除，仅用 rmdir 删除空根。残留笔记会阻止完成并保留 marker/侧栏入口；无递归根删除。目录身份变更拒绝。目录已消失或 marker 已删但记录未完成的重试依靠已保存身份，完成现有 Folder Workspace 删除后再标 root removed；已移除详情禁用打开/继续并隐藏清理区。
- 沿用 schemaVersion 1，cleanupIdentity 为可选 additive 本机字段；没有新增远端 opcode。为保持 service 行数，将原 stopRootForCleanup 的记录读取/登记校验归入 root-removal 模块，原停机行为不变。
- 模块初次 6 文件 113 项通过，新增 IPC 用例后该文件 8 项通过；全量 pnpm tc、oxlint、固定基线 changed-code quality、Electron build/runtime 检查通过。根收尾测试覆盖普通删除、笔记/修改/symlink 保留、unverifiable 停机、marker/目录删除后的重开 journal 恢复、同路径目录替换。日志 `.context/multi-repo-root-cleanup-{tests,ipc,tc,quality,build,runtime}.log`；最终补充过期 revision、成员未移除及登记重现用例见 `.context/multi-repo-root-cleanup-final-tests.log`。
- electron skill + Playwright CDP 9567 隐藏 renderer、正常 app.restart 加载本轮 build，全程 ORCA_BACKGROUND_LAUNCH=1。真实表单新建单 api task 985f1af2-27dd-47c2-b5f4-aeed668f30be，UI 清理成员后：取消根收尾保留 TASK；确认因 notes.md 保留而拒绝完成，notes/marker 原文仍在；将测试 notes 移到 `.context/multi-repo-root-cleanup-preserved-notes.md` 后再次确认，根目录不存在，任务 root removed，打开/重试禁用。实际分支 task/985f1af2 仍为 d505c0af71fd1180172eeca853119f41f92e3421。证据 `.context/multi-repo-root-cleanup-{check.mjs,check.log,created.json,verified.json,retained.png,removed.png}`；该已删除 fixture 不可直接重跑早期创建后操作脚本。
- 本轮未运行真实模型；已有 Claude 实机失败结论仍保留。仍需 Git 登记残留修复、根入口显式恢复、其余 P2/P3 管理和创建体验、独立身份/安装回退/P4/P5。根收尾已具备并完成一次真实 UI 路径，不据此宣称整个目标完成。Goal active。

### 2026-10-17：丢失根入口的显式恢复

- 上轮 e932c5a94c 已提交根收尾并实机验收，属于有效进展，本轮起始工作树干净。新增 restoreRoot(taskId,revision) service/IPC/preload 与管理详情确认按钮。原目录、parent realpath、普通 marker 的 taskId/成员计划必须匹配，原项目组仍须存在且属于本机；不自动新建丢失的组、不重建成员、不启动 Agent。
- 恢复优先沿用原 ID 的有效入口；原 ID 消失时只关联原组内唯一的同路径本机入口，无匹配才复用 createFolderWorkspace。多重匹配/其他组/原 ID 被移到别处/remote group/marker 改动/已清理任务拒绝。创建前持久化 creating 意图，丢回复后下次显式恢复从唯一匹配项接续；原有“继续任务”仍不会自动复活用户删除的入口。
- 将原 root registration 的目录/marker 验证提取共用，避免另写弱化检查。service 的 restore/removeMember/removeRoot 复用同一个 revision 操作前串行占用检查，维持 300 行限制，未禁用规则。
- 43 项服务测试与最终 6 文件 126 项模块测试通过；包括丢回复、重复恢复、成员/agent 不变、组/marker/重复入口等拒绝，以及 IPC 严格字段和 inactive-profile 检查。全量 pnpm tc、oxlint、固定基线 changed-code quality、Electron build/runtime 检查通过。日志 `.context/multi-repo-root-restore-{tests,final-tests,tc,quality,build,runtime}.log`。
- 使用 electron skill + Playwright CDP 9567 隐藏 renderer，正常 app.restart 加载新构建；复用旧读取规范化问题留下的真实 task 069c8876-e015-48fd-a5aa-aad934f696dd。先断言旧根 ID/同路径入口均不存在，从管理页取消恢复不改 revision；确认恢复生成新 folder 4018ffe1-8a35-4975-b35e-b3686b45cd7d，重复恢复沿用该 ID，总入口仅增加 1。成员记录、agent 记录和磁盘 marker 不变，点击打开根入口成功。证据 `.context/multi-repo-root-restore-{check.mjs,check.log,verified.json}`、`.context/multi-repo-root-restore.png`。该 fixture 已恢复，脚本不能原样重跑“原入口不存在”的前置条件；其他旧测试任务未自动恢复。
- 未运行真实模型；本轮恢复不迁移旧根 ID 的会话历史，不声称恢复已退出模型进程。仍需其余 P2 中断分支、Git 登记残留修复、归档/重命名/完整创建体验、独立应用身份与安装回退/P4/P5。Goal active。

### 2026-10-17：复用根入口的显示名称与归档

- 上轮 f7182885c2 已完成显式恢复并实机验收，本轮起始工作树干净，属于有效进展。按批准方案“普通改名/归档沿用现有接口”，新增管理详情的根入口显示设置，直接调用已有 updateFolderWorkspace、显式 executionHostId=local；不新建任务元数据写入协议或归档状态 store。列表和详情订阅同一 Folder Workspace 名称/isArchived，归档入口仍在需求管理列表可发现并取消归档。
- task journal 保留创建时名称，根生成文件、目录、分支和成员均不改；后续清理仍按创建内容比较 TASK.md，避免显示名变化把原始生成文件误判为修改。根入口不存在/已移除时管理页退回创建名称，恢复入口沿用创建名称；不承诺恢复被外部删除的入口显示元数据。编辑控件只对匹配 task ID 对应 folder ID/path/group 的本机入口显示，更新前再核对当前 store owner。
- 新选择器及现有 host-routed folder mutation 两文件 27 项通过；tc:web、oxlint、固定基线 changed-code quality、Electron build/runtime 校验通过。日志 `.context/multi-repo-root-settings-{tests,tc,quality,build,runtime}.log`。最初新增 selector hook 放错到 effect cleanup 前的作用域，被 lint/typecheck 拦下，已移到组件顶层后复验通过。
- electron skill + Playwright CDP 9567 隐藏 renderer 实测 task 069c8876：空白显示名称禁用保存，改名为“UI 跨组创建验收 · 已改名”，归档后管理列表仍可找到；正常 app.restart 后名称/归档保持，取消归档成功。两阶段逐项断言 task journal、TASK.md、marker、根路径未变，原 18 个 provider 会话均保留。证据 `.context/multi-repo-root-settings-check.mjs`、`.context/multi-repo-root-settings-{edit,verify}.{log,json,png}`。该 fixture 当前已改名、未归档，旧按创建名称找列表项的脚本需据当前入口名调整。
- 未运行真实模型，未迁移全局账号或官方配置。其余 P2 中断分支、Git 登记残留修复、成员导航/创建体验与完整验收、独立身份/安装回退及 P4/P5 仍未完成。Goal active。

### 2026-10-17：从需求详情打开成员

- 上轮 789b3e9143 为有效进展，本轮起始工作树干净。需求详情增加逐成员打开按钮，复用 activateAndRevealWorktree 与标准仓库导航；打开前通过 requireAuthoritative 刷新本机成员列表，再核对持久 instanceId、repoId、路径、worktreeId 和本机 owner，拒绝刷新失败、远端/runtime owner、被替换或清理中的成员。失败保留管理页并展示错误。
- 新成员默认打开普通终端（agent=null），不因用户默认 Agent 设置额外启动模型；既有会话恢复行为沿用标准导航。无新 IPC、主机状态 store 或依赖。
- 11 项导航测试、tc:web、固定基线 changed-code quality、Electron build/runtime 检查通过，日志 `.context/multi-repo-member-nav-{tests,tc,quality,build,runtime}.log`。覆盖权威刷新失败不能采用缓存、实例/仓库/路径变化、本机归属检查、removing 和激活失败。
- electron skill + Playwright CDP 9567 隐藏 renderer 实测已恢复并改名的 task 069c8876：从管理详情分别打开 api/web，管理页关闭且各自 provider session 的 worktreeId 与计划路径匹配，任务记录不变。web 截图显示终端 cwd 为成员 web、Explorer 为 Probe web。证据 `.context/multi-repo-member-nav-check.{mjs,log}`、`.context/multi-repo-member-nav-verified.json`、`.context/multi-repo-member-nav-{api,web}.png`。未在此轮独立实测 Diff/Review 或真实模型。
- 仍需其余 P2 中断恢复、Git 登记残留修复、创建体验/完整验收、独立应用身份与安装回退及 P4/P5。此轮仅交付成员导航，不将整体目标标为完成；Goal active。

### 2026-10-17：首次 setup 等待也核验成员身份

- 上轮 cb61a343a2 已提交成员导航并实机验收，属于有效进展，本轮起始工作树干净。检查创建/恢复路径发现首次 setup 等待未传可选 verifyWorkspace，仅恢复等待核验身份；因此等待期间成员被移除/替换仍可能按 exit 0 标记 ready。
- 去掉可选校验回调，首次和恢复等待统一使用既有 verifyMultiRepoMemberRegistration，等待前及成功返回后检查持久实例、worktreeId、本机 owner、原 source/common-dir、实际成员 Git/路径与分支保留布局。等待前身份失配记 needs-attention；等待后的失配记 setup failed，不能 ready 或触发根 Agent。恢复仍观察原 setup 句柄，不重跑脚本、不重建成员。
- 服务 46 项、模块 6 文件 129 项测试通过；真实 Git 覆盖初次 setup 成功/非零退出、等待期间登记消失、worktree move 和源仓库移动，同时保留既有中断恢复用例。tc:node、固定基线 changed-code quality 通过。日志 `.context/multi-repo-setup-identity-{tests,regression,tc,quality}.log`。
- 本轮未启动应用/真实模型，隐藏应用仍是上一轮构建，下一次实机检查前须重建。Git 成功但 metadata 未写入、文件准备中断、setup 显式跳过/重试等 P2 路径尚未补齐，P4/P5 仍待完成。Goal active，未缩减批准范围。

### 2026-10-17：Git 成功后缺失登记的显式修复

- 上轮 9c82370075 为有效进展，本轮起始工作树干净。继续任务时，对尚无 worktreeId/instanceId、setup pending 且保留 plannedInstanceId 的 interrupted create，允许恢复缺失的 Orca metadata。沿用原 Git create executor、主机/根 marker/成员 Git 身份校验及 setWorktreeMeta，不再次 worktree add，不执行文件复制或 setup。
- 原路径必须是真实 linked worktree，source/common-dir、计划分支、HEAD 起始 commit 和 root marker 均匹配；写前再核对 journal revision、metadata 仍不存在、无 pending removal 和本机 owner。写入预分配 instance、project/host identity、baseRef、根 layout 与 preserveBranchOnDelete。已有 metadata 仍走原实例校验，不覆盖；未知目录/无 intent/移动的源/不同 branch 或 HEAD 拒绝修复。修复后 registered/setup pending，继续明确提示文件准备及 setup 待检查，不能据此启动根 Agent。
- 6 文件 135 项测试、tc:node、固定基线 changed-code quality 通过。真实 Git 测试覆盖成功修复且 notes 原文不变、HEAD/branch/marker/source/intent 拒绝；保留原实例冲突与删除对账回归。首次回归仅旧拒绝用例的错误文本不匹配，更新为新 Git 身份失败证据；类型检查要求补齐只读删除夹具的 setter，该 setter 固定抛错，确保删除对账未调用登记写入。日志 `.context/multi-repo-registration-repair-{tests,regression,final-tests,tc,final-tc,quality,final-quality}.log`。
- 未运行应用/模型，下一次实机验收需重建。该改动只补齐 Git-created/metadata-missing 的登记阶段，尚未恢复 lineage、文件准备及 setup，不声称此中断分支已完整可用；其他 P2/P3、独立身份/产物与 P4/P5 仍在原范围。Goal active。
- 提交钩子发现 service 类型展开后超出 300 行两行；改为复用 recoverMultiRepoMembers 的 store 参数类型，移除重复类型及无用导入，未提高/禁用行数限制。类型与质量检查重新通过后提交。

### 2026-10-17：中断创建的成员父子关联恢复

- 上轮 8e523a5655 已补齐缺失 metadata 修复并通过回归，属于有效进展，本轮起始工作树干净。显式继续时，对 setup pending 且实例等于预分配 intent 的恢复成员，在登记/Git 身份核验后补齐到原根 Folder Workspace 的 lineage；已恢复登记后再次继续也可接续这一阶段。
- 复用 recordCreatedWorktreeLineage，唯一上游改动是把其 store 类型缩小到实际调用的两个 setter，运行逻辑不变。恢复时根 folder ID/path/group/local owner 必须匹配；相同父子实例关联保留原对象和时间，冲突父入口/子实例/父实例保留并报错，不覆盖。只处理未完成创建，正常 ready 成员和删除对账不补建 lineage。没有新增状态 store、IPC 或远端 wire 字段。
- 7 文件 148 项测试、tc:node、固定基线 changed-code quality 通过。新增 13 项关联用例覆盖幂等、写入成功但回复丢失、既有用户关联保留、根入口缺失/路径/组/SSH/host 变化和非中断创建拒绝；真实 Git 服务测试验证缺失 metadata 恢复后关联存在、再次继续不重写。只读删除夹具的 lineage setter 固定抛错，回归确认未调用。日志 `.context/multi-repo-lineage-recovery-{tests,final-tests,tc,final-tc,verified-tc,quality,final-quality}.log`。首次类型检查指出 TS 不追踪被调用函数对 member.state 的修改，改为显式只接受 registered/needs-attention；首次质量检查的重复类型导入已合并，最终检查通过。
- 未启动应用/真实模型，后续实机检查需重建。文件准备中断与 setup 显式处理仍待完成，登记/lineage 恢复后保持 setup pending，不启动根 Agent。其他 P2/P3、独立身份/产物/回退与 P4/P5 保持批准范围，Goal active。

### 2026-10-17：文件准备与 setup 之间的持久阶段记录

- 上轮 910575930a 为有效进展，本轮起始工作树干净。检查既有 materialization 后确认：目标存在会跳过，无法凭此判断中断的目录复制是否完整，不能盲目重跑后直接宣布恢复成功。本轮先为正常创建增加可复核的阶段记录，后续恢复可区分文件准备已返回与未知。
- RuntimeManagedWorktreeCreateArgs 新增 main-only onFilesPrepared 回调，在本机 materialize（含 lineage、链接/共享目录/include）返回后、setup 准备/执行前调用。多仓 service 回调验证创建中的 member、预分配 instance、精确 ID/path 和本机 owner，durable 保存可选 preparation={state:finished,warning?}；写入失败直接中止，不进入 setup。沿用 schemaVersion 1 的 additive 本机字段，无远端协议变化，未传回调的普通创建行为不变。
- finished 只表示既有文件准备流程已返回，保留 include 警告，不代表文件内容已验收、setup 成功或任务 ready。缺少字段的旧/中断任务仍为未知，不据此推断或自动复制覆盖。回调保存后 service 使用更新的 journal snapshot，避免后续结果写入覆盖阶段记录。
- 模块加 runtime create 共 8 文件 188 项通过；新增 journal 身份/重开用例后 store 文件 21 项通过。覆盖复制未返回/失败时不发 receipt、receipt 写入失败向上传播、setup 等待前 receipt 已落盘、实例/path/SSH/runtime/stage/revision 拒绝与警告保留。tc:node 通过；质量检查的 6 处测试括号已自动修正后复验。日志 `.context/multi-repo-preparation-receipt-{tests,store-tests,tc,quality,final-quality}.log`。
- 未启动应用/模型，后续实机验收前须重建。该轮只补齐阶段证据，尚未完成未知/部分文件准备的安全接续和 setup 显式处理；完整 P2/P3、独立身份/产物/回退与 P4/P5 保持原范围，Goal active。

### 2026-10-17：显式跳过已退出的失败 setup

- 上轮 fe99d4f110 已提交文件准备阶段记录，属于有效进展，本轮起始工作树干净。本轮接通 skipSetup(taskId,repoId,revision) 的任务串行化、严格 schema/主帧/profile IPC、preload 与管理详情确认按钮；只有 registered/setup failed、preparation finished 且有原 setup 句柄的成员允许请求。验证 root marker、原 repo/native/instance/Git 后，等待原 setup 的退出证据，未知/超时/身份改变保持 journal 不变。确认前取消不写入。
- 成功退出如实标 succeeded，非零退出经用户明确确认标 skipped，保留原文件准备警告和原句柄；均只标该成员 ready，不重跑 setup、不创建成员、不立即启动根 Agent。用户后续继续任务仍走原根入口与 Agent 门禁。复用 mutate 来执行根停机，去掉重复的 pending 检查以保持 service 行数限制。
- 核查 runtime 发现完成 token 在首次观察后被消费；不能依赖失败后的再次等待取回相同结果。因此 observeMultiRepoSetup 在成功核验成员身份后持久保存可选 setupExitCode，恢复不再次观察已有退出码的 setup；skip 优先使用此 durable receipt。没有 receipt 时仍等待原句柄，不把终端消失当作已退出。schemaVersion 1 additive 本机字段，无远端协议变化。
- 模块 8 文件 167 项通过；补充首次 setup exit receipt 断言后 service 文件再次通过。全量 pnpm tc、固定基线 changed-code quality、Electron build/runtime 校验通过。证据 `.context/multi-repo-setup-skip-{tests,final-tests,exit-tests,tc,final-tc,quality,final-quality,verified-quality,build,final-build,runtime,final-runtime}.log`。测试覆盖成功/非零退出、持久 receipt、未知/运行中/无准备证据/无句柄/过期 revision/实例在等待期间变化/marker 变化拒绝和 IPC 授权。
- electron skill + Playwright CDP 9567 隐藏 renderer 验收新建隔离 task 6596422f-7b82-4828-ac5c-3ca60089ae4d（root tasks/setup-skip-6596422f，api 分支 task/skip-6596422f）。临时将 Probe api 的本机 hook 设为写 setup-failed.txt 后 exit 7，创建返回了 setup 句柄，但首次观察立即 terminal_handle_stale，预期文件不存在。因此未重复创建/重跑脚本；原 repo hook 已在 finally 恢复并复核。该真实失败说明 setup 启动路径仍有缺口，不能宣称成功跳过实机已完成。
- 同一任务正常 app.restart 加载最终构建后，UI 取消跳过不改 revision；确认跳过因原句柄无退出证据在 5 秒超时拒绝，任务全文不变，人工测试笔记 skip-refusal-notes.txt 原文保留。当前 provider inventory 中有该成员的普通 shell，会话 id 尾缀 d972b4d0；未停止/重建它。证据 `.context/multi-repo-setup-skip-{request,source-before,refused}.json`、`.context/multi-repo-setup-skip-{check,refusal}.{mjs,log}`、`.context/multi-repo-setup-skip-refused.png`。拒绝脚本已写 wx 笔记，不可原样重跑；成功路径现有证据为模块测试，实际退出后跳过的 UI 验收待 setup 启动问题修复。
- 下一步优先沿同一任务检查 setup terminal publication/handle 与 command delivery，不依据 stale/观察超时判断进程已死。未知/部分文件准备安全接续、setup 显式重试、其他 P2/P3 及独立产物/回退/P4/P5 仍未完成，Goal active。

### 2026-10-17：修复 renderer 接管后的 setup 完成观察

- 上轮 6db9889a75 已提交显式跳过与真实拒绝证据，属于有效进展，本轮起始工作树干净。使用 diagnosing-bugs 技能建立 `.context/multi-repo-setup-diagnose.mjs` 只读原任务循环：原 task 6596422f 的 setup-failed.txt 此时已出现，原终端快照含匹配命令的 completion token 与 exit 7，但 journal 仍 terminal_handle_stale/无退出码。修正上轮“脚本未执行”的初步观察：那只是读取过早，实际命令随后执行；并未重放旧 setup。
- 排查句柄发布、token 登记、重启证据丢失三个假设后，回归测试复现根因：renderer 接管同一个活终端后，handle 的 record 从后台 pty 变为真实 leaf；setup provisioning 的 getPtyId 和 waitForSetupTerminalCompletion 只查 getLivePtyForHandle，分别导致 token 漏登、误报 stale。两处加入现有 getLiveLeafForHandle 的 fallback，保留 graph epoch、PTY generation 与身份检查，不改句柄寿命或远端协议。
- 新测试覆盖 renderer 在 token 登记前接管、在等待前接管，以及未知句柄仍拒绝。最初测试未载入 runtime fixture lifecycle，误报 selector_not_found；补齐后得到准确红灯（token undefined / terminal_handle_stale），修复后两项通过。另一次附加断言误把换显示叶节点等同原后台进程失效，导致等待超时及 Vitest source-map EISDIR 报错；已改为真正未知句柄拒绝，未改产品来迎合错误断言。最终 runtime aggregate 与新测试联合通过，详见 `.context/multi-repo-setup-adoption-verified-tests.log`。tc:node、固定基线 changed-code quality、Electron build/runtime 校验通过；日志前缀 `.context/multi-repo-setup-adoption-`（red2、green、regression、final-tests、verified-tests、tc、final-tc、quality、final-quality、build、final-build、runtime）。
- 使用 electron skill + Playwright CDP 隐藏 renderer，加载最终构建后按相同场景创建新隔离 task d856088a-0793-44d6-a519-661f23426923（root tasks/setup-skip-d856088a，branch task/skip-d856088a）。本机 setup 写出 `setup evidence\n` 并 exit 7，journal 持久记录 setupExitCode=7；UI 取消不改 revision，确认跳过后 ready/skipped，文件原文与句柄不变、Agent pending。原 Probe api hook 已恢复且单独比较确认一致。证据 `.context/multi-repo-setup-adoption-{check.mjs,check.log,request.json,source-before.json,verified.json}`、`.context/multi-repo-setup-adoption.png`。
- 原 task 6596422f 保留，其跨重启前丢失的 token 没有被猜测重建，也没有凭屏幕文本直接改 journal。此轮验证新创建的完成观察及跳过，不声称旧未知任务恢复已完成。仍需 setup 重试/跨重启观察、未知文件准备安全接续、其余 P2/P3、独立身份/产物/安装回退和 P4/P5；Goal active。

### 2026-10-17：持久保存 setup token 并恢复原终端观察

- 创建成员前随 plannedInstanceId 持久保存随机 setupCompletionToken，经 main-only managed create/provisioning 参数用于原 completion wrapper；schemaVersion 1 增加可选 UUID 字段，无 RPC/远端协议变化，旧任务不猜测补填 token。观察与显式跳过均传入记录 token，现有内存 token 不匹配时拒绝。
- 复用 provider 生命周期约束快照，在原句柄验证后扫描最多 500 行保留输出；快照使用独立 scanner，避免和实时输出拼接错序。无匹配 token 不推断成功、不重跑 setup，原超时/身份检查保留。历史被清空或淘汰仍可能无法恢复，已留 shortcut 注释；本次不覆盖所有崩溃点。
- 模块与新增 runtime 测试 172 项通过；runtime aggregate 1397 项通过、1 项跳过；最后调整身份不匹配断言与 service 精确 token 断言后针对性 57 项通过。tc:node、固定基线 changed-code quality、Electron build 和 native runtime 校验通过。证据 `.context/multi-repo-setup-token-{tests2,runtime-tests,final-tests,tc3,quality-final,build,native-final}.log`。初版测试误用 renderer serializeBuffer，改为真实 serializeProviderBuffer 后通过；类型检查指出快照 fixture 缺 source，已补全。
- electron skill + Playwright CDP 隐藏 renderer 创建隔离 task 2d2b0378-fa1f-4028-afb2-c509826ae685，root tasks/setup-restart-2d2b0378，branch task/restart-2d2b0378。setup 先追加 run-count，再等待测试 release 文件；观察器超时后请求正常重启，并放行原脚本 exit 7。首次脚本提前连回正在关闭的旧页面，在 continue 前页面关闭，因此未重新创建或重跑任务；重新连接新进程继续同一 task，before 无退出码，after setupExitCode=7，原句柄不变、run-count 恰好一行，证明可从重启后的原 provider 输出恢复。源 repo hook 在重启前已恢复。证据 `.context/multi-repo-setup-token-live-{request,source,started,resumed}.json`、`.context/multi-repo-setup-token-{live,resume}.{mjs,log}`、`.context/multi-repo-setup-token-live.png`。
- 仍未完成显式 setup 重试、部分文件准备接续、完整崩溃矩阵、其余 P2/P3、独立应用身份/arm64 产物/安装回退与 P4/P5。Goal active；旧无 token 任务仍保持未知，不改写旧证据。

### 2026-10-17：命令面板入口与统一多仓弹窗

- 上轮 d46ecc9205 已提交 setup token 恢复并完成真实重启证据，起始工作树干净。本轮补齐设计要求的命令面板入口：复用 CmdJ quick action 注册/搜索/执行，增加新建多仓库需求工作区操作及中英标题/描述；本机无活动工作区时也可打开，Web 客户端隐藏且执行层再次拒绝。
- 侧栏原本单独持有 create/manage 弹窗状态，现改为既有 openModal；全局 AppRootSurfaces lazy 挂载独立 MultiRepoWorkspaceModal，复用原创建和管理组件。两个入口共用同一 modal slot，管理页切换保持原行为，侧栏卸载不再影响弹窗。没有复制创建逻辑或改变任务 journal。
- tc:web、翻译目录校验、固定基线 changed-code quality、Electron build/native runtime 校验通过；命令面板上下文与搜索回归 59 项通过，新增桌面可用/执行和 Web 隐藏/拒绝断言。日志 `.context/multi-repo-palette-{tc,locales,quality-final,build,native,tests-final}.log`。
- electron skill + Playwright CDP 9567 隐藏 renderer 验证：侧栏搜索按钮打开既有命令面板，输入多仓库，唯一新建操作可点击；创建页→已有需求管理→关闭→侧栏重新打开创建页，始终只有一个 dialog，全部 task records 前后一致。检查截图确认标题/描述和既有行样式正常。证据 `.context/multi-repo-palette-{check.mjs,check.log,verified.json,search.png,create.png}`。初次尝试隐藏 renderer 的 Meta+J 不触发 native accelerator，未为测试激活窗口，改用既有搜索按钮；不把本次证据扩展为原生快捷键验证。
- 仍需完整创建计划预览、默认父目录持久化、其余功能文案本地化、setup 重试/部分准备与完整 P2 验收、独立应用身份/arm64 产物/安装回退及 P4/P5。Goal active。

### 2026-10-17：创建前解析完整计划并核对确认内容

- 上轮 7767327dfd 已提交命令面板入口并完成实机验证，起始工作树干净。本轮复用 planMultiRepoWorkspace 增加只读 previewCreate IPC，保留主窗口/主 frame/profile 授权，异步 Git 读取后再次检查 profile。不会创建 journal、目录、分支、入口或启动 Agent。
- 创建请求 additive 可选 confirmedPlan，UI 先预览后确认；create 原预检从实际磁盘/Git 重建计划，用 isDeepStrictEqual 比对确认内容。起始 ref 前进、目录/仓库身份/分支/setup 选择变化则在保存任务前拒绝，用户重新预览；确认通过后的计划仍使用固定 commit，后续执行维持原逐步核验。现存内部调用可不带 confirmedPlan，已有任务 requestId 重放仍返回原 journal，不重复创建；未改远端 RPC。
- UI 确认步骤展示任务名/说明、根 Agent、根路径、每个源仓库/目标目录/ref/完整 commit/新分支/setup 选择。返回修改不写入；已提交且结果未知时保留原 requestId 和 confirmedPlan，已证实未提交则退回重新预览。复用既有 UI tokens，单独计划组件，无新依赖。首次截图发现计划藏在长编辑表单下，改为独立摘要视图；进入预览/返回编辑时重置滚动位置，确认与返回按钮留标准间距。
- 模块 169 项通过，新增计划原样确认/改目录/真实 ref 前进拒绝、IPC 只读和 profile 切换授权测试；补充 service 计划不匹配不存 journal/不调用创建、匹配计划可保存后，服务 53 项通过。全量 tc、后续 UI tc:web、固定基线 changed-code quality、Electron build/native runtime 校验通过。证据 `.context/multi-repo-create-preview-{tests,service-tests,tc-final,layout-tc,quality-layout,build-layout,native-final}.log`。
- electron skill + Playwright CDP 9567 隐藏 renderer 选择跨组 Probe api/web、setup skip、不选 Agent。预览前后 task records 完全一致，目标根不存在；返回修改后再次确认，创建 task a63c39e3-b7fa-4020-a3b9-d80993493395 / tasks/request-a63c39e3。两成员 ready/skipped，journal 与实际 git rev-parse HEAD 均等于界面展示 commit，Agent pending。证据 `.context/multi-repo-create-preview-{intent.json,check.mjs,check.log,verified.json}`。布局修正后的独立只读预览再次验证不落盘、返回修改、完整双成员摘要和确认按钮；证据 `.context/multi-repo-create-preview-{layout.mjs,layout.log,layout-intent.json}` 与 `.context/multi-repo-create-preview.png`，只读 probe 未创建新任务。
- 默认父目录持久化、其余文案本地化、setup 显式重试/部分文件准备、完整崩溃矩阵和其余 P2/P3、独立身份/arm64 产物/安装回退/P4/P5 仍待完成。继承 setup 仍明确显示遵循仓库设置，本轮不声称冻结 setup 脚本内容。Goal active。

### 2026-10-17：profile 内保存父目录与全局专用目录建议

- 上轮 eff1dd3d82 已提交完整创建计划与实机 commit 对照证据，起始工作树干净。按设计将默认父目录保存在当前 profile 的 multi-repo-workspaces/preferences.json，复用 durableWriteTempPath/writeFileDurableSync，不修改 repo.worktreeBasePath 或全局 workspaceDir。读取不落盘；没有已保存值且全局 workspaceDir 是本机绝对路径时，建议其 multi-repo-workspaces 子目录；相对路径和 WSL UNC 不生成默认值。
- 新 UI 提供“记住此目录”（必须已存在且是目录）与“使用默认目录”（显式创建固定专用子目录并保存）。使用默认目录先解析现有全局父目录，创建前再次检查 profile 授权，拒绝文件/symlink 占位；所有保存前核对 active profile。输入路径规范化为 realpath，写入绑定的 profile 配置。读、写 IPC 均限可信主 renderer/mainFrame，使用严格请求 schema。
- 父目录保存期间禁用表单与提交，避免异步保存覆盖新编辑或让确认计划与草稿发生交错；成功回填使用 functional state update。目录加载不覆盖已经输入的非空路径。创建预览仍只读，默认父目录只在明确点击操作后创建。
- 16 项父目录与 IPC 测试通过，覆盖只读默认建议、相对/WSL 拒绝、明确创建、重复使用、跨 profile 隔离、缺失目录/文件/symlink 拒绝和 profile 切换禁止保存；全量 tc、固定基线 changed-code quality、Electron build/native runtime 校验通过。证据 `.context/multi-repo-parent-{tests-final,tc-final,quality,build,native}.log`。
- electron skill + Playwright CDP 9567 隐藏 renderer 验收：相对路径保存被拒绝且原配置不变；记住当前 worktree 内 .context/multi-repo-live-fixture/tasks，关闭再开和完整 app.restart 后自动填入。task records、源 repo objects、全局 workspaceDir 均未改变。未点击指向 worktree 外的默认目录按钮，默认目录创建/拒绝路径由临时真实磁盘测试覆盖。证据 `.context/multi-repo-parent-{check.mjs,check.log,verified.json,restart-check.mjs,restart-check.log,restart-verified.json}`、`.context/multi-repo-parent.png`。
- 仍需其余文案本地化、setup 显式重试/部分准备接续、完整崩溃矩阵与剩余 P2/P3、独立应用身份/arm64 产物/安装回退与 P4/P5。Goal active；未修改正式应用/profile 或全局账号。

### 2026-10-17：P4 安装身份审计与实际 bundle ID 清单

- 上轮 5ef7489a29 已完成父目录 profile 持久化，起始工作树干净。本轮转向 P4，重新阅读 macOS daemon/TCC 文档并按源码追踪 builder、启动数据目录捕获、Keychain 名称、helper、launchd、兼容性契约、CLI、URL pairing/handoff 和 updater 各入口。
- 发现 helper 本身已继承主包 Info.plist 标识，可复用；但 mac-build-compatibility.cjs 固定输出官方 appId，即使 builder 覆盖也不跟随。修正为接收 context.packager.appInfo.id，同时保留官方默认；不改变 state schema 或 daemon protocol。新增测试比较 fork/官方完整契约，除了 appId 全部保持相同。
- 三个打包配置/兼容性测试文件 47 项通过、1 项跳过；最后将 fork 测试改成与官方完整契约比较后，针对性 3 项通过。固定基线 changed-code quality 通过。日志 `.context/multi-repo-build-identity-{tests,final-tests,quality}.log`。本次没有启动新应用或打安装包，未改签名/权限验证。
- 新增 [安装包隔离核对](fork-multi-repo-build-isolation.md)，固定 Orca 34 / com.orca34.desktop / orca34 数据目录、scheme 和外部 CLI 的目标，并列实际接入点与候选包证据门槛。只是审计和清单修复，runtime compatibility contract 仍是官方；不能宣称独立包已经可用。
- 下一步：统一可选构建身份，同时接启动名称/首次 userData、runtime contract/launchd、CLI、桌面 scheme 与全部 updater 入口，再实现继承式 fork builder。packaged safeStorage 保留由实际 bundle 名决定的时序；ad hoc fallback 不能代替 Developer ID helper/TCC 证据。P2/P3 未完成项、P4 产物安装回退及有限 P5 仍保持原范围，Goal active。

### 2026-10-17：编译身份贯通名称、数据目录与 daemon 标识

- 上轮 0aa879d83d 已完成打包清单 appId 修复和 P4 接入审计，起始工作树干净。新增 build-distributions.json 作为 build/runtime 共用的官方/Orca 34 定义；`ORCA_BUILD_DISTRIBUTION=orca34` 只在 Vite 编译时注入，未设置保持官方，未知值拒绝。运行时不读取同名环境变量，不能由父终端环境切换产品身份。
- dev-instance-identity 使用统一 appName/appId；packaged safeStorage 仍沿用原 bundle 名的 ready 时序。configureDevUserDataPath 在原 initDataPath 之前为 fork packaged 选 appData/orca34、fork dev 选 orca34-dev；E2E/显式 dev override 保留优先级，普通 packaged 数据路径不变。只调整既有路径确定步骤，不二次捕获 canonical path。
- runtime local-build compatibility 的 appId 同步选择产品，state schema/daemon protocol 不变；mac launchd AssociatedBundleIdentifiers 因复用该 contract 自动同步，job label 前缀也改用同一 appId。现有 retired-job 枚举/恢复复用 label 函数，避免独立产品拿官方前缀扫描。未改变 helper 签名校验/复制/清理或声明已验证真实 TCC。
- main 构建生成 orca-build-distribution.json；beforePack 拒绝 fork 主产物与官方 appId/name 混用、独立包缺失匹配证据或使用官方主产物。官方无旧 marker 的既有构建兼容；未新增 fork builder，也未启动/安装未完成隔离的 fork 产物。
- 身份/启动/daemon/打包回归 141 项通过、1 项跳过；Vite/打包配置额外 58 项通过、1 项跳过；补充 fork dev override 与反向混用断言后针对性 50 项通过。全量 tc、固定基线 changed-code quality 通过。初次 tc 指出 CLI composite project 未显式包含新 JSON，已添加精确 include；lint 对 typeof 未声明编译常量报错，保留必要 typeof 并加行级原因，未关闭 max-lines。
- 实际 `ORCA_BUILD_DISTRIBUTION=orca34` main build 成功，读取生成标记验证 com.orca34.desktop/orca34，官方包装确实拒绝；随后完成普通全量 Electron build，验证已恢复 com.stablyai.orca 且反向 fork 包装拒绝，恢复 Electron native runtime。证据 `.context/multi-repo-distribution-{tests,config-tests,final-tests,tc-final,quality-final,fork-build,official-build,full-build,native}.log`、`-compiled-fork.json`、`-restored-official.json`。没有重启当前开发实例或碰正式 profile。
- 更新 [安装包隔离核对](fork-multi-repo-build-isolation.md)。下一步仍需 CLI/URL scheme/所有 updater 入口的隔离、继承式 fork builder、arm64 包和安装/回退/TCC 实测；P2/P3 恢复缺口和有限 P5 未缩减，Goal active。
- 提交钩子发现 electron.vite.config.ts 与既有 configure-process.test.ts 超行数；未提高上限。将构建身份插件和既有 main bundled dependencies 列表移入具体命名的 build-plugin 文件，fork 路径测试独立成 configure-process-distribution.test.ts。拆分后该测试、24 项 Vite/身份配置回归、全量 tc/质量检查/普通全量构建通过；日志 `-split-tests`、`-split-config-tests`、`-split-tc`、`-split-quality`、`-split-build`，Electron native runtime 再次恢复。

### 2026-10-17：Orca 34 手动更新政策贯通

- 上轮 2af82fe07c 已提交编译身份，本轮沿同一 build-distributions 定义增加 automaticUpdates：官方 true、Orca 34 false。政策不读取运行时环境变量。复用 updater 公共入口，在 setup、后台检查、菜单检查、release 列表、下载、安装及 Linux package 恢复处拒绝自动路径；底层 getAutoUpdater 另加保护，避免漏接入口加载官方 feed。
- 后台保持 idle，不注册定时器/wake listener、不拉取 nudge/feed；主动操作发布既有非重试 error，明确要求安装 Orca 34 包。作为服务器运行时返回已有 manual-service-update-required，三个远端触发入口沿用既有拒绝规则，无新增 wire 枚举。客户端管理其他远端的组件不禁用。
- 检查发现通用错误卡仍提供官方发布页/无效重试，设置页也声称自动检查；按 STYLEGUIDE 复用原设置 header/section 和错误卡模型，fork 显示手动说明且不提供这些本机操作，保留远端管理。未新增样式值/依赖；英文提示本地化仍待后续文案统一。
- 原 updater 回归 26 项通过；新增手动政策 7 项通过；调度、安装、远端、身份与错误卡相关 88 项回归通过。最后 UI 行为修改后 18 项针对性测试通过；全量 tc、固定基线 changed-code quality、Electron 全量构建和 native runtime 恢复均通过。日志 `.context/multi-repo-manual-update-{tests,new-tests,regression,final-tests,tc-ui,quality-ui,build-ui,native}.log`。首次批次只收集原有两文件，已单独运行新增测试确认收集与通过。
- 本轮未启动 fork 或安装包，也未做隐藏 renderer 实测；不把组件测试当作包内验收。更新安装隔离核对。下一步仍有 CLI/scheme/偏好域隔离、fork builder、arm64 产物及安装/回退/TCC 实测，另有 P2/P3 恢复缺口和有限 P5，Goal 保持 active。

### 2026-10-17：独立 CLI 注册与旧启动器保护

- 上轮 0aeacb33e6 已提交手动更新政策，本轮起始工作树干净。统一构建身份新增 cliCommandName/linuxCliCommandName；官方默认 orca/orca-ide 不变，fork 外部注册使用 orca34、开发 orca34-dev。包内启动器和 profile-local orca alias 保留，避免改 Agent 协议/远端 wire。
- macOS 的默认路径及无 /usr/local/bin 时 fallback 都使用独立名称；fork 不继承官方 ORCA_CLI_INSTALL_PATH，而读 ORCA34_CLI_INSTALL_PATH。Windows fork 使用独立 Programs/Orca 34/bin/orca34.cmd 转发包内 launcher，不把含官方命令名的 resources/bin 放入用户 PATH。开发路径复用同一产品名，普通官方 packaged Windows 流程不变。
- fork 跳过 Linux 旧 orca 清理；AppImage CLI cache 从共同 build identity 得到 orca34/appimage。较宽的旧 symlink/script 接管规则仅保留官方；fork 遇到非当前目标或不同 Windows wrapper 保持 conflict，安装/卸载均拒绝。已留 shortcut：搬迁 fork 后旧链接需要人工处理，后续有可靠 bundle 所有权证据才放开自动修复。
- 临时文件测试新增 mac 注册/卸载保持官方原内容、官方 bundle 链接占位拒绝、Linux legacy 保留/cache 隔离、Windows 未知脚本拒绝/独立 PATH 注册卸载和 dev profile-local alias；初版 5 项通过，相关官方与 AppImage 回归 79 项通过。补充 Windows 成功路径与去除重复路径逻辑后 20 项通过。初版测试用了错误 registry fixture state 且少了 if 花括号，类型/质量检查发现后修正。
- 全量 tc、固定基线 changed-code quality、Electron 构建通过，测试后恢复 Electron native runtime。证据 `.context/multi-repo-cli-distribution-{tests,regression,final-tests,tc-final2,quality-final2,build,native}.log`。未注册真实全局命令、未重启或安装应用。
- 继续追踪发现 CLI 是 tsc 独立构建，未获 Vite 编译常量，metadata 默认路径仍是 orca；build:cli 的 install-dev-cli 和 orca-dev.mjs 默认也仍为官方。这些不是本轮注册测试能证明的隔离，已写入安装审计，下一步继续接通。另需 scheme/偏好域/fork builder、arm64 安装回退及 P2/P3/P5 原范围，Goal active。

### 2026-10-17：CLI 固定编译身份与默认 profile 路由

- 上轮 1ec781580d 已提交 CLI 注册层隔离，起始工作树干净。本轮接通独立 tsc CLI：prepare:cli-output 的既有 verifier main 在 fix 阶段给 CommonJS build-distribution.js 注入固定常量并写 CLI manifest，不新增运行时环境变量开关。main/renderer 仍沿用 Vite define。
- CLI metadata 默认目录和 launch dev fallback 跟随统一身份，fork 为 orca34/orca34-dev；显式 ORCA_USER_DATA_PATH/profile 路由保留。开发 wrapper、profile 内命令生成和 install-dev-cli 读取编译记录确定名称/默认路径，内部 orca alias 不变。新增 ORCA_SKIP_DEV_CLI_INSTALL=1 供构建验收禁止全局 symlink；本轮所有 CLI 构建均使用它，未安装全局命令。
- beforePack 同时核对 main 和 CLI 的身份；fork 缺失 CLI 记录或双向混用均拒绝。发现 tsc 单独重编译可能留下旧 marker，因而 marker 保存编译身份模块及 JSON 定义的 SHA-256，读取时验证摘要及当前定义字段。缺失、损坏、过期记录拒绝，不悄悄退回官方。旧版没有身份模块的官方输出保持兼容；已支持身份但缺记录的输出需重新 prepare。
- 初批 25 项测试通过；最终身份、CLI verifier、dev wrapper、builder、profile/launch 回归 64 项通过、1 项跳过。全量 tc 与固定基线 changed-code quality 通过；初版两个简写 if 被质量检查指出后补上花括号。证据 `.context/multi-repo-cli-identity-{tests,complete-tests,tc,quality-complete}.log`。
- 实际编译 fork CLI，读取真正 out/shared 身份与 out/cli metadata，清空运行时开关仍选 orca34；摘要通过且官方包装拒绝。随后重编译普通 CLI，设置运行时开关为 orca34 仍选官方 orca，反向 fork 包装拒绝。最终普通 Electron 全量构建通过，并恢复 Electron native runtime。证据 `-final-fork-build.log`、`-final-compiled-fork.json`、`-final-official-build.log`、`-restored-official.json`、`-electron-build.log`、`-native.log`（前缀 `.context/multi-repo-cli-identity`）。未启动 fork 或接触正式 profile。
- 独立候选包尚未交付：mac 包内 launcher 的 MacOS/Orca 路径要与最终 executableName 配合，scheme/偏好域/fork builder/arm64 安装回退仍待做；CLI server-service 的显示/选择命令等更广路径仍需包内审计。P2/P3 剩余恢复缺口和有限 P5 不变，Goal active。

### 2026-10-17：桌面分享 scheme 与 macOS 偏好域

- 上轮 871f92b49d 已提交 CLI 编译身份/默认 profile，起始工作树干净。统一身份增加 urlScheme（官方 orca、fork orca34）；desktopHandoffArguments 生成当前产品 scheme，skill-share-link 解析接受自身 scheme 及旧 orca 分享 URL，沿用既有 ID/path 校验。官方构建不接受 fork scheme。
- pairing 编解码完全未改：二维码/配对数据仍为 orca://pair，新增 fork 构建下 round-trip 测试验证旧客户端兼容。未新增远端 wire 字段。OS scheme 注册仍待 fork builder，不把内部 handoff 测试当作 LaunchServices 注册证据。
- macOS press-and-hold 的允许域从统一 appId 得到，仍核验实际 bundle 标识；fork 对官方域在读取和写入 defaults 前拒绝，自己的 unset 值沿用原一次性逻辑。TCC watcher 用同一 appId 加既有六种后缀精确匹配，不再将官方事件归属 fork；不改权限请求、helper 或签名逻辑。
- 73 项桌面 handoff、分享/配对、偏好与 TCC 回归通过；测试 host/进程均注入，没有运行 open/真实 defaults/log watcher。全量 tc、固定基线 changed-code quality、普通 CLI 构建（ORCA_SKIP_DEV_CLI_INSTALL=1）、Electron 全量构建与 native runtime 恢复通过。证据 `.context/multi-repo-desktop-identity-{tests,tc,quality,cli-build,build,native}.log`。CLI 重编译同步更新新增身份字段和摘要，未留下过期 marker。
- 安装审计已更新。进一步读 builder 发现 mac release team ID 校验和嵌套 Computer Use helper 仍需审查，独立 builder 不能仅覆盖顶层 appId。下一步完成继承式 builder/包内启动器/辅助进程身份与 arm64 候选包；真实 scheme、权限、升级回退，P2/P3 恢复缺口及有限 P5 仍未完成。Goal active。

### 2026-10-17：继承式 arm64 候选 builder

- 上轮 c55f88c852 已提交桌面 scheme/偏好域，本轮重新核对 macOS daemon TCC 文档和实际 afterPack。新独立 builder 继承原配置，只覆盖 appId/productName/protocol/output/publish/mac target 和包装前后钩子；保持原 native、CLI、移动 web、daemon、ripgrep、helper 签名校验链。OS scheme 目标 orca34，候选不发布。
- mac executableName 保留 Orca，匹配现有包内 launcher；外部 app/产物显示 Orca 34。Computer Use helper 只改打包副本 Info.plist 的 ID/显示名，原 afterPack 随后重签，其他 executable/权限/版本字段不变。运行时 fallback ID 跟随编译身份，避免回退官方 TCC 域。
- `build:mac:orca34` 复用既有 build:desktop/build:native/ensure runtime，再打 arm64 dmg/zip；要求干净源码和本机 arm64，固定完整 commit/真实版本加 local+orca34 后缀。全程 ORCA_BACKGROUND_LAUNCH=1、跳过全局 CLI，显式 ad hoc 签名并拒绝官方 release 身份开关。排除 .context、dist 和 out/bin 本机 wrapper，写包内来源清单。
- 原 builder 与新配置测试 39 项通过、1 项跳过；补充 runner 与 Computer Use 回归 22 项通过；全量 tc、固定基线 changed-code quality 通过。证据 `.context/multi-repo-fork-builder-{tests,final-tests,tc,quality}.log`。本提交固定候选源码，随后开始真实构建，不代表已有安装包。Developer ID 权限稳定性、实际包内身份/CLI/scheme、升级回退以及 P2/P3/P5 未完成范围保持不变。

### 2026-10-17：候选构建依赖与 arm64 Swift 修复

- 7d02df0265 固定 builder 后首次实际执行 build:mac:orca34。WSL guest、CLI、主进程/renderer、skills CLI closure 787 文件/5 命令和 web projection 成功，mobile web 因未安装移动独立依赖失败；进程确认已退出后以 mobile 锁文件 frozen install 补齐，未改锁文件。随后 mobile web 构建及 130 资源/8,365,420 字节/可重现 buildId 验证通过。
- 原生构建上游默认双架构；本机 Command Line Tools 的 Swift compatibility archives 缺 x86_64，通知 helper 链接失败并由原 runner 停止兄弟编译。首发本就是 arm64，改 fork runner 使用已有键盘/通知 --single-arch，通知显式内嵌 com.orca34.desktop；Computer Use 构建新增同样单架构选项，官方默认仍双架构。
- Swift 6.4 构建成功后实际路径为 .build/out/Products/Release，旧固定 .build/<triple>/release 导致取产物 ENOENT。改用 swift --show-bin-path 并保存各架构副本再合并，不依赖 Swift 目录布局；真实 arm64 重编译成功，Computer Use helper Info.plist 为 com.orca34.desktop.computer-use，lipo 确认 arm64，codesign --verify --deep --strict 通过。通知/键盘也已分别 lipo 确认 arm64。
- 4 项候选配置/runner 测试及固定基线质量检查通过。日志 `.context/multi-repo-fork-builder-{candidate,arm64-tests,arm64-quality,native-quality}.log`、`multi-repo-fork-mobile-{install,build}.log`、`multi-repo-fork-native-build.log`、`multi-repo-fork-{computer-arm64-final,notification-arm64,keyboard-arm64}.log`、`multi-repo-fork-native-architecture.txt`。未绕过资源/签名检查，未启动或安装 app；接下来重跑固定源码候选。缺少 x64 工具链不阻断已批准 arm64 目标，但本机未验证 x64 产物。

### 2026-10-17：真实候选产物暴露 bundle 命名问题

- bcc9dae6c8 固定单架构修复后第二次完整构建成功生成 DMG/ZIP；移动资源、skills closure、打包 daemon Node 加载、arm64 terminal host 真实 PTY、helper 检查和 ad hoc 签名通过。orcad template 未提供，沿用上游本机配置的可选行为，日志明确 skipped；远端模板不作为首发本机多仓能力证据。
- 实际打包目录是 Orca.app：electron-builder 用 executableName 影响 productFilename，因此之前保留内部 Orca 的策略未达到独立文件名要求。该产物未安装/启动，完成进程退出后整体移至 .context/rejected-orca34-bcc9dae6c8；日志 `.context/multi-repo-fork-builder-candidate2.log` 保留，不能作为交付候选。
- fork executableName 改 Orca 34；现有 mac CLI launcher 从签名 Info.plist 读取 CFBundleExecutable，官方默认无变化。临时真实 .app+symlink+假可执行程序测试验证 Orca/Orca 34（含空格）均正确传递 CLI 路径与参数，没有启动 Electron。terminal host 也从父 Info.plist 继承显示名，ID/权限/版本规则不变。
- 首轮测试暴露 /var 与 /private/var 的路径比较：launcher 实际 canonical path 正确，测试改为 realpath 期望；helper require.resolve 在 Bun 下可返回非 canonical path，现有 containment guard 现将两侧均 realpath 后比较，继续拒绝外部依赖。修复测试 realpathSync 缺失 import 后，24 项相关测试通过。日志 `.context/multi-repo-fork-bundle-name-{tests,final-tests,verified-tests,final-quality}.log`。下一步固定新源码并再次生成实际独立 app；完整安装/回退与其余原 Goal 范围仍未完成。

### 2026-10-17：独立 arm64 产物静态验证与显式 profile 修复

- de823e43c478 源码的第三次完整构建成功：dist/orca34/mac-arm64/Orca 34.app，及版本 1.4.214-local.1792176758678.de823e43c478.orca34 的 dmg/zip。原 daemon/plain Node、skills CLI、移动资源、arm64 helper 真实 PTY、签名/打包流程均完成。没有启动 GUI 或安装应用。
- 对实际 app 运行 codesign --verify --deep --strict，通过；主 CFBundleIdentifier=com.orca34.desktop、CFBundleExecutable/Name=Orca 34，唯一 URL scheme=orca34，lipo=arm64；terminal host ID 同主应用且显示名 Orca 34，Computer Use ID=com.orca34.desktop.computer-use。实际 asar 列表无 .context/dist/out/bin；包内 CLI 身份为 fork、automaticUpdates=false、默认 metadata 目录尾名 orca34，来源清单完整 SHA 与构建源码一致。真实包内 bin/orca --help 成功执行，未启动 GUI。
- DMG hdiutil verify 通过。DMG 268,573,421 字节，SHA256 5d7278df1a5696fb29a6adb4f53477f49faf3f3eeb853c80be9c0141030a995b；ZIP 270,598,856 字节，SHA256 df75f1b518767eeef7009090360b8d6905b44b5426996737011a9cc6ab6ca0ab。证据 `.context/multi-repo-fork-builder-candidate3.log`、`multi-repo-fork-candidate3-{inspection.json,artifacts.json,signature.log,cli-help.txt,dmg-verify.log}`。
- 启动路径进一步审查发现 fork 默认目录会覆盖 Electron 已解析的 --user-data-dir，影响 CLI 显式 profile 和隔离包验收。已改为仅在未给该参数时设置 fork 默认目录；E2E 优先级和 dev override 不变。55 项 startup/CLI 路由回归、全量 tc/固定基线质量检查通过；日志 `.context/multi-repo-fork-profile-override-{tests,tc,quality}.log`。
- 上述第三份产物尚不含这次显式 profile 修复，保留作静态构建证据，不用于隔离启动验收；下一步重新固定源码构建再进行隐藏 CDP/安装/升级回退。ad hoc 不替代 Developer ID 稳定 TCC，P2/P3/P5 原缺口未缩减，Goal active。

### 2026-10-17：含 profile 修复的候选与隐藏包内启动

- 41b9b2c8f67bb2c07d4891b8fd7cf8f9291cee8e 的第四次完整构建成功，版本 1.4.214-local.1792176933068.41b9b2c8f67b.orca34。实际 Orca 34.app 的主/辅助 ID、scheme、CLI 编译身份、默认 profile、asar 排除及来源清单再次核对通过；codesign --verify --deep --strict 和包内 CLI --help 成功。
- DMG hdiutil verify 通过：268,555,378 字节，SHA256 6d165b50034ccc5000a0ab21d8ffc7dee4fa9623611f261f0d47232ddd39341b。ZIP 270,599,394 字节，SHA256 6b24213cdd46a2bdb77713650f23768e9d7a4c7e464bf3bc982ce5ef97cdfe7c。证据 `.context/multi-repo-fork-candidate4-{inspection.json,artifacts.json,signature.log,cli-help.txt}`，完整构建日志 `multi-repo-fork-builder-candidate4.log`。
- 按 electron 技能和仓库限制，Playwright 启动实际包并通过 CDP 读取隐藏 renderer。复用 electron-home-isolation 与 electron-launch-args 的隔离工具，临时 profile 为 .context/orca34-candidate4-profile；预置按键偏好决定记录，跳过真实 defaults 初始化，不注册全局 CLI。运行时 isPackaged=true、name=Orca 34、版本匹配、home/userData 均精确指向临时目录，multiRepoWorkspaces API 可用，BrowserWindow isVisible/isFocused 均 false。正常关闭后再启动也通过；未覆盖用户已有 9567 开发实例。
- 首次临时脚本遗漏已有 mock-keychain 参数，实际进程停在 SecItemAdd → AuthorizationCopyRights，同步阻塞 CDP；sample 证实后仅终止该临时进程，未批准系统授权。加入 getElectronIsolatedKeychainArgs 后通过。初次日志被旧进程延迟输出交错，不作为成功证据；最终独立日志 `multi-repo-fork-candidate4-smoke-verified.log` exit 0，运行时 JSON 和隐藏截图为 `multi-repo-fork-candidate4-runtime.json`、`multi-repo-fork-candidate4-hidden.png`。首次等待栈保留于 `multi-repo-fork-candidate4-hang.sample`。
- 本次使用 E2E profile 覆盖和模拟 keychain，不能代替普通 --user-data-dir 分支、真实 Keychain/TCC 或安装/升级回退验证。界面仍有上游 Orca 文案及首次提示；只验收包内启动和隔离，不宣称完整多仓流程通过。尚未安装候选，P2/P3/P4/P5 原剩余范围不变，Goal active。

### 2026-10-17：需求名称驱动创建目录和分支

- 上轮 b538e61bae 已记录实际候选隐藏启动；本轮起始工作树干净，重新核对批准计划。创建表单仍用 request-随机 ID 和 task/随机 ID，与计划的需求短名默认值有差距。现复用 slugifyForWorkspaceName，以需求名称短名加原 requestId 前八位生成目录/分支；选仓前后改名均跟随，已有手改目录和逐仓分支保留，不改变 requestId、成员目录、base ref 或已创建任务。
- 新增 8 项草稿行为测试覆盖改名/清空、不可变原草稿、手改保留、多成员、同名不同 ID、路径字符、Windows 保留名、超长及中文输入。沿用上游 ASCII slug 规则：纯中文/无可用字符时保留 request-ID/task-ID fallback，不引入转写依赖。主进程原路径/Git 分支与预览确认校验保持最终权威。
- 测试、全量 tc、固定基线 changed-code quality 通过。重新构建 fork Electron 输出并恢复 Electron native runtime；证据 `.context/multi-repo-draft-name-{tests,tc,quality,build,native}.log`。未重打已验证候选包，旧候选不含本次 UI 默认值变化。
- 隐藏 Playwright CDP 使用新的隔离 HOME/profile 和 mock-keychain；通过真实按钮打开表单，输入 Fix login 验证 request-fix-login-ID，手改 custom-root 后再改需求名称仍保留。窗口 invisible/unfocused，测试正常关闭；日志 `multi-repo-draft-name-ui-verified.log` exit 0，截图 `multi-repo-draft-name-hidden.png` 和运行时 JSON 留存。首次脚本依赖 production 未暴露的 __store 而超时退出，改为真实 UI 操作后通过；未重启现有开发实例。
- 本轮补齐默认命名，不替代 setup 显式重试、恢复故障矩阵、安装/升级回退、真实权限和有限上游同步的剩余验收。Goal active。

### 2026-10-17：失败 setup 的显式重试

- 上轮 03e9e1c481 已提交默认命名，起始工作树干净。本轮补充本机 retrySetup IPC/服务/管理界面入口；复用原跳过 setup 的任务版本、准备完成、原 terminal 退出、根所有权及成员 Git/instance 核验，抽取为同一 setup review，不新增另一套身份判断。
- 用户确认重试后复用 prepareRuntimeLocalWorktreeSetup、runner/shell 决策、buildObservedSetupCommand 和 runtime.createTerminal，仅运行成员当前 setup，不重复 checkout/文件准备/默认 tabs、不自动启动根 Agent；SSH/WSL 继续由原成员身份检查拒绝。runner 准备失败保持原失败记录，可修复配置后再试。原结果实际为成功时仅补记成功，不重跑。
- 新 token 和无 handle 的执行意图先 durable save，之后创建不抢焦点的 setup terminal，再持久化 handle 并沿原观察器读取结果。丢启动响应/写 handle 失败不会自动重复执行；当前仍需人工核对未知 handle，已留 shortcut 注释，后续恢复矩阵必须补齐可找回执行身份，不能宣称该崩溃窗口已完成。
- 80 项服务/IPC/setup 回归通过；补充保存失败不启动和 runner 准备失败不改记录后，16 项 setup 专项通过。覆盖未知原 terminal 拒绝、原成功不重跑、意图先于启动持久化、新 token/handle 完成观察、丢回复不再启动。全量 tc、固定基线质量检查通过；fork Electron 重建并恢复 native runtime。证据 `.context/multi-repo-setup-retry-{final-tests,boundary-tests,complete-tc,final-quality,build,native}.log`。
- 隐藏 Playwright CDP 真实仓库验收：任务 5cbfb6c6-e97f-4531-a748-6da89732359e，目录 .context/setup-retry-live-3ZgKHp/task。原 setup exit 7；修改隔离 profile 中该仓库 hook 后，通过管理界面“重新运行 setup”及确认按钮执行，exit 0/ready/succeeded。run-count.txt 恰好 original 与 retry 两行；token/handle 更新，instanceId 保持 bc6030c7-283b-491a-a1a4-d9e132a1db8c，根 Agent pending。证据 `multi-repo-setup-retry-live-result.json`、`multi-repo-setup-retry-runtime.json`、`multi-repo-setup-retry-hidden.png`、`multi-repo-setup-retry-ui.log`。
- 使用独立 HOME/profile/mock-keychain，全程窗口 invisible/unfocused。主进程已正常退出，但专用测试 daemon 保留了观察脚本的 pipe；核实 PID/独立 profile 后只终止该测试 daemon，观察脚本 exit 0。未操作 9567 开发实例或正式 profile。现有安装包未重打；完整恢复、安装升级回退、真实权限和有限 P5 仍未完成，Goal active。
- 首次提交被原 max-lines gate 拒绝（服务 311 行/上限 300）。只把服务依赖类型移至 multi-repo-workspace-service-contract.ts，未放宽规则或改执行逻辑；再次全量 tc/固定基线质量与普通 oxlint 通过，日志 `multi-repo-setup-retry-contract-{tc,quality}.log`。

### 2026-10-17：setup 重试丢回复后的原执行恢复

- 上轮 3345c55302 完成显式重试。本轮查到 Runtime 已有 preAllocatedHandle，终端宿主会保留这个身份；复用它，将 term_<新 completion token> 与启动意图一起先持久化，再交给 createTerminal。返回 handle 必须与原意图一致，不接受另一终端。无新增 wire/schema，也不通过重新调用 createTerminal 来“恢复”。
- 丢回复后记录仍有原 handle/token，现有 recoverMultiRepoSetup/完成观察器可以核对同一次执行。没有创建证据、宿主暂不可用、输出无法核验时仍拒绝推断完成或再次运行。成功后恢复原 preparation warning，清除“启动未核验”错误；不再保留上一轮“未知 handle 只能人工核对”的 shortcut。既有输出保留窗口的限制仍在：完成标记若已被淘汰，不能声称已核验。
- 86 项 setup/服务/terminal incarnation 回归通过；另补充不同返回 handle 不覆盖原意图的测试，setup 专项 17 项通过。全量 tc、固定基线质量通过，fork Electron 构建及 native runtime 恢复完成。证据 `.context/multi-repo-setup-retry-handle-{final-tests,identity-tests,tc,quality,build,final-native}.log`。
- 真实临时任务 bc696f42-ab2d-40d1-be07-26f450c4c286，根 .context/setup-retry-live-crW7Xq/task；通过隐藏 UI 首次 exit 7、重试 exit 0，返回 handle 精确为预分配的 term_2192a745-c026-4591-90d0-55c3e5c7407e。关闭测试主进程后，仅把该临时任务 journal 还原到保存 handle/token、尚无退出码的启动意图，模拟回复/完成记录丢失，保留原 daemon。重新启动并继续同任务后 succeeded/exit 0，handle/token 不变，run-count.txt 仍只有 original/retry 两行，根 Agent pending；没有重新创建任务或执行脚本。
- 首次重启检查脚本在 renderer 创建前取页面失败，确认进程退出后改为等待 firstWindow；第一次立即恢复得到 runtime_unavailable，记录未推断进程退出。下一次启动完成初始化后继续原任务，读取原 daemon 输出成功。证据 `multi-repo-setup-retry-handle-live-result.json`、`multi-repo-setup-retry-handle-recovered.json`、`multi-repo-setup-retry-handle-recover-settled.log`（exit 0）。全程隔离 HOME/profile/mock-keychain、窗口 invisible/unfocused；验收结束后只关闭该 profile 的测试 daemon，未触碰正式版或 9567 实例。
- 这是指定丢记录窗口的故障模拟，未代替全部步骤强制退出矩阵；初次 worktree setup 的未知准备/启动窗口、其余 P2/P3 边界、安装升级回退/真实权限及有限 P5 仍需完成，Goal active。现有 arm64 候选尚未重打。

### 2026-10-17：首次创建 setup 的丢回复恢复与分屏身份

- 上轮 6645769c4d 已固定重试的启动身份。本轮将同一机制接到首次创建：task/member 的 setup token/预分配 handle 在 createManagedWorktree 前一起保存；既有 terminal provisioning 仅在调用方提供完成 token 且实际观察 setup 时使用该 handle，普通自动生成 token 的路径不变。返回的 setup handle 必须与意图匹配；跳过 setup 时清除未使用的 handle。
- 保留 setupScriptLaunchMode：新标签页使用既有 createTerminal.preAllocatedHandle，分屏增加仅 main 内部的可选 preAllocatedHandle 并交给既有宿主 spawn；没有宿主 PTY 的 renderer-only split 拒绝该请求，避免悄悄丢失身份。未扩展 RPC/wire，也没有新增 Git 命令或远端首次创建入口。
- 创建回复丢失时，沿原成员登记/lineage 修复找回 instance；只有 registered、文件准备收据 finished、pending handle 精确匹配持久化 token 时，才沿既有完成观察器读取原 setup。准备未知或 handle 不匹配仍保持待核对，不重建工作树或重跑脚本。
- 101 项服务、setup、terminal provisioning 和分屏权威回归通过；追加缺少准备收据/错误 handle 拒绝观察后，19 项 setup 专项通过。新标签页与分屏都覆盖预分配 handle 传递，真实 split runtime 返回相同 handle；服务模拟初始创建回复丢失并找回登记。全量 tc、固定基线质量检查通过，Electron fork 构建及 native runtime 恢复完成。证据 `.context/multi-repo-initial-setup-handle-{tests,boundary-tests,final-tc,final-quality,build,final-native}.log`。
- 隐藏 CDP 实测启用 split-vertical，临时任务 3b5ba4c8-1cbf-470a-b362-a61b8988ae61，根 .context/setup-retry-live-pobLn3/task。首次 setup exit 7，handle=term_29fff256-ce96-49f7-95ce-9b1aaf4d6bda。停止测试主进程后将该任务记录还原为 creating/pending（保留 preparation、plannedInstanceId 和 handle/token，移除返回的 worktreeId/instanceId/exitCode），模拟创建回复丢失；原 daemon 保留。
- 重启后继续同任务，登记恢复到 instance 3755c24a-9d7f-458b-982e-6656cc21760b，原 handle/token 不变，读取 exit 7 并显示 failed/registered，run-count.txt 只有 original 一行，根 Agent pending。证据 `multi-repo-initial-setup-handle-{live-result,recovered,runtime}.json` 与 `multi-repo-initial-setup-handle-ui.log`（exit 0）。全程隔离 HOME/profile/mock-keychain、窗口 invisible/unfocused；结束后核对并关闭该测试 daemon，保留 fixture，没有操作现有 9567 实例。
- 尚未把所有 crash 点逐一强制退出；未启动 setup、文件准备部分失败/未知、失去全部终端历史等仍需对应恢复方案和验收。P3/P4/P5 原剩余范围不变，安装包尚未更新，Goal active。

### 2026-10-17：最新候选独立安装与 A/B 回退演练

- 上轮 21ed142255 完成首次 setup 的丢回复恢复，起始工作树干净。本轮检查文件准备：上游复制逻辑跳过已存在目标，不能通过简单重跑证明半复制目录完整，因此没有加入会误报完成的重放；该缺口仍保留，转而完成独立的安装验收。
- 第五次完整 build:mac:orca34 成功，源码 21ed142255dce4d029302c55ac9c6164a0f33b46，版本 1.4.214-local.1792178623651.21ed142255dc.orca34。沿用完整资源、daemon/plain Node、terminal host 真实 PTY、helper、签名门槛。新 app codesign --verify --deep --strict 通过，DMG hdiutil verify 通过；DMG 268,568,562 字节/SHA256 dbeca6a0c06a14181f08b3e6228fbd4d469d118b66dcef23d683e5cbbf994cd4，ZIP 270,604,228 字节/SHA256 8e5c1d930a3ff521b26589f3a8c5c205405804401b6b2adde71bdbfe7fd13b0a。证据 `.context/multi-repo-fork-builder-candidate5.log`、`multi-repo-fork-candidate5-{signature.log,artifacts.json}`。
- 原目标 ~/Applications/Orca 34.app 不存在。解压并校验第四次候选后安装到该独立路径，实际包内 CLI --help 通过；随后依次旧版本运行、新版本替换升级、旧包+旧数据恢复回退、重新安装并运行新版本。每次替换前测试主进程退出、专用 daemon 停止；没有操作官方 Orca、全局 CLI 或日常默认 profile。
- 专用 profile 为 .context/orca34-install-rehearsal/profile；旧包创建跨两个项目组的 api/web 任务 6954c4fc-3d8f-424c-a41d-3bf650ce2ed0。关闭后 tar 完整备份，归档列表验证通过；回退时把新数据整体移至 profile-after-upgrade，解压旧备份到原路径，未让旧包读写新版数据。工作树目录始终保留。
- 四个阶段都从安装后的实际 executable 用隐藏 Playwright CDP 启动。版本匹配各自 manifest，isPackaged=true，HOME/userData 是专用路径，窗口 invisible/unfocused；任务对象 deepEqual 原记录，两仓分支、各自未跟踪 KEEP.txt、根 notes.txt 均原样。日志 previous/upgrade/rollback/final 均 exit 0；对应 `*-evidence.json`、截图、original-task.json、profile-before-upgrade.tar.gz、保留的旧 app 和升级后 profile 在 `.context/orca34-install-rehearsal/`。
- 当前实际安装为最新第五候选，应用已退出。新增 [安装与回退说明](fork-orca34-install-and-rollback.md)，更新构建隔离审计。此次使用 E2E profile/mock-keychain/临时偏好记录，证明该版本组合的数据保留与安装替换，不证明真实 Keychain/TCC、普通 profile 首启、任意 schema 组合或全部日常功能。P2 文件准备/剩余故障矩阵、P3剩余边界、真实权限与有限 P5 仍需完成，Goal active。

### 2026-10-17：新建完成后进入根工作区

- 新建对话框显式启用完成后打开；历史管理页保持原行为。仅成员 ready、setup 成功/跳过、所选 Agent started、无成员/根错误且本机根入口存在、未归档时调用既有 activateAndRevealFolderWorkspace。关闭创建对话框即停止该 UI 行为，不取消后台创建；阻止重复自动尝试，保留手动打开入口。
- 组件验证覆盖只打开一次、历史详情不跳转、等待 setup/Agent/入口、保留复制警告、关闭后不跳转和激活被拒绝。tc:web、固定基线质量门、fork Electron 构建通过。最终组件与根入口回归记录在 `.context/multi-repo-auto-open-test.log`；测试后恢复 Electron native runtime。
- 隐藏 Electron/CDP 实际新建成功，session.get('local').activeWorktreeId 精确等于任务根 folder key，资源管理器显示 TASK.md；重新从管理页打开同任务并等待两次轮询，详情仍保持。证据 `.context/multi-repo-auto-open-{result,runtime}.json`、`multi-repo-auto-open-hidden.png`、`multi-repo-auto-open-ui.log`（exit 0）。窗口 invisible/unfocused，隔离 HOME/profile/mock-keychain，主进程和该 profile daemon 已退出。
- 验收脚本最初错误读取旧 orca-data.json/UI 的当前工作区字段，又使用未显示的 sidebar 根行定位；改用既有 session API 和实际资源管理器验证。截图中任务分组未显示根行，侧栏 reveal 仍需独立核对，不能将本次导航通过当作全部侧栏验收。
- 未重打或替换候选 5；安装版本仍是 21ed142255 的产物。文件准备部分完成/未知状态继续保守拒绝自动重跑，其余 P2/P3、真实权限及有限 P5 未完成，Goal active。

### 2026-10-17：修复普通项目组中的任务根侧栏入口

- 上轮截图缺少根行的原因已定位：getRenderableFolderWorkspaces 要求父分组有 parentPath，而需求模块复用普通手动分组，parentPath 为 null。改为要求父分组存在；不更改分组目录、不迁移任务、不增加专用侧栏行。既有 host/device 筛选仍在其上游，缺少/被筛掉的父分组仍不显示。
- 给既有 buildRows 验收增加手动分组、无 parentPath、只有根 Folder Workspace 的四种分组模式测试。分组、根 reveal、主机筛选共 63 项通过，tc:web、固定基线质量门通过，fork Electron 重建完成，native runtime 已恢复。
- 隐藏 Electron/CDP 从表单新建真实任务：根会话 activeWorktreeId、Explorer TASK.md 均核对通过；侧栏根行存在且 aria-current=page；管理页打开同任务后保持详情。截图 `.context/multi-repo-sidebar-root-hidden.png` 已检查，根行在“多仓库需求工作区”分组下显示。记录 `.context/multi-repo-sidebar-root-{result,runtime}.json`，执行日志 `.context/multi-repo-sidebar-root-ui.log` exit 0。窗口全程 invisible/unfocused，临时应用及其 daemon 已退出。
- 本次补齐上轮明确留下的侧栏缺口。已安装候选 5 尚未包含本次及上一轮源码改动；文件准备恢复边界、剩余 P2/P3、真实权限与有限 P5 仍需完成，Goal active。

### 2026-10-17：恢复明确跳过 setup 的丢回复创建

- 发现已完成文件准备、计划明确 skip 的创建若丢失最终回复，会被恢复逻辑当作未确认的 setup 启动，等待一个不会启动的终端。新增恢复分支仅接受 registered/pending、持久化 preparation.finished、原计划 skip、无退出码且 handle 缺失或匹配原 token 的记录；重新核验根 marker/真实路径及成员 Git/登记实例后恢复 ready/skipped、清除未使用 handle、保留文件准备警告。不推断 inherit/run，也不重跑文件准备。
- 77 项 setup 与服务回归通过，包括缺少准备完成记录、登记缺失、marker 改动仍不放行；运行类旧测试修正为实际声明 run（此前以 skip 计划模拟 running）。全量 tc、追加 tc:node、固定基线质量门及 fork Electron 构建通过，测试后 native runtime 已恢复。
- 使用上轮已关闭的临时 profile `.context/orca34-sidebar-root-profile-ixbZCu` 和任务 f0d9cfc9-08b7-4022-a61b-88c2c9f30158，保留原 Git/metadata/preparation/token，把该任务 journal 还原为 creating/pending、未保存 instanceId/worktreeId 的意图。隐藏 Electron 重启后继续，同一成员恢复 ready/skipped，实例/worktreeId/token 与原记录一致；新写入 KEEP.txt 完整保留、Agent pending。证据 `.context/multi-repo-skip-recovery-{before,result}.json`、`multi-repo-skip-recovery-ui.log`（exit 0）；隔离 HOME/mock-keychain，窗口 invisible/unfocused，测试主进程及其 daemon 已退出。
- 这是指定持久化窗口的状态还原验收，不冒充完整强退矩阵。部分文件准备/无完成记录、inherit 未启动等歧义仍需解决；安装候选 5 未更新，其余 P2/P3、真实权限和有限 P5 仍未完成，Goal active。

### 2026-10-17：保存未启动 setup 的确定结果

- runtime 准备 setup 后已知道无 hook/策略跳过，但旧路径只在最终返回值给出这个结果，inherit 创建丢回复后无法区分未运行和未知执行。新增 main-only onSetupNotStarted 回调，在确定不会启动 setup、启动终端前调用；需求模块校验原 planned instance、路径、本机主机和 preparation.finished 后持久化可选 setupNotStarted=true，并保留当时警告。普通调用方、远端 create 参数和 wire opcode 不变。
- 恢复只扩展上一轮有文件准备完成证明的分支：原计划 skip 或保存的 setupNotStarted 证明均可；仍核验根所有权/成员 Git/登记实例，不重新读取当前 hook 配置猜测过去是否执行。新字段缺失时保持原保守行为，准备 runner 失败且 shouldRunSetup=true 不会被标为未启动。
- 模块/服务/store 共 100 项通过，全量 tc、固定基线质量门和 fork Electron 构建通过。runtime spec 由 orca-runtime.test.ts 导入，另经该入口定向运行 1 项（其余 1392 skipped），验证回调在 spawn 前调用；没有把未运行的 spec 当作测试通过。测试后 Electron native runtime 已恢复。
- 隐藏 Electron 从表单创建 inherit/无 hook 任务，确实写入 setupNotStarted；退出后只把临时 journal 恢复为 creating/pending、没有最终 worktreeId/instanceId 的状态，保留准备证明和 token。重启继续任务 83d7b3ec-1b6a-4751-9119-907a7ced1290 后 ready/skipped，instance/worktree/token 不变、KEEP.txt 原样、Agent pending。证据 `.context/multi-repo-no-setup-receipt-result.json`、`multi-repo-no-setup-receipt-recovery-{before,result}.json` 及两个 ui.log（exit 0）。全程隔离 HOME/profile/mock-keychain，窗口 invisible/unfocused，临时主进程和 daemon 均已退出。
- 未重打安装候选；未完成的文件准备/证明写入前退出仍保守停住，未假设现有目录完整。其余 P2/P3、真实权限和有限 P5 仍未完成，Goal active。

### 2026-10-17：P2/P3 边界核对与无后续稳定 tag 的 P5 交付

- 回看批准设计：证据不足的准备中断必须停止，不能为“恢复成功率”重跑可能半完成的复制；这是正确的保留行为，但完整关键阶段强退验收仍缺失，不能仅凭状态还原测试完成 P2。检查清理门禁确认 beginRemovalSensitiveInstall 双向检查父子路径重叠，成员删除中的 gate 会同时阻止根 cwd 的新终端/Agent 启动；没有因误认为缺少 root gate 再造锁。
- 只读查询官方明确 v1.4 tag namespace（221 稳定 tag）、main 和最新 10 条 releases。最新稳定版仍为 v1.4.227，commit f51e82c4c26745f6a15e215e4391f533327697e2，发布于 2026-10-16 03:42:35 UTC，早于基线 b16a71c7fb 的 09:52:22 UTC；双方共同祖先 65580c5315e2aecc1eb9876cbab65093e3627f50，基线/release 各自独有 1289/76 提交。没有把这个旧分叉 release 或 main 当作后续稳定版本。
- 按本文预先批准的“无后续 tag”分支，交付 [上游同步与切回官方](fork-orca34-upstream-sync.md)：限定 tag fetch、当前工作目录独立 sync 分支、冲突/验证/候选包/旧任务验收、精确 head 的 PR workflow gate、导出与回退步骤。shell 示例已逐块 bash -n 验证；未执行未来 merge、推送或远端合并。明确没有真实官方版本升级，也没有 PR gate 成功证据；此项无需等待未来发布，但不能称为升级演练通过。
- 接入点按当前 2f50c099de 对固定基线真实 diff 盘点：106 个既有文件、86 个新增文件（包括测试、文档、构建隔离），显著超过最初估算，已在交付文档中明确。提供可重建完整清单的固定 SHA 命令，不声称所有改动只有独立模块。证据 `.context/multi-repo-upstream-{v1.4-tags.txt,releases.json,main-head.txt}`、`multi-repo-integration-files.txt`。
- 本轮未改产品源码/安装包，没有关闭其他应用。P2 完整强退矩阵、P3 实际进程/保护边界、P4 普通 profile 与真实权限、最终候选重新打包仍需完成，Goal active；P5 当前明确走无后续 tag 的文档交付分支，不再把等待未来 release 当作阻塞。

### 2026-10-17：setup 运行中真实 SIGKILL 暴露并修复完成观察缺口

- 本轮不重写 journal：隐藏 Electron 新建临时 Git 任务，setup 写一次 original 后等待 release-setup 文件；观察到 durable registered/running 后 SIGKILL 仅该次启动的主进程，确认 exit signal、原 daemon 存活且 journal 内容未变，重新启动同一隔离 profile 后放行原脚本。
- 首次真实强退测试失败（任务 8e5136f7-f7bc-4feb-a2eb-aa81935c58c2）：没有重复执行，但恢复观察器只读取一次 provider 快照，后台 PTY 没有持续输出订阅，稍后产生的完成标记未被观察，60 秒后保存 failed/timeout。原失败证据保存在 `.context/multi-repo-setup-crash-before-fix.log` 和 `multi-repo-setup-crash-before-fix-task.json`。未把超时当退出或成功。
- waitForSetupTerminalCompletion 对带持久 token 的观察改为顺序读取保留缓冲：每次最多 5 秒，结束后间隔 1 秒，无并发重叠；仍匹配原 token、复核 live handle/PTY，完成/取消后清定时器。保留原实时流和退出观察，不重新启动 setup。已添加晚到 marker 与取消后不再读取的测试。
- 修复后用全新临时任务复跑真实 SIGKILL，主进程 18644 以 SIGKILL 退出，daemon 18711 跨重启不变，journal 未改写；恢复 ready/succeeded/exit 0，同一 instance 2905bccf-7a79-48c7-9443-1417122e340a、term_c4833e6e-9244-4fa6-9999-40f0eaa9be44 和 token 保持，run-count.txt 仍只有 original 一行，根 Agent pending。证据 `.context/multi-repo-setup-crash-{live-result,recovered,runtime}.json`、`multi-repo-setup-crash-ui.log`（exit 0），窗口 invisible/unfocused。
- 测试主进程及专用 daemon 已退出；强退留下的 crashpad helper 保持包装进程管道，按独立 profile/Crashpad 精确核对 PID 18668 后 SIGTERM，随后包装进程正常 exit 0。未操作其他 profile、正式应用或 9567 开发实例。
- 7 项完成观察测试、runtime 入口筛选 setup 的 29 项通过（其余 1364 skipped），tc:node、固定基线质量门和 fork Electron 重建通过，native runtime 已恢复。现有 shortcut 仍成立：若完成标记被缓冲淘汰，不会凭超时推断成功；其他关键阶段强退、实际清理保护、普通 profile/真实权限及最终产物仍需完成，Goal active。

### 2026-10-17：setup 主进程与 daemon 同时丢失的真实强退验收

- 在新的隔离任务运行 setup、已写一次 original 且 journal=registered/running 时，SIGKILL 本次 Electron 主进程 PID 38086 和经独立 profile 验证的 daemon PID 38165；确认旧 daemon 不存在才重启。journal 未重写；新 daemon PID 38674。
- 继续任务得到 registered/failed、terminal_handle_stale，无 setupExitCode；实例 65fa9d62-b4db-4156-a56f-f313c3abbebb、原 term_9e84b349-0acb-48d7-b6f9-da17b7f19ac0 保留。run-count.txt 仍只有 original 一行，根 Agent pending。显式 retrySetup 同样拒绝 stale handle，没有把证据丢失当成功或再次执行。此结论不扩展为所有旧子进程物理退出的证明。
- 证据 `.context/multi-repo-setup-daemon-loss-{live-result,recovered,runtime}.json` 和 ui.log（exit 0）；隐藏窗口 invisible/unfocused，独立 HOME/profile/mock-keychain。测试应用、daemon、专用 crashpad helper 已结束，没有重启正式应用或 9567 实例。
- 新增 [恢复验收矩阵](fork-multi-repo-recovery-validation.md)，明确各关键阶段的真实强退/状态还原/模块测试证据，列出还未覆盖的阶段。当前未改产品源码，不重复无关单测；文档链接检查通过。安装包未更新，完整 P2/P3/P4 仍未完成，Goal active。

### 2026-10-17：根生成文件三个边界的真实强退

- 仅在隔离 Electron 主进程内拦截目标根文件的一次 writeFile，写独立 checkpoint 后挂起；验证 PID/路径、实际文件与 durable creating/planned 后 SIGKILL。重启未插桩的新进程，强退前后 journal 完全相同，没有改写状态模拟中断，也没有新增产品 failpoint。
- marker 写入前（PID 51914）：恢复 needs-attention/planned，保留崩溃后加入的 KEEP.txt，不创建 marker/TASK.md/成员。marker 完整、TASK.md 写入前（PID 61390）：marker 字节不变，补齐 TASK.md、成员在计划 probe/root-crash 分支 ready/skipped。marker 仅写 40 字符（PID 63534）：部分文件和 KEEP.txt 原样保留，停止于 needs-attention/planned；根 Agent 均 pending。
- TASK.md 边界首轮新加 source repo 尚未落盘，强退后根恢复但成员 repo_not_found；保留该失败日志。复验前只读轮询独立 profile SQLite 的 projects/repos 验证 source 已持久化，以隔离真正要测试的根文件边界，未篡改失败任务。此证据不覆盖源仓登记本身的原子性或断电缓存丢失。
- 证据 `.context/multi-repo-root-crash-{before-marker,before-task,partial-marker}-{recovered,runtime}.json` 及对应 ui.log（全部 exit 0）；窗口 invisible/unfocused，独立 HOME/profile/mock-keychain，测试应用/daemon/专用 crashpad 均已退出。更新 [恢复验收矩阵](fork-multi-repo-recovery-validation.md) 中两个根阶段并增加部分写入证据。
- 本轮未改产品源码，不重跑无关测试。文档链接检查通过；Git/metadata、文件准备、Agent 启动回执、实际清理保护、普通 profile/真实权限和最终包仍需完成，Goal active。

### 2026-10-17：Git 成功回执前强退与根登记持久化修复

- 在测试主进程精确截住 git worktree add 成功的 close 事件，确认真实工作树已存在、journal=creating/预分配实例后 SIGKILL；不改 journal、不增加产品 failpoint。首次 spawn 替换未命中，保留 unreached-hook.log，不计强退证据。
- 首次真实命中发现根入口已被 journal 确认为 registered，但 profile 数据库未写入，重启误判用户删入口。修复在 create 计划确认源仓、任务分组配置回执、根 Folder Workspace 回执及显式恢复入口时等待 Store.flushPendingOrThrowAsync；持久化失败则不启动成员。复用既有持久化队列，无新存储或公共 wire 字段。
- 56 项服务测试通过，包含 profile 写失败不登记/不启动成员和根入口先落盘再启动 Git；tc:node、固定基线质量门通过，native runtime 恢复 Electron。误用 pnpm build 触发双架构 native 构建，本机 Swift 缺少 x86_64 compatibility 库失败；随后明确运行 ORCA_BUILD_DISTRIBUTION=orca34 pnpm build:electron-vite 成功。未声称完整 native 构建通过，未改变系统工具链或安装包。
- 最新实际强退 PID 7591，profile orca34-git-crash-profile-KhaAux，task 根 git-crash-live-G0quHp/task。根入口重启保留、journal 强退前后相等、Git 列表/.git/marker/新增 KEEP.txt 原样，setup 和 Agent 未启动。测试进程、daemon 和专用 crashpad 已退出，隐藏窗口未显示或聚焦。
- 进一步暴露普通工作树扫描先创建其他 instanceId 的竞态：恢复正确拒绝覆盖，但未找回原计划实例，故 Git 登记恢复仍未完成。证据 multi-repo-git-crash-git-add-{recovered,runtime}.json 与 ui.log（保守停止断言 exit 0）；恢复矩阵明确标为发现问题，不冒充完全通过。下一步解决扫描与登记恢复的所有权顺序，再继续其余 P2/P3、真实权限及最终候选包，Goal active。

### 2026-10-17：修复扫描抢先分配成员实例与真实 Git 回执前恢复

- 上轮根入口持久化修复是有效进展；本轮追踪实例冲突，定位 Runtime resolveRepoWorktreeRows 为缺少 metadata 的 Git 行补写空元数据，因而产生随机实例；renderer discovery 也有同类入口。一次临时 NODE_OPTIONS UUID 追踪未进入隔离 Electron，只记录包装进程，不作为调用栈证据；源码路径和真实复验提供本轮依据。
- 复用模块现有 owner/journal，在两个发现入口仅对“本机、精确 repo/path、root created、预分配实例存在、creating/needs-attention、尚无最终登记”的成员暂缓自动补写。仍返回工作树行；没有授予实例身份、覆盖现存 metadata 或放宽登记验证。普通/远端发现不变，无公共 wire 扩展。
- 新增 Runtime+renderer 共同回归：待登记行可列出但不写 metadata，已有其他实例不覆盖，意图结束后普通补写恢复。相关 Runtime、发现分类、任务服务共 82 项通过；tc:node、固定基线质量门、Electron fork build 通过，native runtime 已恢复 Electron。
- 隐藏 CDP 实测真实 git worktree add 成功回执前 SIGKILL 主进程 PID 51796，独立 profile orca34-git-crash-profile-nI2ZmI；重启恢复原 instance a68db708-ca78-4182-a615-ff6a6a5863e1，registered/pending。Git 列表/.git/marker/新增 KEEP.txt 原样，journal 强退前后相等，没有重复 add；准备尚无完成证明，setup/Agent 不启动。证据 multi-repo-git-registration-recovery-git-add-{recovered,runtime}.json 和 ui.log（exit 0），窗口 invisible/unfocused，临时应用、daemon、专用 crashpad 已退出。
- 此次解决新任务的扫描竞态；旧失败 fixture 中已经产生的其他实例仍被拒绝覆盖。未声称能自动修复这类既有冲突，也未更新安装候选。文件准备部分写入、Agent 回执、清理边界、真实权限与最终包仍需完成，Goal active。

### 2026-10-17：文件准备部分复制后的真实主进程强退

- 上轮登记竞态修复及实际恢复是有效进展。本轮对已提交 .worktreeinclude/.gitignore 的临时仓库验证部分准备：两个 ignored 源文件，只让精确目标的真实 /bin/cp 复制 first.txt，截住成功 close 回执后 SIGKILL 主进程。checkpoint 保留原始/实际 argv；journal 无改写，无产品 failpoint。这覆盖受控半复制状态下的进程强退，不扩展为复制单文件途中断电测试。
- 首轮 PID 62131 保留验证通过；扩展复验 PID 65544 同样 SIGKILL，重启原计划实例 ed054709-a4b0-4a60-8b81-8d504bcebfa2 恢复 registered/pending，preparation 仍无完成回执。重复 continue 的成员结果相同，显式 skipSetup/retrySetup 均拒绝，setup/Agent 未启动。
- first.txt、崩溃后新增 KEEP.txt、Git 列表/.git/marker 原样，second.txt 始终未出现在目标；没有把已有的半复制目录当作准备完成。证据 multi-repo-preparation-crash-partial-copy-{recovered,runtime}.json 及 ui.log（exit 0），首次结果以 partial-copy-first 前缀保留。使用隔离 HOME/profile/mock-keychain，隐藏窗口不显示/聚焦，临时应用、daemon、专用 crashpad 已退出。
- 本轮未修改产品源码，不重复无关单测；更新恢复矩阵并通过文档链接检查。剩余 Agent 回执与清理强退边界、普通 profile/真实权限和最终安装包仍待完成，Goal active。

### 2026-10-17：成员删除与根清理强退、删除回执持久化修复

- 上轮部分复制验收是有效进展。本轮真实强退覆盖 git worktree remove 前（PID 74045）和 exit 0/close 回执前（PID 77882）：均不改 journal；重启不自动续删或重建成员，continue 转 needs-attention，经显式确认完成清理。前者新增 KEEP.txt 会阻止清理，移出保存后成功；后者根 KEEP.txt 保留。两者任务分支仍指向原 commit。
- 根 TASK.md unlink 完成、marker 尚在的首次强退暴露成员删除持久化缺口：journal 已 removed，但 profile metadata 删除未落盘，重启旧登记重现并阻止根清理。失败日志 multi-repo-root-removal-crash-before-fix.log 保留。成员与根入口删除现在等待 Store.flushPendingOrThrowAsync 后才确认 removed；写盘失败保留待处理状态，复用现有存储队列。
- 成员/服务 87 项回归通过；追加成员写盘失败测试后，删除专项 34 项通过。测试覆盖 member 的 removing 状态到持久化前不得确认、root 写盘失败后可再次确认。tc:node、固定基线质量门、Electron fork build 通过，native runtime 恢复 Electron。
- 修复后新任务 PID 98579 SIGKILL，重启保留 cleanupIdentity device=16777232/inode=275790485；TASK.md 未复活、marker 与新增 KEEP.txt 保留，不自动续删。显式清理因用户文件拒绝，移出保存后再次确认，根目录/入口删除完成、分支保留。证据 multi-repo-root-removal-crash-after-task-unlink-{recovered,runtime}.json 与 ui.log（exit 0）。成员两次证据为 multi-repo-removal-crash-{before-git-remove,after-git-remove}-{recovered,runtime}.json。
- 全程独立 HOME/profile/mock-keychain、隐藏窗口 invisible/unfocused，临时应用/daemon/专用 crashpad 已结束。未更新安装包；根入口删除最后回执、Agent 回执、实际运行根 Agent 的清理保护及真实权限仍需验收，Goal active。

### 2026-10-17：根目录/入口删除后的最终回执强退

- 上轮成员/根清理强退和持久化修复是有效进展。本轮先在 rmdir 真正成功后截住回执并 SIGKILL 主进程 PID 7343：重启不重建根目录，入口仍在，经再次确认完成清理；分支和任务外保存文件保留。
- 再拦截精确任务 journal 的最终 renameSync：临时内容 root=removed 但尚未发布，只读 SQLite 证明 folderWorkspaces 已无该入口、根目录缺失、旧 journal=created，然后真实 SIGKILL。首轮重试因入口已删、旧路径不再获授权，申请 watcher 锁时报 Access denied；保留 multi-repo-root-final-crash-before-fix.log，未修改失败 journal。
- 修复只在 cleanupIdentity 已保存、原目录和原入口均缺失时完成 profile 持久化及 journal 确认，不再申请无文件操作可做的 watcher 锁；存在/替换目录仍保持原保护，不扩大路径权限。追加现有持久化失败重试测试，明确 watcher 再次申请会报错而本路径不调用它。
- 34 项删除专项、tc:node、固定基线质量门、Electron fork build 通过，native runtime 恢复 Electron。修复后新任务 PID 22945 SIGKILL，同窗口 SQLite folderWorkspaces=[]、journal 前后相等；重启再次确认 created→removed，目录未复活、分支保留。
- 证据 multi-repo-root-removal-crash-{after-root-rmdir,before-final-journal}-{recovered,runtime}.json 及对应 ui.log（exit 0）。独立 HOME/profile/mock-keychain，隐藏窗口 invisible/unfocused，临时应用、daemon、专用 crashpad 已退出。Agent 回执、明确 skip 的最终创建回执、实际运行 Agent 的清理保护、真实权限和最终包仍待完成，Goal active。

### 2026-10-17：跳过 setup 的最终创建回执真实强退

- 上轮根清理末尾修复与强退是有效进展。本轮在精确任务 journal 最终 renameSync 前挂起：待发布 ready/skipped，磁盘仍 creating/pending、preparation.finished、setupNotStarted=true，没有最终实例字段。真实 SIGKILL 后重启未插桩进程，未改写 journal。
- 显式 skip 配置真实 run-by-default hook（会写 run-count.txt），PID 33940 强退后恢复原实例 572ff7bb-99bd-4291-819e-96390fd55a33 为 ready/skipped，计数文件未生成。inherit/无 hook 的 PID 35823 同样恢复原实例 71773675-b0ec-45aa-8067-12ec439f619c；两者未启动根 Agent、清除未使用 setup handle。
- 强退前后 journal 相同，Git 列表/.git/marker/KEEP.txt 原样，重复 continue 的持久化成员内容相同。首轮断言仅因 undefined 字段与省略字段的对象比较差异失败，保留日志后改为 JSON 语义比较；新 fixture 复跑通过，没有改产品状态或掩盖执行失败。
- 证据 multi-repo-skipped-crash-{skip,inherit}-{recovered,runtime}.json 及 ui.log（exit 0）。隔离 HOME/profile/mock-keychain、窗口 invisible/unfocused，临时应用/daemon/专用 crashpad 已退出。仅更新验收文档，链接检查通过，未重跑无关单测或更新安装包。Agent 启动回执、运行中 Agent 清理保护、真实权限与最终包仍待完成，Goal active。

### 2026-10-17：根 Agent 启动回执真实强退与唯一消息核对

- 上轮 skip/no-hook 强退是有效进展。本轮调用实际 Codex structured 启动路径，提示只要求 ACK、不用工具或改文件。测试 profile 启用原生 Chat，在任务最终 journal renameSync 前截住 agent=started 回执；磁盘仍 starting、operationId 已保存，SIGKILL 主进程 PID 49003。未更改正式账号/凭据/全局配置。
- 重启 continue 重放同 operationId=1792182487422-b94db152737a40dd8990937839e1f036，同 session codex_85485812_4379_496e_a0e8_d8eb3fa7bba3、tab/handle、messageId 保持；再次 continue 的持久化结果相同。强退前后 journal 相同，Git 列表/.git/marker/KEEP.txt 保留。首轮仅因 undefined 与省略字段比较失败，保留日志后按 JSON 语义复验通过。
- 只读 SQLite 断言原工作区只有一个 session、一个 submission；启动 operation 唯一 succeeded 且回执相同。派发状态只有 pending→unknown（host_restarted_before_acknowledgement），未重复提交或派发。此证据不证明模型收到或处理任务；unknown 被保留，而非自动重发。
- 证据 multi-repo-agent-crash-codex-{recovered,runtime}.json、multi-repo-agent-crash-journal-evidence.json 和 ui.log（exit 0）。隔离 HOME/profile/mock-keychain，窗口 invisible/unfocused，测试主进程、daemon、专用 crashpad 已退出。未改产品源码，文档链接检查通过；实际运行根 Agent 的清理保护、真实权限和最终候选包仍待完成，Goal active。

### 2026-10-17：运行中 Agent 验收的认证限制与第六候选安装回退

- 上轮 Agent 回执强退是有效进展。本轮启动独立 HOME 的实际 Codex structured 会话，请求在临时成员内持续写 WRITER 文件；provider 返回 401 Missing authentication，writer 未启动，等待文件的用例失败。停止根会话调用正常返回，但此结果不证明模型运行中写入的物理停机。没有修改正式凭据或全局配置，未把认证失败当作验收通过。
- 失败证据 multi-repo-agent-stop-ui.log、multi-repo-agent-stop-auth-evidence.json，stopRoot 调用记录 multi-repo-agent-stop-auth-failed-result.json。会话 codex_974f56d4_7193_426b_84ff_502c5a3a4399，任务 55253f79-64eb-413c-bf67-d1ea79fd0469；测试应用和专用 daemon 已退出。剩余运行中模型写入/清理验收需有认证的隔离执行环境，其他交付工作继续。
- 第六次完整 build:mac:orca34 成功，源码 b3ece9928cd7b025fcba539f940306763fef0b71，版本 1.4.214-local.1792182772871.b3ece9928cd7.orca34。执行全量 typecheck、桌面/CLI/web/mobile 资源、single-arch macOS 原生组件、Electron native runtime、daemon/plain Node 与 terminal host 实际 PTY、签名门禁。日志 multi-repo-fork-builder-candidate6.log exit 0，codesign deep strict、DMG hdiutil verify 通过。
- DMG 268,560,536 字节/SHA256 5e4538bdcf2b18e4424c99c8b99c94fac43b886152f010f1d28e9ef087c5c43c；ZIP 270,603,208 字节/SHA256 f9da220902e1c6f823dfedd239cbca266bd6a4c078dc4eac040e2bb3e205fdbd。manifest 明确 ad-hoc，未 notarize，不声称真实 TCC 路径已验收。
- 确认独立已装第五候选无活动进程后，备份演练 profile，保留旧 app；实际升级→恢复旧包及配套旧数据→重新安装第六候选。三个隐藏 CDP 阶段均 exit 0，packaged=true、版本匹配manifest、HOME/profile 隔离、窗口 invisible/unfocused；旧双仓任务 6954c4fc-3d8f-424c-a41d-3bf650ce2ed0 deepEqual、成员分支/KEEP.txt/根 notes.txt 不变。证据 .context/orca34-install-candidate6/，含旧 app、旧数据备份、升级后数据保留、三个 evidence/日志/截图。
- 当前 /Users/wzh/Applications/Orca 34.app 已是第六候选，应用及专用 daemon 均退出。更新安装回退说明；未操作官方应用、默认日常 profile、全局 CLI。运行中 Agent 清理、真实 Keychain/TCC 与完整完成审计仍待执行，Goal active。

### 2026-10-17：真实 Codex 成员写入停止与文件保护通过

- 隔离器主动移除 CODEX_HOME，导致上一轮未继承认证。仅将本机文件式 auth.json 复制到本次临时 HOME（目录 0700、文件 0600），没有复制全局配置或扩大 sandbox；使用 workspace-write 的实际 Codex structured 会话启动成员内 120 秒 Python 写入。
- 首轮只等待文件存在，在第一行尚未写入时断言失败；保留 authenticated-ui.log。改为等待实际 tick 内容后新 fixture 复验 exit 0。Python PID 45452 在停止前存活且已写入；stopRootForCleanup 后确认 ESRCH，随后 removeMember 因未跟踪文件拒绝，文件内容原样保留。
- 证据 multi-repo-agent-stop-result.json、multi-repo-agent-stop-authenticated-retry-ui.log、multi-repo-agent-stop-auth-cleanup.json。profile orca34-agent-stop-profile-VVxGmg；窗口 invisible/unfocused，临时应用/daemon 已退出。认证副本全部删除，原文件摘要不变；首次失败的 PID 32322 也已退出。
- 本轮仅更新验收文档，没有产品代码变更或重打包。第六候选仍为当前安装版本；普通启动的真实 Keychain/TCC 与完整需求审计仍待完成，Goal active。

### 2026-10-17：完成审计与当前候选身份复核

- 上轮真实 Agent 停止验收是有效进展。本轮新增 [完成审计](fork-multi-repo-completion-audit.md)，将批准范围与可查证据、尚缺验证逐项对应；未用部分测试代替完整 P0–P5。
- 当前多仓模块 14 文件 228 测试通过，日志 multi-repo-final-module-audit.log；Electron native runtime 已恢复。只读核对已装第六候选主包和 6 个嵌套 bundle，均使用 fork ID；codesign deep strict 通过，证据 multi-repo-final-package-identity.json。修正隔离文档顶部仍指第五候选的旧信息。
- 真实 Keychain/TCC 可能弹系统窗口，按 AGENTS 的原生焦点限制未自动触发；已请求用户手动打开已装应用并反馈普通首启/终端。尚未收到结果，不作通过声明。继续独立的 UI/兼容/完整 workflow 审计；真实 Claude 失败限制保留，Goal active。

### 2026-10-17：第六候选深浅色预览与关键键盘交互

- 上轮完成审计是有效进展。本轮使用 electron 技能/隐藏 Playwright CDP，从已安装第六候选启动全新隔离 HOME/profile/mock-keychain；核对 packaged=true、userData 隔离及窗口 invisible/unfocused。
- 浅色和深色均通过 Enter 打开、名称到说明的 Tab、键盘仓库搜索选择、Setup 菜单 Home/ArrowDown/Enter、预览/返回及 Escape 关闭。测试会显式设置 DOM 焦点，不冒充全程 Tab 遍历或原生焦点测试。预览未创建任务、对话框无横向溢出；两张截图已查看。
- 初轮提示拦截、下拉焦点调度、写主题后需重载的测试准备错误均保留失败日志。最终仅预置测试 profile 的功能提示已读并等待正确焦点/主题，不改产品代码。证据 multi-repo-keyboard-themes-evidence.json、multi-repo-keyboard-themes-complete.log exit 0 和 light/dark PNG。
- 测试应用/daemon 已退出；失败轮次主进程已退出但专用 crashpad 保留输出句柄，核对精确 profile/PID 82256 后结束该 helper，原 session 返回 exit 1。日常数据、系统权限、官方实例未操作。Explorer/成员 diff/review、profile 切换及完整回归审计继续；人工首启反馈仍待，Goal active。

### 2026-10-17：第六候选根 Explorer 与成员 editor/diff 上下文

- 上轮深浅色/键盘验收是有效进展。本轮从已安装第六候选启动隔离 profile，新建两个不同项目组的 api/web 源仓，经正常 API 创建双仓任务，再从管理 UI 打开根与成员。根 Explorer 列出两成员及任务文件；各成员文件列表不混入另一仓文件。
- 通过可见 Monaco editor 的 data-uri 严格核对成员完整路径，显示各自 modified 内容。Source Control 显示对应 nav/api、nav/web 分支和 +1/-1 文件，点击实际文件行打开 diff，原始 original/current modified 均有断言；截图已查看。两个源 checkout 文件保持 original，成员保持 modified，没有提交/推送/review 网络写入。
- 首轮断言遇到 NBSP 与保留的隐藏 editor，日志保留；修正测试为文本空白规范化和当前可见 editor 精确路径后复验。证据 multi-repo-navigation-{fixture,initial,editors}.json、multi-repo-navigation-diff.log exit 0 及各截图；测试应用/daemon 均退出，窗口始终隐藏未聚焦。
- 无产品代码变化，无需重打包或重复单测。线上 GitHub/GitLab review、profile 切换、其余兼容与完整 workflow 审计继续；人工首启结果仍待，Goal active。

### 2026-10-17：Profile 边界回归及核心注册测试修复

- 上轮成员 editor/diff 验收是有效进展。本轮 profile handler/持久化、preload 检查点和多仓 IPC/store 5 文件 70 项通过；继续扩大到核心注册与退出 writer 测试，发现新增多仓 registrar 未在原测试 mock，首项因 ipcMain 缺失失败并导致两项初始化依赖失败。
- 复用现有 registrar mock 模式补齐多仓接线，更新回调已包装的预期；分别让应用重启与 profile 切换等待未决多仓关闭 Promise，断言后续 lifecycle 回调不可提前、完成后调用一次。修复后 2 文件 10 项通过，tc:node 与固定基线质量门通过，Electron native runtime 已恢复。
- 证据 multi-repo-profile-boundary-audit.log、multi-repo-profile-wiring-{audit,fixed,tc,quality-final}.log。未改运行时代码，没有为测试修正重新打包。实际 profile 往返、线上 review、其他兼容/完整 workflow 仍需验收，人工普通首启反馈仍待，Goal active。

### 2026-10-17：评审共用路径与真实 Git 2.25 基线验证

- 上轮修复核心注册测试是有效进展。本轮评审共用路径 7 文件 103 项通过，覆盖 GitHub/GitLab 路由、host capability、目标/旧响应等；使用 mock transport，不冒充线上 PR/MR 验收。日志 multi-repo-review-context-audit.log。
- 按仓库 prepare-git-compatibility 固定 SHA-256 下载 Git 2.25.5，在工作树 .context 编译测试用 arm64 二进制，不替换系统 Git。为本机编译禁用 OpenSSL/CURL，仅验本地操作；源码摘要与环境记录保留。
- PR workflow 的三份真实 Git 合约 36 通过/1 跳过，跳过是旧版本不支持 rebase --update-refs 的预期路径；同一 2.25.5 PATH 下多仓主进程模块 10 文件 195 项通过。证据 multi-repo-git225-{build,contract,module}.log、multi-repo-git225-environment.json。Electron native runtime 已恢复。
- 无产品变更，不重打包。profile 实际往返、线上 review、真实普通首启、其余兼容与完整 workflow 证据仍需处理；本轮本地测试不能替代 Linux/Windows CI，Goal active。

### 2026-10-17：完整 Runtime 与普通删除回归、fork CI 条件核对

- 上轮 Git 2.25/评审回归是有效进展。本轮完整 orca-runtime.test.ts 入口 1392 通过/1 跳过，覆盖普通本机/SSH/终端/创建/删除/评审片段；8 份删除/权限/Folder Workspace 持久化/真实 Git 集成文件 105 项通过。证据 multi-repo-runtime-full-audit.log、multi-repo-removal-integration-audit.log。已恢复 Electron native runtime。
- 只读 gh API 核对 fork：公开 34/orca，Actions 已启用，main=固定基线；未发现 34/local/功能分支，最近 runs 为空，repo runners 列表为空。当前 PR workflow 多处使用 Blacksmith，draft code_paths 跳过；未据空 runner 列表武断判断外部 Blacksmith 不可用，也未冒充完整 gate 已绿。
- 无产品改动、无重打包、无远端写入。实际 profile 往返、线上 review、普通首启与完整 CI 仍待完成，Goal active。

### 2026-10-17：第六候选真实 profile 往返与数据隔离

- 上轮完整 Runtime/删除回归是有效进展。本轮使用 electron 技能、Playwright CDP 和本机 Inspector，从已装第六候选的导航测试 profile 经正常 createLocal/switchProfile 创建第二配置并往返。没有改 index、mock relaunch 或手工代替应用重启。
- 实际主进程 PID 91943→92824→93096，逐个核对测试 userData、background=1、窗口 invisible/unfocused。第二 profile repos/tasks 为空；切回后任务列表 deepEqual，两个成员 modified 文件保留。最终核对 userData 后正常 app.quit，确认进程退出，专用 daemon 已停止。
- 证据 multi-repo-profile-roundtrip-{intent,evidence}.json、multi-repo-profile-roundtrip.log exit 0。当前 multiProfileUi=false，使用正常接口验证而非菜单；本轮覆盖已就绪任务，处理中 drain 的证据仍是前轮专项测试，不扩大声明。
- 无产品源码变化，无需重打包。真实普通首启/Keychain/TCC、线上 review 与完整 CI 仍待完成，Goal active。

### 2026-10-17：完整 lint 发现类型边界与本地化缺口

- 上轮真实 profile 往返是有效进展，公开推送确认和普通首启反馈尚未收到。本轮运行完整 pnpm lint，发现多仓 owner 的六处宽泛 object 参数违反 anti-slop。复用已有 ProjectRuntimeResolutionStore 收紧三个文件的参数/WeakMap 键，无新抽象、无运行逻辑变化。
- tc:node、相关 11 文件 217 项测试、固定基线质量门通过；Electron native runtime 已恢复。esbuild 比较三文件与第六候选 b3ece9928cd7 的 JS 输出完全一致，证据 multi-repo-owner-types-runtime-equivalence.json。
- 第二次完整 lint 通过 oxlint/anti-slop，在 native plugins 的 mobile 四文件五条循环依赖警告停止；四文件均未相对固定基线修改。未抑制规则，继续逐个执行剩余 lint 脚本，除 localization coverage 外全部通过。
- localization coverage 明确检出多仓 UI 硬编码文案，是本功能真实未完成项；下一步补齐既有翻译系统接入并复验 UI/候选。完整 lint 未通过，不能用 changed-lines 通过替代。日志 multi-repo-full-lint-{audit,fixed}.log、multi-repo-owner-types-{tc,test,quality}.log、multi-repo-lint-remaining-results.json。Goal active。

### 2026-10-17：多仓界面与手动更新本地化

- 将多仓创建、计划预览、管理、安全清理、成员打开错误及手动更新文案接入现有 translate；补齐中英文及插值，其他语言沿用英文回退。阶段标签按当前语言生成，避免模块初始化时固定语言。未改变创建/删除/更新策略或样式。
- 多仓 renderer 4 文件 34 项与更新设置 2 文件 11 项通过；新增当前语言切换的阶段标签回归。tc:web、固定基线 changed quality、catalogs/extraction/coverage 检查通过，coverage 仅余 13 项既有 allowlist。证据 multi-repo-localization-*.log。
- 全量 lint 仍有前轮记录的既有 mobile 循环依赖阻断，不声称全门通过。下一步从此提交生成第七候选并检查实际中英文界面，当前安装仍为第六候选。公开推送确认与普通首启反馈尚待，Goal active。

### 2026-10-17：第七候选中英文界面与安装回退通过

- 从 c005a01a9447 完整构建第七候选，typecheck、桌面资源、arm64 原生组件、打包终端 host PTY 验证通过；签名 deep strict 与 DMG checksum 通过，摘要记录 multi-repo-candidate7-artifacts.json。
- 使用 electron 技能和隐藏 Playwright CDP，实际检查 en/zh × light/dark 四组键盘选择仓库、setup、预览、返回和关闭。任务列表不变，窗口 invisible/unfocused，dialog scrollWidth=clientWidth=510；已目视英文浅色/中文深色截图。证据 multi-repo-localization-ui-evidence.json、日志 exit 0 和四张截图。
- 独立安装位置完成第六 → 第七 → 第六及配套 profile → 第七，三阶段版本/任务/分支/KEEP.txt/root notes 一致，测试进程与 daemon 已退出。旧包和配套数据保留于 orca34-install-candidate7，安装回退文档已更新。没有启动日常 profile 或修改系统授权。
- 普通首启反馈及公开推送确认尚待；完整 lint/CI 和真实 Claude 限制仍按审计记录保留，不以新候选打包通过替代完整验收。Goal active。

### 2026-10-17：全部改动测试集中回归

- 上轮本地化与第七候选安装是有效进展。本轮重新读取设计/验收，工作树起始干净；从固定基线 diff 枚举全部新增/修改测试，一次 pnpm test 运行 48 文件：47 通过、1 跳过，共 576 项通过、2 项跳过，退出码 0。未启用的真实 Codex CLI visuals 是跳过来源，未冒充实机通过。
- 补跑 PR preflight 中 selector fanout、feature wall asset budget、macOS entitlements 三项，均通过。证据 multi-repo-changed-tests-{list,result}.json、combined.log 与 multi-repo-preflight-extra-results.json；Electron native runtime 已恢复。
- 完成审计顶部已更新到第七候选，明确 profile 往返/本地化不再待办。本轮无产品源码改动，不重复打包。完整 lint 的 mobile 基线循环依赖、远端完整 CI、普通首启授权和真实 Claude provider 限制保留。公开推送和人工首启尚无答复；Goal active。

### 2026-10-17：移除完整 lint 的循环依赖阻塞

- 上轮集中回归是有效进展。本轮核对 pr.yml，确认 native plugins 同样扫描 mobile，因此继续修复本机可处理的 gate，而非只等待外部确认。
- 将 RpcClient context 与读取 hook 移到独立叶子模块，native/web provider 与 host hooks 使用同一 context；保留 provider 对外导出，页面重连测试移除原为循环依赖设置的 mock。终端格子尺寸/缩放读取与选区范围计算移到两个叶子模块，保留旧导出入口，计算与交互逻辑不变。没有禁用 lint 或增加 max-lines 限额。
- 更新生成的 WebView 脚本，并将 bundle 输入计数从 50 改为 52，仍检查没有外部依赖或循环包装器；两个新增输入是本地计算模块。73 文件 684 项 mobile 测试通过；mobile 产品 typecheck、lint、测试类型 ratchet、固定基线 changed quality 通过。直接 typecheck:tests 仍报告既有 grandfathered 文件错误，未扩大豁免。
- 完整 pnpm lint 首次全部通过，证据 multi-repo-full-lint-final.log；其他证据 multi-repo-mobile-cycle-*.log。初轮重复 import、未用 vi 和旧生成产物失败均修复，保留日志。
- 本次涉及构建中的 mobile Web 资源，不能把第七候选当作最新源码产物；下一步构建候选 8。普通首启/真实 Claude/公开推送确认仍待，完整远端 gate 未执行，Goal active。

### 2026-10-17：第八候选构建与安装回退通过

- 从 966a0f556fc3 构建候选 8，完整 typecheck/desktop/mobile/native 与打包终端 PTY 检查通过；deep strict 签名和 DMG 校验通过，产物摘要见 multi-repo-candidate8-artifacts.json。
- 独立安装位置完成第七 → 第八 → 第七及配套旧 profile → 第八，三个阶段任务 6954c4fc、成员分支、KEEP.txt/root notes 保持一致。证据 orca34-install-candidate8/ 的日志/evidence/截图。应用和专用 daemon 已退出，没有启动日常 profile。
- 安装回退文档更新到第八候选；全量 lint 已通过。当前仍待公开推送确认及完整 CI、普通首启反馈、真实 Claude 配置问题，Goal active。

### 2026-10-17：阻塞审计

- 前轮修复循环依赖并安装第八候选为有效进展。本轮再次核对：工作树干净，安装 manifest 为 966a0f556fc3；升级/回退/最终安装三阶段记录通过。只读 gh 查询 34/orca Actions 返回 total_count=0，没有当前 head 的完整 PR gate。
- 公开推送确认、普通首启人工反馈以及真实 Claude provider 验收缺口已连续至少三轮存在，期间已完成可独立执行的本地修复、全量 lint、集中测试及候选安装。自动继续不等于对此前提问的答复，不自动公开推送或改变全局账号/系统授权。
- 当前无运行中的候选构建/验收任务可等待，也无已识别的独立本机修复待执行。按 Goal 阻塞规则标记 blocked，未完成或缩小目标。恢复条件：收到公开推送确认以执行完整 workflow、普通首启/终端结果，以及可用于真实 Claude 合约验证的 provider 配置说明；后续按实际结果继续修复。

### 2026-10-19：用户调整 Agent 验收范围

- 用户明确暂时忽略本地真实 Claude 测试：没有 Claude 订阅或使用需求。历史失败保留，但不再作为当前交付阻塞，也不要求用户购买订阅或调整 Claude provider。
- 当前以 Codex 为已验证主路径；用户计划使用 Cursor Agent，Pi 仅为后续可能接入、当前暂不使用。源码核对：多仓创建选择器仅允许 Codex/Claude，终端 metadata 授权也明确拒绝其他 Agent，因此 Cursor 多仓根 Agent 尚未支持，不能沿用普通工作区 Cursor 支持宣称本功能可用。
- 本轮按用户要求解释公开推送/完整 PR 检查与普通首启/终端人工检查的操作方式。尚未收到公开推送授权或首启结果，不执行远端写入或代替用户启动可见窗口。

### 2026-10-19：用户首启反馈与公开 PR 授权

- 用户明确同意推送至公开 34/orca、创建 PR 和运行检查；明确不合并或发布安装包。
- 用户提供截图并反馈操作正常：终端打印 ORCA34_TERMINAL_OK、pwd 为 /Users/wzh/code/work/blogo、git status 显示工作树干净，命令后仍可输入。只读进程核对 PID 6382 从 /Users/wzh/Applications/Orca 34.app/Contents/MacOS/Orca 34 运行；官方应用也在运行，未操作其进程。
- 将普通首启/终端人工反馈记为通过，不扩大为所有 Keychain/TCC 授权路径已验证。真实 Claude 按用户前轮说明不再阻塞；Cursor 多仓支持仍待接入。
- 推送前核对 fork 地址、写权限、34/local 为固定基线、目标两分支尚未在远端出现；215 条变更路径无 .context/账号文件，新增文本的常见私钥/token 模式检查无命中。准备推送并由远端完整 workflow 给出证据，不提前宣称 CI 通过。

### 2026-10-19：公开 PR 与首轮 CI 修复

- 已推送固定基线 34/local 和功能分支，创建 https://github.com/34/orca/pull/1；没有合并或发布安装包。Git HTTPS 未配置 credential helper，单次命令复用 gh git-credential 完成推送，没有更改全局配置。
- Actions API 虽报告 enabled/active，网页仍有 fork 工作流总开关。先将无关发布/部署等 88 个工作流保持 disabled，再开启 fork，只启用 PR/Mobile 及其复用依赖共 7 个工作流；实际触发 PR 39189099746 与 Mobile 39189099302。配置快照保存在 .context/orca34-checks-only-workflow-{plan,result}.json。
- PR 首项一直等待 Blacksmith，repo runners 为空；为 34/orca 四个相关 runner 使用 ubuntu-24.04，其他仓库仍沿原配置。109 项 runner/CI 合约与 required-context 校验通过，保留全部 jobs、条件与 verify 汇总，没有缩小检查范围。
- 首轮 Mobile CI 为 1014 文件通过、5 文件失败，发现录制 harness 仍读取迁移前 context。修复共享 exposure 和 history adapter 的模块/导出引用，保留原录制断言；相关 27 文件 1785 项通过、3 跳过。首轮失败日志及修复日志保留 .context/orca34-mobile-pr1-failures.log、orca34-mobile-recording-fix-final.log。
- 当前改动只有 CI/test harness/docs，已安装第八候选运行时代码不变，不重打包。后续检查必须对应更新后的 PR head；首轮失败不能记作通过。

### 2026-10-19：第二轮 CI 与 fork 发布基线

- head 1f6c8c2f70 的 Mobile Checks 39189653473 已通过。PR Checks 39189653480 的静态分析/类型检查、Git 兼容、shell、Codex 合约、Linux/Windows 打包及终端模式切换均通过；完整汇总仍待其余任务。
- 跨版本任务因公开 fork 没有 vX.Y.Z 标签失败，尚未进入兼容旅程。为 34/orca 增加只读获取 stablyai/orca 发布标签的步骤，既供最新版本选择也供测试中固定的旧版本使用，不向远端推送标签，不删除或绕过任何检查。
- 本地实际获取确认最新稳定版 v1.4.229（a0cd1644f320f1327f7495650a816111b495f3cd）；daemon 协议 48 的升级/回退通过，CI/协议脚本 48 项通过。完整跨版本测试另行记录，不能用脚本单测代替远端任务通过。

### 2026-10-19：完整 PR 首次完成后的失败修复

- PR Checks 39189653480 完成，完整汇总失败。五组单测共约 12 万项通过，失败不能因大多数通过而忽略。已下载各失败 job 日志，不替换或取消汇总要求。
- 修复三项真实 SQLite 消费测试未登记 Node、Windows runner 检查误把确定的 Linux 两分支表达式当未知、仅断言 .cmd 文件内容的 CLI 构建测试未登记；相关守卫和业务测试 116 项通过。目录清理预览断言改为集合比较，保留内容完整性断言，避免平台返回顺序差异。
- 多仓功能允许无 parentPath 的手工项目组显示文件夹工作区，更新两处旧侧栏/未读计数预期，并保留缺少项目组时隐藏/不计数的断言；未读三文件 22 项通过。
- 最新上游将 isStructuredTab 移至 shared 叶子模块，跨版本夹具按文件存在性选择真实导出，保留旧版入口；此前 223 项通过，修复后其余 8 项也通过。
- macOS 启动器夹具补真实 Info.plist，路径按脚本实际解析方式断言；依赖 /usr/bin/plutil 的两个 macOS 用例在 Linux 显式跳过、在本机执行。没有降低信号转发、监听端口释放或环境清理断言。
- AppImage 实际升级/终端存活测试在 Bun 下的认证清理失败，改登记至 Node 项目以验证运行时差异假设；归属证明与安全清理逻辑未改。该 Linux 专项仍需新 head 的远端结果，不提前认定根因或通过。

### 2026-10-19：4e5cf47ce2e 远端结果与真实 daemon 测试登记

- PR Checks 39193278239 中跨版本 46 文件/231 项、Linux/Windows 打包、E2E、布局及四组单元测试通过；Mobile Checks 39193278240 通过。完整汇总仍失败：第二组仅 Electron→Node daemon 升级文件的两个 Bun 认证清理用例失败。
- AppImage 同类用例转至 Node 后，两个实际升级/终端存活/认证清理测试远端通过，未改变产品归属校验。源码检查发现另一升级文件及五个 opt-in orcad 集成文件也直接调用同一真实 profile-daemon 清理夹具。
- 新增 runtime boundary 守卫先报出上述六个遗漏，再补齐 Node 登记；两组边界守卫 14 项转绿，固定基线质量检查通过、Electron native runtime 已恢复。五个 opt-in 文件只修正运行环境，不声称其已实跑；新提交仍须完整远端复验。
