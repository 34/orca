# Orca 34 本地交付入口

当前支持 macOS arm64、Orca 34 独立身份的 ad hoc 本地包。命令不会创建 GitHub Release 或推进 main/local。它会替换你显式传入的安装目录，必须先使用隔离安装和隔离 profile 演练；不要把日常目录当作测试参数。

## 一次交付

官方同步候选可先使用只构建入口，固定当前干净源码的完整 SHA 和已有的非草稿 PR：

```sh
pnpm prepare:orca34:candidate "/absolute/releases/upstream-state" 2 "<full-source-sha>"
```

该入口重新发现官方稳定版，确认其提交已包含在当前源码，复用发布目录维护许可和版本去重记录。完整 PR workflow 未成功时保存 `waiting`。完整检查通过后，还核验 GitHub 的 required checks 全部 SUCCESS、无重名歧义，且合并状态为 CLEAN/MERGEABLE、审核无阻塞；前后复核 head/base 和完整 workflow 身份。缺失、等待、跳过、取消、失败、冲突或分支落后都不能进入构建。成功后构建并校验独立候选，重新核对相同检查证据后保存 `verified`。状态位于 `candidates/<sha>/candidate.json`。再次执行同一命令恢复；中断构建保留旧目录并使用新输出，已完成候选则复核身份与最新检查，不重复构建。PR 绑定或官方目标改变时停止，需使用对应的新集成提交。

此入口只生成本机候选，`verified` 表示这次源码与完整 workflow、仓库合并策略和产物身份核验一致，不是长期有效的合并或安装许可。GitHub 明确报告没有 required checks 时，仍必须通过完整 workflow 和 CLEAN/MERGEABLE 门禁；查询失败不能解释为没有要求。它尚未执行自动冲突修复、合并、安装、定时触发或通知；这些仍是后续编排步骤。

发现版本时的网络失败也保存为 `failed`。回执的 `notice` 保存最近一次失败、检查阻塞或候选就绪结果及递增 `sequence`；相同结果重试不会更改编号。初次等待 CI 不产生通知记录，旧结果在等待或构建时标为 `active: false`，不能作为当前待发送通知。调度器接入后须只消费 active 记录，以源码 SHA 和 sequence 去重，并持久保存送达编号；当前没有自动发送通知。

### 有限冲突修复

在专用 `codex/` 集成分支已开始 merge、保留 MERGE_HEAD 的情况下运行：

```sh
pnpm repair:orca34:integration /absolute/persistent/release-state ORIGINAL_HEAD_SHA MERGE_TARGET_SHA
```

状态目录必须位于源码检出之外。命令核对 HEAD、ORIG_HEAD、MERGE_HEAD 和分支，复用发布目录维护许可，先保存尝试记录再启动真实 `codex exec --approve-for-me`；该模式采用 workspace-write 与自动审批审核，不禁用沙箱或审批。每次调用最多运行一轮，每组合并双方最多三轮，记录在 `repairs/<head>-<target>/repair.json`。

Agent 只解决冲突、暂存已解决文件并运行定向测试。入口随后核对合并身份、冲突列表、暂存与未暂存 diff、类型检查和增量质量门禁。成功状态为 `awaiting-review-and-full-ci`，仍须复核修改、提交 PR 并通过完整检查；不自动提交、推送、合并或安装。每轮 Agent 输出及验证日志保存为私有回执。

已确认子进程退出的失败可用相同命令重试，次数不清零。调用进程中断、或无法确认 Agent/验证子进程退出时，保留 running/unverifiable 并拒绝再次启动；需先核实遗留进程和源码状态，由人工接管，不能删回执绕过三轮限制。真实一次性冲突演练已验证失败后第二轮恢复，保留 fork 与 upstream 两侧修改、HEAD 不变；这不代替复杂官方合并的语义复核。

源码需已提交且工作树干净。运行环境需要本项目的 Node/pnpm 和 macOS 构建工具；发布目录的父目录必须已存在，发布目录必须是全新路径。发布目录、目标应用和 profile 不能互相包含。建议在仓库之外的持久目录保存交付记录，不使用可清理的 `.context` 作为日常发布存储。

```sh
pnpm deliver:orca34:local start "/absolute/releases/new-delivery" "/absolute/installed/Orca 34.app" "/absolute/user-data"
```

必须显式指定真实 userData 路径；不能把需求目录或 Git 仓库目录当作 profile。入口固定当前源码 SHA，然后：

