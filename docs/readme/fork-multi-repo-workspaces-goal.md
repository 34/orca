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
