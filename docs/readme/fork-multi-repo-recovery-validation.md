# 多仓库任务恢复验收矩阵

本表区分真实强退、磁盘状态还原和模块测试，避免把其中一种证据扩大为完整 P2/P3 验收。
截至 2026-10-17，完整关键阶段强退矩阵尚未完成。证据不足时保留文件并停止，是批准设计
规定的结果；不能为了让任务显示 ready 而猜测复制完整、setup 已退出或 Agent 从未启动。

## 当前证据

| 中断位置                                                 | 应有结果                                                | 当前证据                                           | 真实强退状态                                 |
| -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| 根 mkdir 后、marker 前                                   | 不接管无所有权证据的已有目录，不覆盖文件                | 本页“根文件生成强退”                               | **通过保守拒绝**                             |
| marker 后、TASK.md 前                                    | 只补写确认属于任务且缺失的生成文件                      | 本页“根文件生成强退”                               | **通过**                                     |
| Git add 后、metadata/journal 回执前                      | 依据固定计划、预分配实例和真实 Git 身份登记，不再次 add | 本页“Git 创建回执前强退”                           | **登记恢复通过；准备未知时停止**             |
| 文件准备部分完成、无完成回执                             | 停止，不把已存在的半复制目录当完整结果                  | 本页“文件准备部分复制后强退”                       | **通过保守拒绝**                             |
| setup 明确 skip 或已保存 setupNotStarted，最终创建回复前 | 核验身份后 ready/skipped，不启动 setup                  | skip/no-setup-receipt 的隐藏 Electron 状态还原验收 | 状态还原通过，未在指令间隙强退               |
| setup 正在运行，主进程丢失、daemon 保留                  | 观察原执行；实例/handle/token/运行次数不变              | 本页“主进程强退”                                   | **通过**                                     |
| setup 正在运行，主进程与 daemon 均丢失                   | 不推断成功，不自动或显式重跑未知执行                    | 本页“双进程丢失”                                   | **通过保守拒绝**                             |
| 根 Agent 已启动、启动回复丢失                            | 复用 operationId，不能重复发送任务                      | 根 Agent 模块测试和既有启动机制                    | 专门的实际强退验收未完成                     |
| 成员删除中、尚未确认完成                                 | 不自动续删，核验后由用户重新确认                        | 本页“删除中断与持久化回执”                         | **Git remove 前后两个边界通过**              |
| 根生成文件清理/入口删除中                                | 保留用户文件，依据持久化目录身份恢复                    | 本页“删除中断与持久化回执”                         | **TASK.md 删除后边界通过；入口删除窗口待验** |

模块测试位于 `src/main/multi-repo-workspaces/`。实际状态还原的证据和限制见
[执行记录](fork-multi-repo-workspaces-goal.md)，不能因本表列出某文件就视为全量验收通过。

## 根文件生成强退

在隔离 Electron 主进程中，临时拦截 `fs/promises.writeFile` 的一个精确目标路径，
写出独立 checkpoint 后挂起该次调用。确认该 PID、目标路径、磁盘文件和 durable
journal=creating/planned，再 SIGKILL 主进程。仅测试进程的函数被替换，产品源码没有
测试开关；重启是未插桩的新进程，journal 在整个测试中没有被改写。