1. 在新建的 build-* 目录构建独立身份的安装包。
2. 校验精确源码、架构、签名及 manifest。
3. 取得维护许可，检查目标应用和 profile 没有写入者，校验旧包，备份旧包和 profile。
4. 持久记录安装事务位置，再执行可恢复的应用替换。
5. 启动隐藏诊断页面，核验应用身份、配置及原有需求，保存健康回执。

活跃终端、Agent 或无法确认的占用会阻止安装；工具不会替你强制停止它们。健康诊断不恢复工作区终端，不替代普通界面及 Agent 的操作验收。所有阶段通过才返回 `healthy`。

## 中断和失败

```sh
pnpm deliver:orca34:local status "/absolute/releases/new-delivery"
pnpm deliver:orca34:local resume "/absolute/releases/new-delivery"
```

恢复构建必须在记录的源码目录和原 SHA 上运行。中断的 build-* 目录保留，重新构建使用全新目录。准备完成后，从 delivery.json 中记录的同一安装事务继续，不重复替换已经安装的包。健康检查失败时保留 installed 阶段；resume 只重新检查健康，不重建、不再次备份。

若备份已完成但交付回执尚未落盘就退出，可能留下一个尚未开始替换的额外安装事务；保留它供诊断。回执使用独立的 `.pending-<随机标识>` 临时文件，写入并同步后才原子替换正式文件。中断遗留的临时文件（包括旧版 `.pending`）保留供诊断，不作为已完成阶段；重试取得现有维护许可后读取正式回执，并重新校验磁盘状态。不要手动将临时文件改名为正式回执。正式回执缺失、损坏或磁盘校验失败仍会停止，不能视为自动恢复成功。

## 显式回退

读取 delivery.json 的 `transaction` 字段，先关闭这个测试实例及其终端。健康启动可能写入 profile，因此使用配套数据回退：

```sh
pnpm install:orca34:local rollback-with-profile "/absolute/installation-transaction"
```

回退先保存升级后数据，再恢复配套旧 profile 和旧包；不会修改需求根目录、成员工作树或其 Git 分支。已产生的新工作不会被自动抛弃，升级后 profile 副本保留在事务记录的 profileRecoveryDirectory 中。回退中断可再次执行同一命令；恢复屏障会阻止普通应用在数据只恢复一半时启动。

`rollback-unstarted` 仅适用于 profile 尚未改变的安装；发现变化时拒绝继续。回退过的事务不能重新作为健康交付恢复；应建立新的交付目录。

## 已验证与未验证

旧源码 966a0f556fc3 → 候选 1bf574717afa → 旧源码的隔离真实双仓往返通过，需求、分支、HEAD、未提交文件和笔记保留。详细证据见 [开发执行记录](fork-orca34-delivery-goal.md)。统一入口复用已演练的底层构建和安装流程，并有阶段恢复测试；尚未以新统一命令从头执行完整构建。日常安装未替换，完整 computer use 验收、官方版本集成和自动调度仍待完成。

### 固定官方同步的两个基线

`pnpm plan:orca34:sync <持久状态目录>` 生成 `sync/<官方标签>/plan.json`。它固定官方 release 的提交及 fork `main`、`34/local` 的起始提交，生成两条临时分支名称；local 阶段明确等待 main 的已验证结果，不能直接拿移动中的 main 当输入。首次保存前重新读取版本与两个分支，变化或网络失败则不生成计划。重复运行复用原始计划，不因 main 已推进而改写 local 的起点；损坏的记录拒绝覆盖。

该入口目前只固定同步输入，不创建分支、合并或发布。后续执行器必须从这些提交准备临时分支、核验结果并分别记录两条发布线的推进状态。正式状态目录应放在可长期保留的位置，不使用仓库内可清理的 `.context`。

### 准备临时同步分支

`prepare:orca34:sync <状态目录> <官方标签> main` 从计划中的 main 起点建立临时分支，执行 `git merge --no-commit --no-ff`。local 阶段使用 `prepare:orca34:sync <状态目录> <官方标签> local <main候选PR号> <main候选完整SHA>`，先核验 main 候选精确提交的完整 PR 门禁及基线，再验证其包含计划中的官方提交。

当前工作目录必须是待合并的干净源码，HEAD 等于计划基线，目标 Git 对象已存在，状态目录必须在源码外。若该基线尚不含这些工具，可从工具开发目录用 Node 的绝对脚本路径调用，源码工作目录仍保持在待合并 checkout；不要复制工具文件污染基线。该入口不会 fetch、提交、推送、推进长期分支或安装。

