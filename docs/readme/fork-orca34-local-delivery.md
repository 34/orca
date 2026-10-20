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
