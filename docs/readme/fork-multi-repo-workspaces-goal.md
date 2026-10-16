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