回执为 `sync/<标签>/main.json` 或 `local.json`。`conflicted` 保留 Git 冲突，已有有限修复入口可使用回执的 base/target；`prepared` 表示待验证、提交，不能当作可发布；`already-integrated` 表示目标已经是基线祖先。重复读取 prepared/conflicted 会核验分支和 MERGE_HEAD，不重复合并。若中断在 switching/merging，子进程结果无法核实时拒绝重做，必须先检查原进程与 checkout；自动恢复这类不确定结果仍待接入。

### 验证并提交合并候选

`commit:orca34:sync <状态目录> <官方标签> <main|local>` 消费 prepared 回执。它要求当前分支、HEAD 和 MERGE_HEAD 与准备记录一致，没有冲突、未暂存改动或未跟踪文件；固定 Git tree 后运行暂存差异检查、`pnpm tc` 和针对原始基线的增量质量检查。每个检查后再次核对分支、合并身份和 tree，变化就停止。

成功后只在临时分支创建本地双父合并提交，核验父提交顺序、tree 和本次操作标识，并写入 `<阶段>-commit.json`。再次执行核验同一提交而不重复提交。已知失败可修正暂存内容后重试，最多三轮；每轮检查日志使用独立操作 ID 保留。检查或提交子进程退出无法核实时停止，不根据残留回执盲目再提交。本入口不 push、不创建 PR、不合并长期分支，完整远端 CI 仍是后续必需门禁。

### 推送候选并创建 PR

`publish:orca34:sync <状态目录> <官方标签> <main|local> <PR描述文件>` 只接受已有 committed 回执；不会替代提交步骤。PR 描述按仓库模板准备，至少包含 ELI5、What Changed、Why、Testing。使用固定 `git@github.com:34/orca.git` 远端和计划中的临时分支；SSH 推送权限与 gh 的 PR 创建权限都需可用。

发布前后核验本地提交、干净工作区、远端基线和候选身份。只推送该提交到专属临时分支，不强推；远端已有不同提交时停止。按 head/base 查询已有 PR，只有唯一且身份相符的开放 PR 才可复用；重复执行不重复推送或建 PR。保存 `<阶段>-publication.json`，固定描述、提交、PR 号及 URL。创建 PR 会触发仓库检查，但 published 只代表 PR 已创建，不能当作完整 CI 已通过或允许合并。

若中断在 pushing/creating 或结果无法核实，回执阻止再次写入。此时先核验原子进程和远端状态，不删除回执强行重跑；自动核实恢复仍待编排器接入。基线变化、候选被改动、PR 关闭/合并都不会重新发布或自动覆盖。入口不推进长期分支，不发布安装包或安装应用。

### 推进一个同步阶段

`advance:orca34:sync <状态目录> <官方标签> <main|local> <PR描述文件> [main候选PR号 main候选SHA]` 在当前源码工作目录串联准备、有限冲突修复、验证提交、推送/PR 和精确提交的完整门禁核验。先用 plan 入口固定版本及基线，源码须符合 prepare 的干净基线/目标对象要求。local 阶段必须提供已核验 main 候选的 PR 与 SHA。

执行器锁覆盖整个推进过程，内部仍沿用各阶段回执和互斥。已有 committed 候选不重新合并或提交；等待 CI 时重新执行只复核现有提交、PR 和检查。冲突修复沿用原来的三次总预算，重新触发不会清零。失败信息写入 `<阶段>-run.json` 的 notice，修复或门禁成功后清除。ready 只表示当前 PR 完整门禁已通过，后续仍需候选构建和安装验收；不会自动合并、构建安装包或替换日常安装。

下游回执中的未知子进程/未知写入仍会阻止重复推进，执行器不会重置它们。调度、通知投递、源码获取、main/local 两阶段统一推进及未知进程核实恢复尚待接入；当前命令不能当作长期无人值守自动升级已经启用。

### local 检查通过后准备候选

`advance:orca34:sync` 的 main 阶段在完整检查通过后返回 `ready`；local 阶段接着复用候选构建入口，绑定同一源码目录、PR 和完整 SHA。构建与签名校验、检查复核通过后返回 `candidate-ready`，回执保存候选路径。构建失败可重试同一推进命令，不重复合并和提交；检查变为等待时移除推进回执的候选指针。已完成构建由候选回执去重、重新核验。源码目录显式传递给版本读取与全部构建子进程，不改变调用进程的 cwd。

此步骤保存本地包，不合并 PR、不安装、不创建公开 Release。其他平台仍在构建入口明确报告当前候选仅支持 macOS arm64；不会跳过平台校验。

### 长期分支合并入口（当前未启用）

```sh
pnpm merge:orca34:sync "/absolute/releases/upstream-state" v1.4.232 main
```

