# 多仓库任务恢复验收矩阵

本表区分真实强退、磁盘状态还原和模块测试，避免把其中一种证据扩大为完整 P2/P3 验收。
截至 2026-10-17，完整关键阶段强退矩阵尚未完成。证据不足时保留文件并停止，是批准设计
规定的结果；不能为了让任务显示 ready 而猜测复制完整、setup 已退出或 Agent 从未启动。

## 当前证据

| 中断位置                                                 | 应有结果                                                | 当前证据                                                              | 真实强退状态                   |
| -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| 根 mkdir 后、marker 前                                   | 不接管无所有权证据的已有目录，不覆盖文件                | 本页“根文件生成强退”                                                  | **通过保守拒绝**               |
| marker 后、TASK.md 前                                    | 只补写确认属于任务且缺失的生成文件                      | 本页“根文件生成强退”                                                  | **通过**                       |
| Git add 后、metadata/journal 回执前                      | 依据固定计划、预分配实例和真实 Git 身份登记，不再次 add | service、member-registration、lineage recovery 测试及早期实际恢复记录 | 尚不能由这些证据证明强退通过   |
| 文件准备部分完成、无完成回执                             | 停止，不把已存在的半复制目录当完整结果                  | recordMultiRepoPreparation 校验；recovery 保守保留                    | 未覆盖                         |
| setup 明确 skip 或已保存 setupNotStarted，最终创建回复前 | 核验身份后 ready/skipped，不启动 setup                  | skip/no-setup-receipt 的隐藏 Electron 状态还原验收                    | 状态还原通过，未在指令间隙强退 |
| setup 正在运行，主进程丢失、daemon 保留                  | 观察原执行；实例/handle/token/运行次数不变              | 本页“主进程强退”                                                      | **通过**                       |
| setup 正在运行，主进程与 daemon 均丢失                   | 不推断成功，不自动或显式重跑未知执行                    | 本页“双进程丢失”                                                      | **通过保守拒绝**               |
| 根 Agent 已启动、启动回复丢失                            | 复用 operationId，不能重复发送任务                      | 根 Agent 模块测试和既有启动机制                                       | 专门的实际强退验收未完成       |
| 成员删除中、尚未确认完成                                 | 不自动续删，核验后由用户重新确认                        | removal/reconciliation 真实 Git 模块测试                              | 未覆盖                         |
| 根生成文件清理/入口删除中                                | 保留用户文件，依据持久化目录身份恢复                    | root-removal 及 removal-preview 测试                                  | 未覆盖                         |

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

## 剩余验收顺序

1. 继续验证 Git/metadata、文件准备、Agent 启动回执的实际中断；根文件生成的三个边界已有上述证据。
2. 验证实际运行的根会话/成员服务与清理门禁、删除中断后的显式恢复。
3. 在最新候选包复跑普通 profile、实际权限和已有任务打开/安全清理，再完成安装回退。

P5 当前无后续稳定 tag，按批准的例外交付了
[同步与切回官方步骤](fork-orca34-upstream-sync.md)，不等待未来发布，也不宣称已有升级成功。