| 边界                                | 实际结果                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.orca-multi-repo.json` 写入前      | PID 51914 以 SIGKILL 退出；恢复 needs-attention/planned，不生成 marker、TASK.md 或成员目录，崩溃后加入的 KEEP.txt 完整保留     |
| `TASK.md` 写入前，marker 已完整写入 | PID 61390 以 SIGKILL 退出；原 marker 字节不变，补写 TASK.md 后在计划分支 probe/root-crash 创建成员，恢复 created/ready/skipped |
| marker 仅写入前 40 个字符           | PID 63534 以 SIGKILL 退出；恢复 needs-attention/planned，部分 marker 与 KEEP.txt 原样保留，不补写 TASK.md 或创建成员           |

第二种情况首轮混入了“源仓库刚登记但尚未落盘”的窗口：根恢复正常，成员因
repo_not_found 停止。这一失败保留为 `multi-repo-root-crash-before-task-unflushed-source.log`。
复验先只读核对独立 profile SQLite 的 projects/repos 中已有源仓库，再创建任务；没有
通过延长固定 sleep 或修改失败 journal 掩盖问题。

证据位于 `.context/multi-repo-root-crash-{before-marker,before-task,partial-marker}-recovered.json`，
包含 checkpoint、退出信号、强退前后相等的 journal 和最终任务；对应 `*-ui.log` 均 exit 0，
`*-runtime.json` 记录窗口 invisible/unfocused。使用独立 HOME/profile/mock-keychain，
每次测试主进程、daemon 和专用 crashpad 已退出。此测试不覆盖突然断电或文件系统
写缓存丢失，也不覆盖下一步 Git add 的中断。

## Git 创建回执前强退

仅在隔离测试主进程拦截 ChildProcess 的 close 事件，匹配精确目标路径的
`git worktree add` 且 exitCode=0 后留下 checkpoint，阻止该成功回执交给创建流程。
确认真实 Git worktree 已存在、journal=creating 且没有最终 instanceId，再 SIGKILL。
重启不插桩、不改写 journal。首次替换 spawn 函数未命中已缓存的调用，不计为强退证据。

首次命中暴露根入口写入顺序问题：journal 已确认 registered，但 profile 数据库尚未
写入根 Folder Workspace。重启误报入口被删除；失败日志保存在
`.context/multi-repo-git-crash-before-fix.log`。已在源仓计划、任务分组、根入口及显式恢复
的确认点等待已有 profile 持久化机制，不改变手动删除后不自动复活的约束。

修复后主进程 PID 7591 以 SIGKILL 退出，根入口在重启后保留；原 Git 列表、成员 .git、
marker 和崩溃后新增 KEEP.txt 均不变，setup/Agent pending，没有第二次 worktree add。
但普通工作树扫描先为该目录建立了其他 instanceId，任务恢复因实例不符而停止于
needs-attention。**文件保护通过，原实例登记恢复未通过**；后续必须处理扫描与恢复的
先后关系，不能直接覆盖其他实例来使测试变绿。

证据 `.context/multi-repo-git-crash-git-add-{recovered,runtime}.json` 和
`multi-repo-git-crash-ui.log`（保守停止断言 exit 0）。窗口 invisible/unfocused，独立
HOME/profile/mock-keychain；临时主进程、daemon 和强退遗留的专用 crashpad 已清理。

后续修复让 Runtime 和 renderer 发现流程在有精确未完成任务意图、且没有现存
metadata 时暂缓补写实例 ID；行仍可列出。已有实例不会覆盖，SSH/WSL 不走此判断。
正式登记仍经过原有 marker、Git common-dir、分支、起始 commit 和 revision 校验。

新任务实际主进程 PID 51796 SIGKILL 后，恢复 registered/pending，instanceId 与
plannedInstanceId 均为 a68db708-ca78-4182-a615-ff6a6a5863e1。journal 强退前后相等，
Git 列表、.git、marker 和 KEEP.txt 未改变。文件准备没有完成回执，因而保持待核对，
setup 与根 Agent 没有启动；此边界的登记恢复通过，不代表文件准备可以自动重放。
证据 `.context/multi-repo-git-registration-recovery-git-add-{recovered,runtime}.json`、
`multi-repo-git-registration-recovery-ui.log`（exit 0）。测试主进程及专用 daemon 已退出。

## 文件准备部分复制后强退

临时仓库提交 `.gitignore` 和 `.worktreeinclude`，声明复制含两个文件的 ignored
prepared/ 目录。仅在测试主进程中匹配这一目标目录的 `/bin/cp`，将该次复制源缩小为
first.txt；真实 cp 写入第一个文件后，截住成功 close 回执并写 checkpoint，再 SIGKILL
主进程。第二个源文件一直存在，目标中始终缺失。这是受控部分复制状态加真实主进程
强退，未测试内核复制单个文件中途断电，也没有改写任务 journal 或添加产品 failpoint。

第一次 PID 62131 通过保留验证；扩展重复操作的第二次 PID 65544 也以 SIGKILL 退出。
重启后恢复 instance ed054709-a4b0-4a60-8b81-8d504bcebfa2，与计划相同；状态为
registered/pending，没有 preparation 完成回执。连续两次 continue 的成员结果相同，
显式 skipSetup、retrySetup 都因缺少文件准备证明而拒绝。setup 和根 Agent 未启动。

已复制 first.txt、崩溃后写入 KEEP.txt、Git worktree 列表、.git 和根 marker 原样保留；
没有生成 second.txt，也没有把部分目录当作完成。证据在
`.context/multi-repo-preparation-crash-partial-copy-{recovered,runtime}.json`，包含 checkpoint
的原始/实际 cp argv、相等的强退前后 journal、两次恢复及拒绝结果；对应 ui.log exit 0。
第一次结果以 partial-copy-first 前缀保留。独立 HOME/profile/mock-keychain，窗口保持
invisible/unfocused；两轮临时应用、daemon 和专用 crashpad 均已退出。

## 主进程强退

临时 setup 脚本追加一行 `original` 到 run-count.txt，然后等待 release-setup 文件。
观察到任务 journal 的 registered/running 后，对本次启动的 Electron 主进程发 SIGKILL；
确认 journal 没有被改写，原 daemon 仍在。重启同一隔离 profile，放行原脚本并继续任务。

首次测试暴露了一次性 provider 快照漏掉晚到完成标记的问题，任务安全地保存 timeout，
但未能恢复成功。`f09c7f247a` 修复为有界、无重叠的快照轮询。

复验结果：主进程 PID 18644 的退出信号是 SIGKILL，daemon PID 18711 前后相同；
成员 instance 2905bccf-7a79-48c7-9443-1417122e340a、
终端 term_c4833e6e-9244-4fa6-9999-40f0eaa9be44 不变，恢复 ready/succeeded/exit 0，
run-count.txt 只有一行，根 Agent pending。

证据位于 `.context/`：

- `multi-repo-setup-crash-before-fix.log`、`multi-repo-setup-crash-before-fix-task.json`：原失败。
- `multi-repo-setup-crash-recovered.json`：强退前后 journal、进程退出信号、恢复记录和次数。
- `multi-repo-setup-crash-runtime.json`、`multi-repo-setup-crash-hidden.png`：隐藏 renderer。
- `multi-repo-setup-crash-ui.log`：修复后实际执行成功，包装进程 exit 0。

## 双进程丢失

同样等待 setup 写入一次标记并进入 registered/running，再 SIGKILL 本次 Electron 主进程
和从该独立 profile pid 文件核验的 daemon；确认 daemon PID 已不存在后才重启。
整个过程不修改任务 journal。放行文件只允许原脚本结束，不能证明其退出码可被恢复。

主进程 PID 38086 以 SIGKILL 退出，旧 daemon PID 38165 已消失，重启 daemon PID 38674。
恢复记录仍是 registered/failed，错误 terminal_handle_stale，没有 setupExitCode。
同一 instance 65fa9d62-b4db-4156-a56f-f313c3abbebb 和
term_9e84b349-0acb-48d7-b6f9-da17b7f19ac0 保留；run-count.txt 仍只有一行，根 Agent pending。
显式 retrySetup 也因 terminal_handle_stale 拒绝，没有创建新 setup 或覆盖原文件。

这证明“丢失完成证据不会触发重放”，不证明被终止 daemon 的所有子进程已物理退出，
也不把新的 daemon 或可读文件当作原 setup 成功证据。当前限制是这类任务需要人工核对，
不能通过反复点击继续把未知状态变成已就绪。

证据：`.context/multi-repo-setup-daemon-loss-{live-result,recovered,runtime}.json`、
`multi-repo-setup-daemon-loss-ui.log`（exit 0）及隐藏截图。测试全程使用独立 HOME/profile、
mock-keychain，窗口 invisible/unfocused。测试主进程、daemon 与该 profile 的 crashpad
helper 已结束，未接触正式应用、其他任务或既有 9567 开发实例。

## 删除中断与持久化回执

使用独立临时仓库和正常完成的任务，分别在三个位置强退；没有修改 journal。

| 边界                                     | 结果                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git remove 执行前，journal 已写 removing | PID 74045 SIGKILL；重启保持目录，continue 标记 needs-attention。新增 KEEP.txt 阻止显式清理；移到任务外保存，再次确认后 removed，分支仍指向原 commit                       |
| Git remove exit 0，完成 close 回执被截住 | PID 77882 SIGKILL；重启目录仍缺失、不复活成员，continue 标记 needs-attention；重新确认后完成残余登记清理，根 KEEP.txt 和分支保留                                          |
| TASK.md unlink 已完成、marker 尚在       | 修复后 PID 98579 SIGKILL；原 cleanupIdentity 的 device/inode 保留，重启不续删；根 KEEP.txt 阻止清理且 marker 保留，移出保存后再次确认，根目录及入口删除完成、成员分支保留 |

前两种测试仅拦截精确目标的 ChildProcess spawn/close；第三种仅截住精确 TASK.md
的 unlink 回执。检查了 checkpoint PID、SIGKILL 退出和强退前后相等的 journal。

第三种首轮失败：成员已被 journal 确认 removed，但 profile 的 metadata 删除未持久化，
重启旧 metadata 重现，根清理报 Member removal is not verified。失败日志保留于
`.context/multi-repo-root-removal-crash-before-fix.log`。修复在成员删除与根入口删除确认前
等待既有 profile 持久化，写盘失败保持待处理；不把文件不存在直接当登记已删除。

证据 `.context/multi-repo-removal-crash-{before-git-remove,after-git-remove}-recovered.json`、
`multi-repo-root-removal-crash-after-task-unlink-recovered.json` 及对应 runtime、ui.log。
三个成功日志 exit 0，独立 HOME/profile/mock-keychain，窗口 invisible/unfocused，
临时主进程、daemon 和专用 crashpad 已退出。此处没有运行根 Agent，也不覆盖根目录
已经 rmdir、Folder Workspace 删除回执尚未确认的窗口。

## 剩余验收顺序

1. 继续验证 Agent 启动回执、确定跳过 setup 的最终回执以及根入口删除后的实际中断。
2. 验证实际运行的根会话/成员服务与清理门禁；Git remove 前后及根文件清理中断已有上述证据。
3. 在最新候选包复跑普通 profile、实际权限和已有任务打开/安全清理，再完成安装回退。

P5 当前无后续稳定 tag，按批准的例外交付了
[同步与切回官方步骤](fork-orca34-upstream-sync.md)，不等待未来发布，也不宣称已有升级成功。