默认只核对已发布候选的固定身份和完整门禁，保存 `ready` 或 `waiting`，不会合并。未来生产启用经过确认后，才可给同一命令增加 `--apply`：它重新核对 PR head/base，然后调用 `gh pr merge --merge --match-head-commit`，不使用 auto/admin，不删除候选分支。main/local 各自保存 `<stage>-merge.json`；源码推进记录与候选、安装记录分开。

成功必须读取实际 PR 的 merged 状态和 merge commit，核对双父提交恰为计划基线与候选 head；重复触发只核实同一结果，不再次写入。响应丢失但服务端已合并时可只读恢复为 `merged`；请求仍未能确认时保留 `unverifiable`，停止重新提交。GitHub 不提供该命令的 base 比较交换保证：提交请求期间若基线变化，合并后的父提交检查会阻止下游继续，但不能撤销已经发生的远端合并，必须人工核实。长期分支也应使用仓库保护限制其他写入者。

当前仅开发并以受控远端结果验证该入口；没有对真实 PR 执行 `--apply`，也没有启用调度器调用它。

### 自动流程的专用源码目录

固定计划后可分别准备两份检出：

```sh
pnpm checkout:orca34:sync "/absolute/releases/upstream-state" v1.4.232 main
pnpm checkout:orca34:sync "/absolute/releases/upstream-state" v1.4.232 local
```

入口在发布目录的 `sources/<tag>/` 下新建随机目录，先写 `<stage>-checkout.json` 再初始化 Git。只获取 34/orca 的指定长期分支与 stablyai/orca 的指定 release tag，核对解析 SHA 与计划完全一致，检出固定基线。main/local 不共享工作树；不会在当前开发目录切分支。

重复执行 prepared 回执只核对目录归属和固定对象存在，不重置源码或覆盖后续冲突修复。目录缺失、重定向、远端身份变化、未确认子进程或中断都保留现场并停止；不能删除回执来绕过核实。此入口只准备 Git 源码，尚不安装依赖、运行合并或构建；后续统一推进需在回执的 source 内运行对应步骤。

专用检出首次没有 node_modules。提交验证及冲突修复后的验证现先运行 `pnpm install --frozen-lockfile --reporter=append-only`，再运行类型与质量检查，复用本仓库 postinstall 的包构建/原生依赖准备。锁文件不匹配或安装失败阻止提交，不自动重写锁文件；需要修复时按原有有限次数规则处理。安装使用该源码目录并设置后台启动及跳过开发 CLI 安装。提交入口仍在每个步骤后核对暂存 tree、分支、合并双方和未跟踪文件，安装脚本改变源码不会被悄悄提交。修复 Agent 可在解决包冲突后使用同样命令准备定向测试，应用安装和发布仍禁止。

### 从发现到本机候选的统一推进

```sh
pnpm advance:orca34:release "/absolute/releases/upstream-state"
```

此入口会创建/复用候选分支和 PR，因此需要已有 fork 推送权限。它串联官方发现与固定计划、main 专用检出、main 合并/修复/提交/PR、完整 CI、local 专用检出及对应步骤，最后复用候选构建。PR 描述包含固定 release tag/SHA 和验证边界。整个调用互斥，`release-run.json` 保存 main/local 结果、当前阶段与失败说明；各阶段的原回执继续负责去重和身份校验。CI 尚未通过则返回 waiting-main/waiting-local，后续运行相同命令继续。

main 候选通过后，只将其固定提交从持有回执的 main 检出获取到 local，不切换或重写 main 源码。获取中断且退出未核实时停止重试，保留 unverifiable。local 失败保留 main 结果；重复执行不会重新创建提交或重复构建已核验候选。main 已包含官方内容但没有可引用的完整 PR 证据时，报告 main-evidence-required，不能假定验证成功。

这是候选模式入口：不会调用合并入口、安装应用或公开 Release。已配置暂停的候选巡检任务（见下文），尚未实际定时运行；已合并阶段依据下文的合并回执与历史检查恢复。首次启用前必须先确立定制功能的长期分支基线，否则候选只包含当前长期分支上的内容。

### 通知读取与送达确认

```sh
pnpm notice:orca34:release "/absolute/releases/upstream-state"
# 仅在通知已成功展示给用户后确认返回的 sequence：
pnpm notice:orca34:release "/absolute/releases/upstream-state" --ack 1
```

统一推进的 `notification` 复用候选通知的递增序号规则，记录失败、检查阻塞、需要补证和候选就绪。同一阶段/提交/消息重复执行不新增序号，正在运行或没有待处理结果时旧通知不再 active。读取返回 pending，不改变送达状态；确认命令在同一自动流程锁下核对当前序号与 active 状态，再写 notice-delivery.json。过期确认不能吞掉新事件，损坏或倒退的序号不能当成已送达。

调度器应只在 pending=true 时展示通知，成功展示后确认。若展示成功但确认前崩溃，下次可能重复展示一次；不会为了“恰好一次”提前确认而丢失失败消息。当前命令只管理持久记录；候选巡检任务负责在本聊天展示，再确认序号，不发送邮件或外部聊天消息。

### 已合并阶段的恢复

已有 `<stage>-merge.json` 时，推进器先只读核实真实合并结果，不向关闭的 PR 再次推送/创建。它要求原合并前完整 admission 回执，包括 required checks；再检查同一候选 head 最新的完整 PR workflow。已合并 PR 的实际 merge commit 与 CI 的测试 merge commit 可以因元数据而 SHA 不同，但必须具有相同的固定双父提交和完全相同的文件 tree。缺失历史对象、CI 重跑未完成/失败、父提交或 tree 不同均停止推进。

main 已合并而 local 未完成时，local 准备使用上述历史证据；local 已合并时，候选重验/构建也使用它。普通未合并 PR 仍要求保持 open，并继续原有合并策略检查。此恢复不授予新的合并权限，也不会撤销公共分支；没有原合并前门禁回执的外部合并仍需人工核实。

### 复用已经核验的候选

```sh
pnpm deliver:orca34:local candidate "/absolute/releases/new-delivery" "/absolute/candidate/Orca 34.app" "<full-source-sha>" "/absolute/isolated/Orca 34.app" "/absolute/isolated-profile"
```

该模式先核验候选签名、身份、架构和指定 SHA，再创建 built 阶段的交付回执；不从当前 cwd 构建。候选、交付目录、目标安装和 profile 必须互不包含，候选路径必须保持有效。随后复用原 prepare/resume/health 流程及维护许可，保留原有活跃会话保护。恢复仍用 `resume <delivery-directory>`；健康检查失败只重试健康检查，不重新构建或备份。候选模式回执禁止转入 created/building，避免中断后误建另一个版本。

命令本身不代表 CI 已通过。自动流程须先完成候选门禁并使用其固定 candidate/commit；目标和 profile 仍须明确选择，当前仅用于隔离验收。

### 已核验候选的自动合并与安装入口

```sh
pnpm apply:orca34:release "/absolute/releases/upstream-state" "/absolute/installed/Orca 34.app" "/absolute/profile"
```

**这是有实际写入的入口，当前未启用，也未对公共 PR 或日常安装执行。** 它读取 candidate-ready 回执，固定两侧 PR/head、候选及安装目标，先核验候选，再同时检查 main/local 门禁，然后依次合并 main、local。每次合并重新检查精确 head 与完整 CI；已合并阶段必须补验历史 workflow 及文件 tree，不能把“已合并”当成“已验证”。两侧完成后才采用已有候选进入安装、备份与健康检查。

`sync/<tag>/application.json` 保存分支推进、安装和错误阶段。部分合并失败不会回退公共分支；相同输入再次运行会从实际远端状态确认结果。安装复用 `delivery-<tag>` 的回执，中断后 resume，不再创建第二份交付。候选、目标、profile 或 PR/head 改变均拒绝复用；活动会话保护继续由原安装流程执行，不强制关闭用户任务。未知合并结果仍停止自动重试，须先只读确认。

定向测试覆盖检查等待、main 已合并而 local 失败、历史 CI 失效、候选身份错误、安装中断和重复运行。GitHub 合并在测试中使用受控响应；真实本地候选安装/回退另有隔离演练。由于用户明确要求不合并 PR，目前没有把真实公共合并作为已通过项。

### 候选巡检调度配置

已在 Codex 创建线程巡检 **Orca 34 官方版本候选巡检**（ID `orca-34`），每 6 小时一次，状态 **PAUSED**。持久状态目录配置为 `/Users/wzh/Library/Application Support/Orca34Release/upstream-state`，不使用可清理的 `.context`。任务读取本说明并复用 advance/notice 入口；只在实质变化、完成、失败或需要处理时通知，无变化保持安静。

首次启用必须先完成独立验收并建立已验收定制功能的长期分支基线；当前 main/34/local 尚不包含本轮全部功能。暂停配置已保存，但尚未验证一次真实调度触发。任务仅生成候选 PR/本机包，明确禁止调用 apply 入口、合并 PR、公开 Release 或替换日常安装。合并/安装自动化能力与是否启用是两件事；启用生产写入须按当前授权边界另作决定。
