# Orca 34 下一阶段执行目标

2026-10-20 用户批准[开发计划](fork-orca34-next-development-plan.md)，要求创建新目标持续实施，并增加最终 computer use Agent 验收。此前多仓核心目标按已有构建、安装回退、有限同步说明和原生验收证据关闭；本目标不把新增能力当作已完成。

## 交付清单

- [ ] A：可靠本地构建、安装、升级、健康检查、回退及中断恢复。
- [ ] B：官方稳定版本首次实际集成、冲突修复与精确提交完整 CI。
- [ ] C：版本发现、去重、互斥、阶段回执、有限修复及通知；调度与生产启用分开。
- [ ] D：Cursor 多仓实际接入；工作区 Agent、Skills 与插件有效配置。
- [ ] E：常用仓库组合、默认 Agent、明确的失败恢复入口及附件补验。
- [ ] F：独立 computer use Agent 最终验收，问题修复后再次操作验证。

## 最终验收要求

开发完成并产生固定源码候选后，委派独立验收 Agent。提供操作场景与预期，不预填通过结论。验收对象必须是该候选，记录版本、源码 SHA、profile 与实际应用路径。

验收覆盖：默认多仓创建、搜索/改名/归档、仓库增删与脏文件保护、Cursor 根会话与多仓编辑、默认 Agent/规则/Skills/插件实际生效、文件图片上传粘贴、重启后配置保留、升级后原任务与用户文件保留、可见失败及恢复入口。

升级、回退、中断和 dirty 文件使用隔离数据；不得以通过新建流程替代旧数据升级验证。原生操作保留截图、动作与结果；可由只读磁盘断言辅助核对。遇到缺失账号、平台或系统授权时精确记录未覆盖项，不能将 mock 当成实机通过。常规 UI 回归仍使用后台 CDP；可见原生验收按用户授权范围执行。

功能测试、完整精确提交 CI、候选打包校验、升级回退和独立原生验收全部满足后，才能关闭本目标。公开发布、长期自动合并及日常 profile 替换遵循批准计划中的启用边界，不因开发任务存在而提前执行。

## 执行记录

### 2026-10-20：目标建立与实现入口核查

新目标已激活。复核现有构建脚本、打包身份校验、构建测试及 macOS daemon/TCC 约束：复用已有构建入口；当前没有可直接复用的 Orca 34 本地安装事务工具。第一步实现候选身份校验与安装事务，保留现有 daemon 生命周期所有权，不凭 PID 文件或窗口消失判断已停止。

已识别需要一起更新的接入面：构建清单生成、安装入口与状态持久化、平台校验、相关单元/故障测试、package 命令、安装回退说明；后续再接自动发现与 PR 门禁。固定基线清单须改为明确记录实际上游集成身份，不能继续硬编码旧基线后声称新版本已同步。

### 2026-10-20：安装前候选校验

新增 `config/scripts/verify-orca34-install-candidate.mjs`，在安装文件变更前校验 macOS arm64 宿主、真实 bundle 路径、deep/strict 签名、完整 fork 身份、bundle/清单版本、调用方固定源码 SHA、来源记录及可执行文件实际架构。拒绝官方应用身份、官方数据目录/更新配置和不匹配的源码。ad hoc 签名只证明完整性，不作为下载来源认证。

两项定向测试覆盖身份/来源错误、签名失败、架构不符和平台拒绝；通过。首轮测试的 macOS `/var` 与 `/private/var` 路径差异已按 realpath 语义修正。oxlint 与格式检查通过，Electron native runtime 已恢复。真实已验收候选 `4c5a604a7d1f` 使用此入口校验通过，没有修改或启动安装包。

手动校验入口：`node config/scripts/verify-orca34-install-candidate.mjs <候选.app绝对路径> <预期完整源码SHA>`。仍需接入安装事务、会话/写入者检查、备份、原子替换、健康检查和恢复；此校验本身不等同完成安装能力。

### 2026-10-20：可验证备份与阶段回执

新增安装 snapshot 模块：限制 canonical、互不包含的绝对路径；独占创建备份目录，拒绝覆盖已有备份；复制前后比较源目录和副本的文件摘要、权限与符号链接文本。macOS 使用 ditto 保留 ACL/扩展属性，普通文件内容采用流式 SHA-256；不追踪链接到外部目录，也不静默跳过 socket 等特殊文件。复制完成才写入并 fsync 校验回执，恢复前可重新验证副本；未完成的 pending 回执保留并拒绝覆盖。

安装校验与 snapshot 共 2 文件、6 项定向测试通过；包含备份不可覆盖、源文件后续变化不影响备份、外部链接不展开、路径重叠拒绝、中断回执保护和副本损坏拒绝。oxlint/格式/diff 检查通过，Electron native runtime 已恢复。

这仍是安装事务的基础能力，尚未接通停机互斥、原子替换、健康检查及回退。ACL/扩展属性由 ditto 保留，但本轮没有专门验证它们；当前摘要校验不包含这些属性。没有对日常 profile 执行备份或替换。

### 2026-10-20：安装替换事务与进程占用探测

新增 prepare/publish/rollbackUnstarted 三阶段事务：配对保留旧应用与 profile、预备候选副本、先持久化替换意图再移动目录；应用目标和事务目录同父目录。实际文件与快照必须匹配，目标被重新创建或文件改变时拒绝覆盖。替换两个 rename 后的进程中断均能继续，候选尚未启动时可以恢复原包；profile 有新内容时停止隐式回退，等待显式配对数据恢复。

新增 macOS lsof 占用探测，沿用现有 daemon 副本清理的保守语义：发现 PID 为 live，完整空输出且退出 1 才为 exited，超时/错误/截断/不存在路径均为 unverifiable。恢复期间同时考虑目标包与已移走的原包；不杀进程或清除 endpoint。

4 个定向测试文件共 14 项通过，包括本机真实打开文件→检测 live→关闭→检测 exited；其余覆盖配对备份、正常替换回退、两个 rename 中断恢复、发布前中断回退、写入者拒绝和新 profile 数据保留。静态检查通过。

事务调用方仍必须持有安装互斥并阻止重新启动；lsof 是时点观察，不能代替这个门禁。尚未提供可对日常应用执行的安装 CLI；启动门禁、安装锁、候选健康检查与已启动后的配对数据恢复是接下来必需工作。本轮仅操作测试目录，未实际升级日常应用。

### 2026-10-20：复用维护锁并接通本地命令

复用现有 profile-state maintenance/runtime admission（含 host、boot、进程启动身份核验），新增包路径对应的 Orca 34 安装许可。新打包的 macOS Orca 34 在 profile 恢复预检之前取得运行许可，保留到进程退出；安装方同时持有包维护锁与 profile 维护锁。官方构建、开发模式和其他平台不接此包门禁。锁锚位于当前 HOME 的 `.orca34/installations/<包路径摘要>`，不要求应用父目录可写。

新增 `pnpm install:orca34:local` 入口，支持 prepare/install/resume/rollback-unstarted/status；必须显式提供候选、完整源码 SHA、安装位置与 userData。当前只支持已有独立 Orca 34 的离线升级；核验旧包和新包身份，拒绝替换官方 Orca。profile 备份排除 `.profile-state-access` 临时所有权，其他数据仍核对；不能将维护锁复制到回退数据中。

真实已安装旧包的副本与已验收候选副本完成命令级 install→rollback-unstarted，版本分别为 966a0f556fc3→4c5a604a7d1f→966a0f556fc3，profile 保留文件不变。证据 `.context/orca34-install-cli-rehearsal.json`，目录 `.context/orca34-install-cli-SvN0DL/`。没有启动 app，没有修改真正安装；这不证明新启动门禁的打包运行效果，必须先重建候选再做原生测试。

5 文件 32 项测试通过（含恢复预检、互斥失败释放、不同 profile 共用应用包冲突、快照锁排除与事务恢复）；另有前序浏览器启动顺序回归通过。Node 类型检查及静态检查通过。安装结果明确返回 `health: not-yet-checked`，不能视为可日常升级的完整交付；候选健康启动、启动后数据回退、首次旧版本门禁兼容及完整 UI 验收仍待完成。

### 2026-10-20：重建候选及真实启动门禁验证

已从精确源码 `0361d8e08c929fc546934b05aa4c32c3f9b06ab9` 构建新的 macOS arm64 app-dir 候选，版本 `1.4.214-local.1792486167503.0361d8e08c92.orca34`。包含桌面构建、原生 helper、真实打包 terminal-host PTY 检查；候选校验脚本和 deep strict 签名检查通过。产物位于 `.context/orca34-install-candidate/mac-arm64/Orca 34.app`，未安装或公开发布。

使用独立 HOME/profile，在真实维护锁持有期间启动该包：进程以 1 退出并报告被维护所有者阻止。释放后通过 Playwright Electron/CDP 启动，核对实际版本、HOME、userData、隐藏且未聚焦的窗口，需求列表接口正常返回空列表；已目视检查截图中的首启界面。测试进程正常关闭。证据 `.context/orca34-install-launch-check.json`、`orca34-install-blocked-launch.log`、`orca34-install-launch.png`；构建日志 `orca34-install-candidate-build.log`。

这是启动门禁与新 profile 就绪验证，不是既有任务升级健康检查，也不替代最终独立 computer use Agent 验收。实际安装入口的健康检查回执与启动后 profile 回退尚待接通。

### 2026-10-20：官方同步范围复核

重新查询官方正式 release，仍为 v1.4.232；仅 fetch 该 tag。目标提交 `49109f362f057cd2dc3d81cd378cb84d140c3dc5`，与当前功能分支共同祖先为原基线 `b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。当前分支独有 109 个提交，上游独有 764 个；相对基线的变更路径分别为 282 与 8095，交集 89。路径交集不是实际冲突数，尚未尝试合并。

同步涉及较大上游演进，必须在临时集成分支逐项保留定制契约后运行完整检查，不能只 cherry-pick 发布版本号。明细保存在 `.context/orca34-upstream-v1.4.232-scope.json` 和 `orca34-upstream-v1.4.232-stat.txt`。没有推进 main/34/local 或创建发布。

### 2026-10-20：启动后配对数据回退与持久恢复门禁

新增显式 `rollback-with-profile <transaction-directory>`：先保存升级后 profile 与原始移动文件，再分阶段恢复旧 profile 内容和旧应用；维护所有权目录留在原地，不把运行中的锁移动到备份。恢复副本位于 profile 同一父目录，并绑定应用、profile 和安装事务，避免跨卷 rename 或混用其他事务。未知新文件、修改过的备份或冲突目标均保留并拒绝覆盖。

恢复开始前在既有 maintenance 目录写入持久屏障。旧版 admission 读者也会拒绝该未知条目；安装进程退出后，屏障仍阻止普通读写。恢复工具取得相同应用的独占维护许可，并验证屏障与事务一致，才能续作；完成旧数据和旧包恢复后才解除屏障。不伪造进程所有权、不因 PID 不可达就删除记录。

5 文件 23 项测试通过：包括 5 个文件移动边界的中断续作、升级后数据保留、未知新文件拒绝、错误事务拒绝，以及真实子进程退出 17、未释放两种所有权后的恢复。Node 类型检查与静态检查通过。安装 HOME 的锁锚必须位于将恢复的 profile 外，避免恢复时移动自己的应用锁；后续隔离应用演练需使用 profile 外的测试 HOME。

命令级演练再次使用真实包副本，966a0f556fc3→0361d8e08c92→966a0f556fc3；安装后人为写入迁移后内容及新文件，执行配对回退后旧内容恢复，新文件仍保留在 after-profile 副本。证据 `.context/orca34-profile-rollback-cli-rehearsal.json`，目录 `.context/orca34-profile-rollback-cli-c0utjS/`。本轮没有启动应用；人为数据变化不等于已经完成真实任务的 schema 升降级验收。候选健康检查回执、真实既有任务往返和最终 computer use 仍未完成。

### 2026-10-20：安装健康检查入口

新增 `health <transaction-directory>`：只接受 installed 阶段，启动前后取得维护许可并检查无写入者；后台启动精确候选，核对实际 executable、版本、userData 和隐藏窗口。通过现有 preload 接口读取活动 profile 及需求，并与配套旧备份比较名称、描述、上下文、根/成员计划和成员状态；其他已备份 profile 的需求记录也逐项比对。检查已创建根和 ready 成员目录存在。

健康结果写入独立本地回执，并在重新确认候选和 installed 阶段后更新事务的 health 字段。失败保留记录并返回非零，不以进程存在替代健康通过。实际应用启动会产生正常 profile 写入，因此后续回退使用显式 rollback-with-profile。

身份、窗口和需求保留断言共 3 项定向测试通过；真实已有任务升级演练正在准备，尚不能将本入口记为已通过实际验收。隔离健康启动需要显式一致的测试 profile/HOME 环境，日常模式不使用 mock Keychain。

### 2026-10-20：健康检查隔离会话恢复

真实双仓旧数据演练发现，普通界面会为成员打开 shell，关闭应用仍保留 daemon；因此原先的普通界面健康启动不能当作无副作用的诊断。失败演练保留在 `.context/orca34-task-upgrade-rehearsal.log`，其隔离 daemon 通过认证接口及精确身份校验后关闭，日常实例未修改。

健康检查改用无 renderer 脚本的专用 HTML 入口，保留真实 packaged 主进程、迁移和 preload IPC，但不挂载恢复终端的普通界面。只有 Orca 34 packaged + 显式健康环境变量 + 后台启动三者成立才选择该入口；工具等待页面标记，避免误把普通启动当健康模式。完整 UI 仍须独立 computer use 验收，不能用该诊断页面替代。

入口边界、窗口恢复及健康断言共 17 项测试通过；Node 类型检查、changed code quality 通过。新包及双仓往返演练待执行，尚未记录为通过。

### 2026-10-20：真实双仓升级与配套回退通过

隔离往返演练已完成：旧日常源码 `966a0f556fc3b6918c9fa552acac0469926abccd` 的应用副本创建真实 api/web Git 仓库与双仓需求，生成 `task/upgrade-check` 分支；停止测试终端后写入成员未提交文件和根目录笔记。安装新候选 `1bf574717afa15371a30cc3ab049858b59f890a1`，执行专用健康检查，确认一个既有需求及完整计划保留。升级后新增 profile 文件，再执行 rollback-with-profile，确认该文件在 after-profile 备份保留。旧版重新打开后需求仍可读取，两个成员的分支、HEAD 与未提交文件、根笔记均通过断言。

隔离目标：`.context/orca34-task-upgrade-sJsTXI`；事务 `.orca34-install-Qxee4X`，最终 rolled-back。证据：`.context/orca34-task-upgrade-rehearsal.json`、同名日志和 `.context/orca34-task-upgrade-rollback.png`。截图已核对，旧版侧栏显示需求与 api/web 项目。测试应用已关闭，日常安装未修改。新候选构建通过打包 PTY 与签名校验。

这是后台 CDP/API 加磁盘断言的升级回归，不是最终 computer use 验收；统一构建到安装编排、自动同步、Cursor/实际配置及独立验收仍待开发完成。

### 2026-10-20：统一交付入口与恢复测试

新增 `pnpm deliver:orca34:local start|resume|status`，串联既有构建、候选校验、prepare/resume 和健康检查。固定源码 SHA；各次构建输出独立目录；记录安装事务后才替换应用；健康失败保留 installed 阶段，下次只重试健康检查。交付目录使用现有维护许可互斥，拒绝错误 profile/源码的事务和已回退事务。回退仍为显式命令，保留升级后数据，不自动覆盖用户新工作。

六项编排测试覆盖阶段顺序、替换中断、健康失败、构建中断、事务绑定错误、交付后手动回退。底层构建及 CLI 回归也通过。用法与边界见 [本地交付入口](fork-orca34-local-delivery.md)。移动端 `.gradle/` 生成缓存加入 mobile/.gitignore，保留原有缓存文件，使源码干净检查不再误报这些构建产物。

全新统一命令的真实端到端构建安装待执行；不得将上述编排测试称为实机通过。

### 2026-10-20：统一入口实机推进到 installed，占用门禁阻止健康启动

统一 start 在源码 `1585b67e61542870ccbb1d1b87d9b832a21f0901` 完成全新构建（DMG/ZIP、本地保存、未发布）、签名/PTY 校验、备份和替换。交付 `.context/orca34-unified-delivery-1792488499190`，安装事务为隔离目标下 `.orca34-install-wExq7i`。

健康启动前 lsof 发现官方 `/Applications/Orca.app/Contents/MacOS/Orca` 持有隔离目标 `Contents/Resources/app.asar` 的只读文件句柄，因此按当前保守门禁返回 live，保留 installed。未关闭官方 Orca、未绕过门禁，未生成健康通过回执。后续从该记录 resume，无需重建。实机统一入口的完整健康/回退仍未通过；此前独立命令的真实双仓往返通过不变。

官方 v1.4.232 的 merge-tree 预检显示 30 个文本冲突，记录于 `.context/orca34-v1.4.232-conflict-hunks.txt`。main 当前基线是该 tag 的祖先；尚未推进任何长期分支。

### 2026-10-20：官方集成 PR 与发现记录

官方集成已提交并推送到 PR #2（https://github.com/34/orca/pull/2），未合并。首轮完整 CI 被一份旧文档格式阻止，已按新版 formatter 修复；当前集成 head 为 `841ba43cb6e752b4f229693ec39770ea3b922572`。该 head 的 Mobile Checks 已通过，完整 PR workflow run `39404374346` 仍排队，不能视为检查通过。

后续开发在 `codex/orca34-release-automation` 继续，避免把发现模块的未完成工作混入正在验证的集成提交。新增 `pnpm discover:orca34:upstream <state-directory>`：只接受官方仓库明确标记的正式桌面版本，固定 release tag 解析出的提交（含有界 annotated tag 解引用），不采用可移动 target_commitish。复用持久维护许可互斥，记录每个版本及最新指针；重复发现不改写记录，同 tag 改指向拒绝继续，旧版本不加入待交付记录。

14 项测试通过，覆盖资格与身份校验、循环 tag、重复触发、并发拒绝、离线恢复和 latest 指针写入前中断。涉及 tsx 动态加载的命令测试在 Node pool 中执行，使用真实维护许可。真实 API 查询仍返回 v1.4.232 / `49109f362f057cd2dc3d81cd378cb84d140c3dc5`；连续第二次查询返回 changed=false。隔离记录位于 `.context/orca34-discovery-rehearsal`，未创建生产定时任务。

本阶段只完成发布发现与去重基础；自动合并/修复、精确 CI 门禁、候选构建与安装编排、失败通知和生产启用尚未完成，不得将发现记录等同于已升级。

### 2026-10-20：完整 PR workflow 证据读取与新增 CI 阻塞

新增只读 `inspectOrca34PrWorkflow`，固定 34/orca PR 与 head，核对非草稿、最新同 PR 的 pr.yml run、完整测试模式、精确 attempt 与唯一成功汇总 job。缺失、失败、取消、跳过、不完整 jobs 页均不能返回 passed；读取后再次核对 run attempt/status 和 PR head/base。此模块只证明完整 workflow，不代替分支保护 required checks 和后续合并前核验，也不执行合并。13 项测试通过；真实查询 PR #2 返回 pending，未产生可发布许可。

完整 workflow 39404374346 的静态 job 118566943863 已失败，其余部分任务仍未结束。直接读取已完成 job 日志发现独立 React Doctor 检查报 126 errors（104 curly、8 array-type 及若干其他规则，涉及本次上游同步范围）；另一个 changed-code-quality 检查为零新增，两者规则不同，后者不能覆盖前者。完整日志保留在 `.context/orca34-pr2-current-static.log`。尚未修复这些检查，也没有弱化或跳过门禁。PR #2 仍不得合并，官方集成完整 CI 验收仍未完成。

### 2026-10-20：定位独立审计错误的目录范围问题

进一步验证表明，上次记录的 126 个 React Doctor errors 不能直接视为源码缺陷：0.9.14 默认 adoptExistingLintConfig 把根 oxlint 配置继承到临时配置，但未保留 cloud/** 排除与 mobile 自有规则作用范围。真实小样例复现了被排除 cloud 的 curly 和 mobile 明确关闭的 array-type 被错误启用。原生 oxlint 对同样例通过；根目录另加缺少花括号的代码仍正确失败。

新增 doctor.config.mjs 关闭重复继承项目 lint 配置，保持 Doctor 自身规则启用，项目规则仍由原有 CI Lint 与 Mobile Checks 执行。扩展锁定工具实跑验证，确认作用范围恢复后 Doctor 的 index-key 缺陷仍失败、原生项目规则仍失败，未调整任何 max-lines 上限或关闭具体规则。该真实回归脚本已通过；完整 PR 的新 head 检查还须重新执行。

本地按 PR 相同旧基线执行独立 Doctor 命令已退出 0；仍报告两条测试文件中的 callback-in-render 提示，由工具既有测试文件门禁策略处理，未隐藏这些结果。集成修复 `d954e1918c0` 已推送 PR #2，等待该提交的新完整检查。自动化分支同步保留发现/证据读取模块与本修复。

远端 run 39406184915 在根目录新增文件门禁失败，未运行后续静态检查。按门禁要求将 Doctor 配置迁入其正式支持的 package.json/reactDoctor 字段，删除新增根配置文件；真实工具回归读取该字段并核验值。未修改根目录白名单。

迁入既有 package.json 配置后，两项实跑命令均退出 0，根目录检查也通过；修复 `2af93a8c342` 已推送 PR #2 重新触发完整 CI。既有 Doctor 的 ignore/rules 配置原样保留，没有覆盖删除。

### 2026-10-20：Cursor 多仓启动入口

本机 Cursor CLI `2026.10.01-e373342` 的实时 help 确认支持 repeatable --add-dir、--plugin-dir 与 sandbox enabled/disabled。创建面板与主进程使用同一个支持列表，加入 Cursor；复用现有 runtime Agent 启动与多仓身份校验，在用户参数前添加精确 Git commonDir 授权。未增加 --yolo/--force，也不更改审批、沙箱或远程路径策略。

新增三个 shell 下的最终 Cursor 命令测试，确认中文/空格目录保持独立参数、--sandbox enabled 与 -- 边界保留。两份启动回归共 53 项通过，tc:node 与 tc:web 通过。本阶段只接通入口和参数，尚未完成 Cursor 双仓实际编辑、停止/恢复，也未进行最终原生 computer use 验收；不以这些测试替代实机结果。

PR #2 当前 head `2af93a8c3429210a7282967bd404c0d7b2a3e80b` 的完整 workflow run `39406535363` 最新仍 queued，尚无完整成功结果；Mobile Checks run `39406537394` 正在执行。

### 2026-10-20：需求根 Agent 参数覆盖实际接入

需求 context/defaults 增加可选 agentArgs。默认缺省继续继承现有全局参数；开启覆盖后空字符串明确清除全局附加参数，非空值用于该需求的根 Agent launch/replay 请求。复用既有启动器与目录授权，不把启动参数写入 AGENTS.md，也不改全局登录或其他需求设置。创建高级预设可设置并保存为默认，需求详情显示继承/覆盖结果。

三项新增持久重试用例覆盖继承、空覆盖、带空格 plugin-dir 参数在 profile 重开后的保留和同 operationId 重试。存储及 RPC 回归共 70 项通过，tc:node/tc:web 通过。启动参数入口提供实际覆盖能力，但不等同完整 Skills/插件配置管理；Skills 仍为引用、插件选择/安装核验及真实 Agent/UI 验收待完成。

PR #2 的完整 run 39406535363 已通过根目录守卫，静态检查和 WSL job 正在执行，依赖隔离 job 排队，不能视为完整 CI 成功。

### 2026-10-20：统一 worktree ID 构造以通过集成门禁

run 39406535363 的静态检查已通过独立 Doctor 和类型检查，随后在 worktree-id-composer ratchet 失败。六处多仓创建、注册修复、准备回执、成员校验和界面打开逻辑改为复用 composeWorktreeId；该函数保持原路径拼写，不改变已保存的 ID，也未放宽 baseline。

该门禁已通过；计划/服务/存储/打开成员四份回归共 110 项通过。继续检查尚未执行的 e2e typecheck、legacy relay、PTY retirement、id-only write、Node pin 五项门禁，以及本地化提取/目录检查，全部通过。仍需推送后验证精确新 head 的完整远端 CI。

### 2026-10-20：工作区 Skills 真实安装、发现与清理

新增显式 workspace/reference 选择；旧需求缺省保持原引用行为，新建需求的预设默认选择工作区安装。复用既有 Skill 打包、摘要验证、安装回执、互斥及发现服务，将完整 Skill 目录放入根工作区 .agents/skills；Codex/Cursor 共用该目录，不修改用户全局 Skills。AGENTS.md 对安装模式指向工作区副本，将原路径标为来源。

在根文件夹注册后、成员创建和 Agent 启动前执行安装，pending/ready/failed 状态写入任务记录，错误显示在详情页，失败可通过现有 Continue / retry 恢复。安装只允许替换未修改的托管版本，用户编辑冲突会保留。删除根工作区时，在停止根会话与持有 watcher 门禁后，通过安装回执的 task/version、host、目标身份匹配移除本需求的未修改副本；无关 Skill 和本地修改保留，冲突时根目录和注册仍保留。空 .agents 目录才会移除。

真实临时目录测试覆盖支持文件复制、发现验证、重复安装、源已删除时清理、用户编辑冲突保护及无关 Skill 保留；服务测试覆盖安装失败阻止成员创建与重试。三份生命周期回归共 92 项通过，另新增根清理失败保护并复跑该测试文件通过；Node/Web 类型检查、oxlint 和增量质量检查通过。尚未在隔离候选中验证 Agent 实际加载及原生 UI；插件设置及完整自动发布编排仍待完成。

集成 PR #2 head 54316c88a53b4e14afd5fb8764d8042b1ebcb4fc 的 Mobile Checks run 39407828309 已通过，完整 PR run 39407828324 最新仍 queued，未确认完整成功。

### 2026-10-20：修复 fork 的旧版 SSH 测试源码来源

run 39407828324 的两个 Docker SSH 分片在拉取 v1.4.224 时失败：检出仓库为 34/orca，未包含官方旧版标签。改为从官方 stablyai/orca 读取该标签，并断言解析提交为 2bb20586ebc39d605e16d95f57420e20a16e7485，避免依赖 fork 标签或悄悄采用移动后的标签。未向 fork 推送官方标签，也未改变测试选择和完整检查要求。两份相关工作流测试共 37 项通过；远端分片需在新提交重跑。

同一轮静态分析与类型检查已通过，但协议/启动器组合门禁仍失败（基线 48，候选 50），Windows 打包也失败。没有添加豁免标签；完整 CI 尚未通过，不可合并。继续调查拆分集成路径和打包日志。

### 2026-10-20：回执写入中断后可重试

逐一核对安装、健康检查、交付及上游发现的回执调用：已有维护许可保护状态更新，新建快照目录和独立健康记录使用独占路径。将固定 .pending 改为每次独立的 .pending-UUID，仍使用独占创建、文件同步、原子替换与父目录同步；遗留文件保留，不读取或提升为正式状态。旧版 .pending 不再永久阻止恢复，也不作为并发互斥机制。正式回执与磁盘身份校验继续决定恢复路径。

五份相关测试共 29 项通过，覆盖序列化失败保留正式状态、遗留新旧临时文件后重试；追加在应用替换两个 rename 中断位置遗留部分回执的断言，安装事务五项测试复跑通过。oxlint 通过。未替换日常安装，候选实机完整恢复和最终原生验收仍待完成。

Windows job 118581746804 日志已读取：728 项测试中 671 通过、56 跳过、1 失败，失败为 ConPTY 表压力测试的新终端就绪超时。两个终端已返回标记，第三个只有 cmd 提示符，不能归因于安装包本身，也不能据此声明 Windows 已通过。日志保留在 .context/orca34-windows-package.log，后续需定位或在新提交的真实 Windows job 复核。

### 2026-10-20：发现、完整 workflow 与本地候选构建串联

新增 prepare:orca34:candidate 命令，复用发布目录维护许可、官方发现去重、完整 PR workflow 证据、已有构建及候选身份校验。将 PR、源码路径、完整 SHA、官方 tag/commit 固定到 candidates/<sha>/candidate.json。源码须干净且包含官方提交；CI 未通过只记录 waiting，不构建。构建中断保留输出，重试使用新目录；成功构建记录 built，后续身份与 CI 核验可复用包，最终记录 verified。错误持久化为 failed，不产生安装或合并许可。

证据读取新增 base SHA，并核对 workflow 标题中的测试源码等于 PR 当前 merge_commit_sha；防止 head 未变、base 已前进时复用旧成功。构建后重新核对 head/base/run/attempt 的同一完整证据。三份相关回归共 26 项通过，oxlint 通过，覆盖等待、重复执行、中断新目录、base 变化、候选身份损坏、源码变化、互斥与错误 PR 绑定。

真实读取 PR #2 head 35c12caa8b961e8527e3b0bebed724a8bd8dfc0d 返回 run 39410236591 pending；未以模拟测试代替真实构建通过。该命令仍不执行自动合并/冲突修复、其他 required checks 核验、安装、调度或通知，完整编排与最终原生验收继续待完成。

### 2026-10-20：拆分协议升级与启动器集成，保留原有 CI 门禁

新增前置 [PR #3](https://github.com/34/orca/pull/3)，基于未修改的 34/local，移植官方协议 49/50 提交及 PowerShell 参数转义依赖。协议分支 head 为 82acba9b2dea59625e79d2b09d36ece8bc8acfbe。没有变更门禁列出的启动器文件，48 → 50 ratchet 通过，相对官方 v1.4.232 的协议兼容检查通过。

协议分支 Node/CLI 类型检查通过；定向测试首次 163 通过、25 跳过、1 个 fish Unicode 环境失败，恢复完整集成中已有的显式 UTF-8 locale 后该文件全部 37 项通过。生成 shell 快照五项通过，整个前置分支相对 34/local 的增量代码质量检查通过。没有进行真实 Claude 登录测试。Windows 仍由实际远端检查验证。

[PR #2](https://github.com/34/orca/pull/2) 改为基于协议前置分支，head 为 4533519f286b8cc6bcf6a7a236788dfaff95b9cc。合入前置分支后与原集成的源码完全相同，仅增加拆分说明文档；没有重写历史或回退功能。此阶段为 50 → 50，含启动器变化的 ratchet 也通过。两个 PR 都需要精确当前提交的完整 CI；均未合并，也未添加豁免标签。最终升级回归与原生 computer use 验收仍是必需项。

### 2026-10-20：离线失败持久化与通知编号

候选入口现在先建立身份固定的回执，再进行官方发现；网络失败可记录 failed/error，后续同一命令恢复。回执增加最近结果 notice：失败、检查阻塞和候选就绪使用递增编号，相同结果重复执行不增加编号，初始 pending 保持安静，旧结果在 waiting/building 阶段不再 active。该字段仅供后续调度器读取、发送和记录送达编号，目前不表示通知已经发送。

新增离线重复失败与恢复、pending/blocked 去重测试，并扩展已就绪候选在新 CI 排队期间的通知失效断言。两个 PR 最新完整 run 分别为 39411641029（#2，运行中）和 39411570711（#3，排队），没有完整成功证据。

### 2026-10-20：新候选真实 Cursor 双仓与工作区 Skill 写入

从 f2733d9c1281ee217a59f872bd73c3a13a891314 全新构建 macOS arm64 隔离候选，打包 PTY、签名和 DMG/ZIP 构建通过。产物目录 .context/orca34-agent-config-candidate-lvemXJ，未安装到日常目录。

隔离 profile 创建真实 api/web Git 仓库及多仓需求，使用根 Agent 参数覆盖启动 Cursor。Skill 通过应用现有服务安装到根 .agents/skills，包含 SKILL.md 和带随机标识的支持文件；Cursor 实际读取支持文件，在两个成员写入 CURSOR_PROOF.txt。两份文件均与支持文件逐字一致，两个 git status 均只显示该未跟踪文件。证据：.context/orca34-cursor-rehearsal-result.json；测试根 .context/orca34-cursor-rehearsal-btreQx；任务 47a18651-75fb-4575-a24e-43294671c3de。此结果证明实际读取与写入，不只是启动回执。

隔离 HOME 不能直接继承日常 Cursor 登录。第一次缺少认证，第二次确认登录 token 不能当 API key；最终使用本机 CLI 支持的 CURSOR_AUTH_TOKEN 与 AGENT_CLI_CREDENTIAL_STORE=memory，在内存中复用现有 Keychain 登录，不写令牌文件、不改日常凭据。测试专用参数为 --print --auto-review --sandbox enabled --trust，未设置 force/yolo。

清理通过已认证且 PID 匹配的隔离 daemon shutdown，日志确认关闭；候选主进程也已退出。但测试驱动的退出等待挂起，确认其命令身份后终止驱动，结果中明确记录 driverExitHung。截图被上游会话搜索引导层遮挡，不能作为创建/配置界面验收通过。尚需实际停止/恢复、插件配置、最终独立 computer use Agent，以及更完整的界面与升级验收。

远端 PR #2 又发现三个待处理失败：node shard 2/5 的归档测试仍期待旧版元数据调用参数、会话缓存冷读测试失败，以及 WSL golden Agent 未出现就绪标记。日志分别为 .context/orca34-ci-node-118593287768.log 和 .context/orca34-ci-wsl-118590966424.log。完整 CI 仍未通过。

### 2026-10-20：修复完整 CI 的测试夹具回归

run 39411641029 的 Node 分片有两项失败：归档测试仍断言旧的 positional 参数，现已匹配保留 hostId 的目标对象；冷会话夹具追加 cwd 事实后修改时间变成最新，破坏了“超出最近会话上限”的前提，现保留追加前时间。另修复 macOS 临时目录 `/var` 与真实 `/private/var` 的两项路径断言，生产代码未改动。会话缓存回归通过，runtime 定向 21 项通过。

WSL 失败截图实际上显示 GOLDEN_STUB_AGENT_READY；现有检查却未从 ANSI 序列化字符串找到它。Agent 测试改为先等待新标签激活，再使用已有 readActiveScreen 检查该标签的屏幕文本，保留原 20 秒门限；失败会显示实际屏幕内容。隔离夹具指定英文，避免本机中文环境找不到英文按钮。macOS 隐藏窗口 Codex/Claude stub 启动两项通过（没有调用真实 Claude）；Windows/WSL 四项依赖远端重跑，不能据此称为已修复。e2e 类型基线门禁通过，227 项既有错误未增加。

### 2026-10-20：默认仓库组合与中文配置提示

复用现有“保存为新需求的默认配置”，将当前仓库 ID 组合按 profile 保存。重新打开创建面板时只恢复仍可用的本地 Git 仓库，目录重名沿用现有去重规则，分支按新 requestId 和名称重新生成；不保存上个需求的分支、成员 setup 覆盖或附件。手动修改的成员配置在调整选择时保留。空组合可持久化，重复 ID 与超限输入拒绝写入。

默认值持久化、成员选择、命名和 IPC 四份回归共 35 项通过，Node/Web 类型检查通过；新增隐藏 Electron 操作测试实际选择仓库、保存默认值、返回管理并新建第二个需求，确认自动选择和新分支，通过。补齐 Agent 参数与工作区 Skills 的中英文配置提示。此功能提供一个默认组合，不包含多组命名收藏。最终独立原生 computer use 验收仍待进行。

### 2026-10-20：候选构建接入 required checks 与仓库合并状态

新增只读 merge admission 检查并接入候选构建入口：在精确完整 workflow 成功后，读取 GitHub required checks，要求每项 SUCCESS、名称不歧义，且仓库状态 CLEAN/MERGEABLE、审核无阻塞。前后核对 head/base/合并状态并重复检查完整 workflow，避免 head 未变但基线、重跑或审核变化后复用证据。CLI 网络、认证、截断及超时均停止；只有明确“没有 required checks”才允许空列表，并仍核验完整 workflow 和仓库状态。检查不执行合并，也不授予发布权限。

三份回归共 39 项通过，覆盖 pending/失败/取消/跳过/neutral、审核阻塞、落后与冲突、head/base 漂移、workflow 重跑及 CLI 错误。本次真实读取 PR #2 的 required checks 显示未配置，合并状态 UNSTABLE；完整 CI 仍未通过，不可合并。自动解决冲突、调度/通知及正式安装启用仍未完成。

### 2026-10-20：有限 Codex 冲突修复与真实重试演练

新增 repair:orca34:integration，固定合并双方、原始 HEAD、分支和源码路径，只允许已有 merge 的 codex/ 分支。状态放在源码外，沿用发布互斥；每轮启动前记账，最多三轮，结束前重新检查合并身份、冲突、diff、类型与增量质量。Agent 使用 workspace-write 的自动审批审核模式，不禁用审批/沙箱；成功只进入 awaiting-review-and-full-ci，不提交、推送或发布。未知子进程状态保留 running/unverifiable，拒绝盲目重复执行。

六项回归通过：先记账后启动、成功重入、三轮上限、Agent/验证子进程退出不可核实、互斥及合并身份变化。真实一次性 Git 冲突仓库第一次因 Codex 不允许 --approve-for-me 与 --sandbox 同传而失败；改用前者自带的 workspace-write，在同一回执第二轮成功。结果同时保留 workspaces=true 与 autoStart=false，冲突清零、HEAD 不变，验证命令通过。证据 .context/orca34-repair-rehearsal.json，隔离状态目录在该文件 root 下；未调用真实项目的修复或改动日常安装。

集成 PR #2 精确 head bf5e0ea8d65569ec030390fed44c983053bcd4a1 的 run 39424051216：真实 WSL terminal、Windows package 和 Windows orca serve 已成功，其他分片仍执行或排队，尚无完整 aggregate 成功。自动准备集成分支/PR、定时触发和通知、插件实际设置、完整升级与最终独立原生验收仍待完成。

### 2026-10-20：排除 fork CI 的不可用 runner 队列

run 39424051216 的全部 Node 分片、WSL 和 Windows 打包已通过，但依赖隔离 job 一直排队：它使用新引入的官方 Blacksmith runner，未继承 fork 的已有路由。协议前置 PR #3 也因四处官方 runner 标签而从 detect job 起一直排队。

协议分支为 34/orca 补齐四处 ubuntu-24.04 路由，官方保持原 Blacksmith；合入集成分支后为 dependency_isolation 补同样路由。新增回归遍历 PR workflow 的所有 Blacksmith 选择并实际求值验证 fork/官方两种身份，防止遗漏新增 job；没有跳过检查或放宽 aggregate。两条分支的新 head 均需完整重跑，不能沿用旧成功结果。

### 2026-10-20：根 Agent 插件配置与重试参数持久化

需求高级配置新增 Codex 启用/停用插件 ID 和 Cursor 本地插件目录，随“保存为新需求的默认配置”恢复。Codex 使用已配置 marketplace 的 `plugin@marketplace` ID，通过启动参数覆盖 enabled；依据 [Codex 官方插件配置说明](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo)。Cursor 沿用 CLI 的 `--plugin-dir`，启动前核验绝对目录及支持的 manifest。未配置时沿用已有参数；不改全局配置、认证、沙箱或钩子信任。

参数通过现有 shell tokenizer/quoting 生成，插入 prompt 的 `--` 之前。首次 RPC 前将解析后的参数持久化，同一 operationId 的失联重试保持参数不变。六项插件校验/三种 shell 回归及既有 journal 测试共 31 项通过；Node/Web 类型检查通过，增量质量检查通过。隐藏 Electron 测试实际填写配置、保存默认值、返回并创建第二个需求，确认多行插件及带空格目录恢复，通过。

当前覆盖根 Agent 首次启动及其失败重试；手动新会话、真实插件加载与最终独立原生 computer use 尚未验收，不将参数测试当作插件功能验收。PR #3 精确 head 4f2d5be111a20237cf812edf748854ae28c6997d 的完整 CI 失败，协议 crossing 和 Node 分片待修复；PR #2 的新 run 39430066963 仍在运行。没有合并、公开发布或替换日常安装。

### 2026-10-20：前置协议 PR CI 修复及进程清理竞态

协议 PR #3 的 run 39429639888 失败已逐项定位：fork 缺少版本标签、runner 表达式与旧测试断言冲突、三份 legacy relay SQLite 测试未登记 Node runtime，以及 daemon 退出时测试清理认证过晚。复用集成分支已有修复，补齐标签 fetch、runner 断言和运行环境登记；本地 runner 回归 99 项、preflight/SQLite 回归 81 项通过，v1.4.232 协议双向检查通过。提交 56e3ab7fb73 已推送，Linux daemon 实际结果仍需新 CI。

协议修复合入集成分支时，删除旧目录的 runtime 登记，保留集成版本已重命名的 legacy-relay 三份登记。PR #2 的 run 39430066963 又出现一个测试清理竞态：进程在 alive(pid) 与 SIGKILL 之间正常退出，ESRCH 使已完成的测试失败。只在测试清理中接受这一退出结果，其他错误继续抛出；监督器生产逻辑和退出断言不变。完整 CI 尚未通过，未合并 PR、发布安装包或替换日常安装。

### 2026-10-20：Cursor 本地插件真实加载证明

使用当前 `multiRepoPluginLaunchArgs` 生成启动参数，真实 Cursor CLI 在独立临时 HOME/workspace 中加载带空格路径的本地插件。插件 Skill 内置随机校验值，启动提示只指定插件和 Skill 名称，不提供校验值。Cursor 生成 PLUGIN_PROOF.txt，内容与插件内值精确匹配；退出码 0、未超时、进程终止已确认。沿用现有登录令牌的内存环境传递，不写令牌、不修改日常配置；使用 auto-review 与 enabled sandbox，没有 force/yolo。

证据 `.context/orca34-cursor-plugin-result.json`，可重现驱动 `.context/orca34-cursor-plugin-rehearsal.mjs`。隔离目录 `/private/var/folders/m2/jpsz5dgs0tldhkg36ldvh8500000gn/T/orca34-plugin-proof-ZK20KE`。这是插件实际加载验证，不是原生界面验收。根 Agent 恢复入口当前仍提示手动新建会话，尚未保证需求预设在新会话中继承；需补这一流程并实测停止/恢复，Codex 插件实测和最终 computer use 仍待完成。

### 2026-10-20：需求面板根 Agent 重启入口

新增“重新启动根 Agent”：确认会停止根工作区全部会话后，校验当前需求 revision、成员准备状态和插件参数，同步成员上下文，复用现有物理停止与目录身份校验，再建立新 operationId 启动新的对话。使用保存的需求 Agent 参数/插件设置；未覆盖参数沿用当时全局默认值。成员工作区的会话、文件和分支不重建。停止不可核实时不创建新启动意图；启动响应丢失后使用既有“继续”重放同一 operationId 和已持久化参数，不再次停止。

服务/持久化、接口与界面回归通过，Node/Web 类型检查与增量质量门禁通过；e2e 类型基线 227 项未增加。隐藏 Electron 测试实际创建 Git 成员和根 stub Agent，从需求详情点击重启并确认，核对 operationId 更换、启动参数保留、成员记录不变，通过。首次 e2e 因测试错误使用 alertdialog 定位普通 Dialog 而失败，修正定位后通过。这里验证的是新对话重启，不等同恢复旧 Agent 对话历史，也不替代最终真实 Cursor 停止/恢复与原生 computer use 验收。

### 2026-10-20：协议前置 PR 的滚动版本基线修复

协议 PR #3 的 run 39437632250 中 Node 分片已通过，剩余跨版本 suite 从旧 renderer 路径找不到官方版本已移动的 isStructuredTab。复用集成分支已有的新旧模块路径加载逻辑，保留原兼容性断言；8 项定向测试通过。提交 cfda6c2ee4c 已推送并合入集成分支，需按新精确 head 重跑完整 CI。

集成 PR #2 的 run 39438138245 出现 Bash PROMPT_COMMAND 测试 spawnSync 5 秒超时，本机定向复验通过，尚不能确定远端超时原因。未增加超时、跳过测试或认定 CI 已通过；保留 `.context/orca34-ci-node-current.log` 的失败证据，新 head 的完整 CI 仍须成功。

### 2026-10-20：自动同步的持久基线计划

新增 plan:orca34:sync，沿用发布目录互斥、官方发现与原子回执，固定官方 tag/SHA 和 main、34/local 两个起始 SHA。保存前复查三者身份，发现变化、离线或损坏记录时拒绝推进；已存在的计划不随 main 的部分推进而重算。6 项测试覆盖重复执行、main 已推进、发现期间变更、离线、并发与损坏记录，增量质量门禁通过。

真实只读演练确认官方仍为 v1.4.232 / 49109f362f057cd2dc3d81cd378cb84d140c3dc5，两个长期分支仍为 b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122。证据 `.context/orca34-sync-plan-live.json`，隔离回执在 `.context/orca34-sync-plan-rehearsal`。本次仅固定输入；自动准备分支、合并提交、PR、部分推进记账、调度通知仍须继续接入，不将生成计划等同于完成自动同步。

### 2026-10-20：临时分支合并准备

新增 prepare:orca34:sync，消费固定计划并在当前干净源码建立专属 codex/ 临时分支，保留 --no-commit 合并现场。local 阶段要求 main 候选完整 admission 成功、基线匹配并包含固定官方提交。回执绑定源码路径/基线/目标/分支；拒绝脏工作区、无回执的同名分支和改变的合并身份。重复执行已完成的准备只核验现场，冲突解决后可转为 prepared；没有自动提交或推进长期分支。

两份回归 12 项通过，其中源码准备使用真实 Git：同时保留官方与 fork 文件、保留冲突/接受已暂存解决、重复执行、用户未提交文件保护、同名分支归属拒绝、未通过 main 门禁拒绝，以及中断状态拒绝盲目重试。增量质量门禁通过，证据 `.context/orca34-source-prepare-tests.log`。不确定子进程的自动恢复、串联有限修复、提交/PR、完整调度通知及最终验收仍待实现；当前阶段不等同完整自动同步。

### 2026-10-20：同步候选验证与本地提交

新增 commit:orca34:sync，复用同步 Git 子进程边界，在固定暂存 tree 上运行 diff/typecheck/增量质量检查，检查前后核对分支及合并双方，然后只提交专属临时分支。回执校验双父提交、tree 和操作 ID，重复执行不重提交。已知失败允许修正后重试，三轮上限；未知子进程结果拒绝自动重复。日志按操作 ID 保留，未加入 push 或长期分支推进。

准备阶段 6 项与提交阶段 7 项测试通过。Git 合并、提交与文件操作使用真实临时仓库；提交测试的 pnpm 检查用注入的可控成功/失败结果验证门禁顺序，不能代替真实源码的类型检查。覆盖错误内容/分支变化、用户文件、失败后修正、有限重试、重复提交与未核实子进程；增量质量门禁通过。证据 `.context/orca34-sync-commit-tests-final.log`。

协议 PR #3 新 run 39443080668 的剩余失败是 orcad bundled runtime watcher 在订阅后 SIGSEGV，日志 `.context/orca34-protocol-preflight-current.log`；不能按普通超时处理，仍待定位。自动修复串联、提交后 PR/完整 CI、自动推进和通知及最终原生验收未完成。

### 2026-10-20：Linux watcher 构建烟测退出竞态

用 Docker Linux x64、项目固定 Node 24.21.0 和实际 @parcel/watcher 2.5.6 原生模块复现：完整子进程 100 次出现 1 次 subscribed=true/SIGSEGV；缩减至两个订阅、退出时删除 canary 目录后，400 次出现 6 次。单订阅 400 次无失败；仅取消退出时目录删除的对照 1,000 次无失败。正式 supervisor 已由父进程拥有 canary，构建烟测遗漏该环境参数，触发子进程自行清理路径。

烟测现采用正式运行时的目录所有权：父进程传入 canary 目录，在退出确认后回收；超时或启动错误尚未确认关闭时等 close 回收，不在原生 watcher 存活时删除。提取原烟测入口以直接回归正常/非零退出和目录生存期，2 项测试先失败后通过；改动质量检查通过。修改后的实际 Linux watcher 400 次零失败。证据在 .context/orca34-watcher-{linux-repro,minimal-canary,no-cleanup,fixed}.log。原生模块仍在相同 bundled runtime 下执行，未接受 SIGSEGV 或放宽 CI 门禁。

协议 PR #3 已推送 8e7b4e4f2dc，集成 PR #2 已推送 c3accb20de6，并合回自动化分支。旧 head 的结果不能替代新 head 全量 CI；新 CI 尚待完成。自动编排和最终独立 computer use 验收仍未完成，未推进长期分支或安装日常应用。

### 2026-10-20：候选推送与 PR 创建入口

新增 publish:orca34:sync，要求已有 committed 候选回执和按模板准备的 PR 描述，固定 34/orca SSH 远端、临时分支、提交及长期分支基线。只推送专属分支，不强推；唯一且身份一致的已有 PR 可复用，重复运行不重复推送/创建。创建前后核对远端与本地身份，未知写入结果保留回执停止重试，不能把 published 当作 CI 通过或合并授权。

提交/发布 17 项测试通过，质量门禁通过。测试在真实临时 Git 仓库及 bare 远端上执行推送，GitHub API 和 pnpm 验证结果受控注入；覆盖去重、已有 PR 恢复、他人分支、基线移动、PR 身份改变、未提交候选拒绝和未知写入停止。证据 .context/orca34-sync-publication-tests.log。尚未用此入口创建公开 PR；全流程编排、未知进程核实恢复、通知及最终原生验收仍待完成。

### 2026-10-20：保持协议与运行时构建修复分离

协议 PR 的 run 39450219496 已通过 v1.4.232 双向协议检查，但范围门禁拒绝同一 PR 修改协议版本与 build-orcad.mjs。协议分支恢复原构建入口，改由现有 CI 终端烟测步骤提供并回收 canary 目录；通用构建修复保留在后续集成分支。没有添加豁免标签或改变门禁断言。

真实 shell 夹具验证目录在运行期间存在、成功/失败后回收且原退出码保留；相关 54 项测试通过，范围门禁通过。原 watcher 配合 CI 父进程目录配置，在 Linux x64 / Node 24.21.0 下 400 次零失败，证据 .context/orca34-protocol-canary-native.log。仍需本次新提交的完整 PR CI，不能以本地回归替代。

集成分支保留新版分离的 smoke scope/mobile page 构建步骤与通用 watcher 修复，不引入仅用于旧版协议前置分支的 shell 夹具。

### 2026-10-21：同步阶段推进器

新增 advance:orca34:sync，串联准备、有限冲突修复、提交、候选发布与精确提交完整 PR 门禁，外层锁覆盖跨阶段推进。已有 committed 回执直接复核提交，不再调用要求基线 HEAD 的准备逻辑；CI 等待、发布失败后重试复用同一提交，原修复预算不重置。新增 source 参数让修复入口使用执行器指定的源码目录，避免修改全局 cwd。

推进器、修复与发布共 23 项测试通过，增量质量检查通过。真实临时 Git 合并/提交与冲突现场，Codex/验证输出、远端发布与 CI 证据受控注入；验证冲突修复入口串联、三次预算、CI 头变化、失败恢复和并发互斥。证据 .context/orca34-sync-runner-tests.log。实际无人值守发现/获取源码、两阶段统一推进、通知投递、未知子进程核实恢复及最终原生验收未完成。

### 2026-10-21：回移官方隐藏窗口首帧准备修复

协议 PR 的 run 39452947163 在 package job 的 popup native 测试失败，位置是夹具首次绘制等待，尚未执行 Shift POST 行为断言。回移官方提交 449cbb08a028666c499b317bc9150b0e9ffb136e（#30854）：将一次性 GPU/首帧准备放入 beforeAll，保持后续行为断言和 poll 预算不变，失败时报告具体页面。官方 v1.4.232 集成分支已含此修复。

本机 ORCA_BACKGROUND_LAUNCH=1 隐藏 Electron/CDP 运行 popup compatibility、native、background 三份测试，共 39 项通过；增量质量和运行时/协议范围门禁通过。日志 .context/orca34-popup-backport-tests.log。Linux CI 仍需新 head 完整验证；此前集成 run 39453264107 已取消，不能作为成功证据。

### 2026-10-21：v1.4.232 实际统一升级与 Cursor 重启

以 ae59c7d448560c4570013f4feff29f217b5e8a7b 构建独立 arm64 候选并通过签名、架构与 PTY 校验。完整执行 deliver:orca34:local start，在系统临时目录内将旧 966a0f556fc3b6918c9fa552acac0469926abccd 安装副本升级至新候选，隐藏健康检查通过，普通新界面重新读取原有双仓需求；随后带 profile 回退并重新打开旧版。两个成员的分支、HEAD、KEEP 文件与根笔记保留，升级后文件保存在回退恢复目录。日常安装未修改，测试应用已关闭。证据 .context/orca34-v232-upgrade-rehearsal.json，截图 .context/orca34-v232-upgrade-{installed,rollback}.png。

同一候选通过真实 Cursor 和实际 multiRepoWorkspaces.restartAgent 执行双仓验证。第一轮读取工作区 Skill 的随机证明并写入两个成员；删除仅供测试的证明文件后重启根 Agent，新 operationId 再次产生相同证明，保存参数 --print --auto-review --sandbox enabled --trust 不变。证据 .context/orca34-cursor-restart-result.json，截图 .context/orca34-cursor-restart.png。上述是实际运行与隐藏 CDP 证据，不替代最终独立原生 computer use 验收。

### 2026-10-21：local 推进接入候选构建

local 阶段完整 PR 门禁通过后复用 prepareOrca34Candidate，持久保存 candidate-ready；失败重试复用原提交和已完成候选，检查改变则撤销候选指针。源码路径贯穿版本读取、Git 身份与构建子进程，不依赖全局 cwd。23 项定向测试和增量质量门禁通过，覆盖构建失败恢复、CI 改变、错误候选身份和指定源码目录。测试初次将 process-host 夹具引入 Bun 套件触发 tsx 加载失败，移至已有 Node 候选套件后通过。真实打包演练对应前一提交；本次编排连接的构建/CI 使用受控注入，尚须最终候选与全流程验收。

### 2026-10-21：受门禁约束的合并与结果恢复入口

新增 merge:orca34:sync，复用固定计划、publication 回执、发布目录互斥与完整 merge admission。默认只检查；显式 apply 路径只合并固定 head，不使用 auto/admin。成功核验远端 merged 与实际双父提交，main/local 分别记账；响应丢失后只读核实，未确认的 open PR 不重复提交。远端基线在请求期间变化不能原子阻止，父提交不匹配时保留 unverifiable、停止下游，并要求核实。

22 项合并入口/门禁测试通过，使用真实本地计划与持久回执、受控 GitHub 响应，覆盖默认只读、pending/blocked 拒绝、精确 head 参数、重复触发、响应丢失恢复、未确认子进程、head/base 变化及错误父提交。未实际合并任何 PR。完整自动编排、通知、最终原生验收及两个 PR 的完整 CI 仍未完成。

### 2026-10-21：自动同步专用源码获取

新增 checkout:orca34:sync，消费固定计划，在发布目录内为 main/local 分别分配新检出。先记录所有权，再通过固定仓库与明确 ref 获取源码，验证基线和官方 tag SHA，不在开发工作树切分支。已准备目录重复执行只核验归属与对象，保留后续编辑；中断或目录缺失停止，不重建或重置现场。

6 项真实临时 Git 获取/检出测试通过，覆盖两份目录隔离、重复保留用户文件、未核实子进程拒绝、base/tag 移动、目录丢失及回执重定向。测试将固定远端映射到本地临时 Git 仓库，没有实际拉取新的官方检出或运行其脚本。依赖安装、发现到两阶段统一调度、通知以及最终原生验收仍待串联；当前 PR 完整 CI 尚在运行。

### 2026-10-21：回移 daemon 自然退出时的夹具收尾修复

协议 PR run 39515947079 的 Linux/Windows 打包、静态检查与其他分片已通过，Node 4/5 唯一失败为 AppImage 无独立 Node 用例收尾时无法再次验证 daemon。回移官方 7a77653c71aac0653cba74dffd5646f51f1f3584 的夹具与测试：仅在指定的端点失联错误后继续要求操作系统确认原 PID 退出，不把失联视为退出；仍拒绝活进程、不同端点所有者及其他错误，不追加按 PID 强杀。

原夹具运行官方定向回归稳定出现 2 项失败；修复后 17 项通过，1 项 Linux 专属 zombie 用例在 macOS 跳过。增量质量及运行时/协议范围门禁通过。证据 .context/orca34-retirement-{before,after}.log；本机未运行 Linux AppImage 实际用例，仍须新精确 head 的完整 CI。集成分支已包含官方修复。

### 2026-10-21：专用检出的锁定依赖准备

commit 与 repair 验证在类型检查前增加 frozen-lockfile 安装，复用源码 postinstall；修复提示明确允许为定向测试在当前检出安装依赖，仍禁止安装应用或发布。正常提交的逐步树身份核验覆盖安装导致的修改，失败不推进提交；已有 committed 回执重试不重复安装。

提交、修复与推进器 23 项回归及增量质量门禁通过，包含安装失败时不运行后续检查、不提交以及调用顺序。这里真实执行本地 Git，依赖安装返回受控注入；完整新检出的实际安装与端到端自动流程仍待统一编排验证。两个新 head 的 CI 仍在运行。

### 2026-10-21：发现到双阶段候选的统一入口

新增 advance:orca34:release，串联发现、固定计划、专用检出、main 推进/检查、固定提交获取、local 推进/检查及候选构建。全程互斥，记录整体阶段和两侧结果，CI 等待后可重入；local 失败保留 main 结果，未确认的获取拒绝重复。未连接合并/安装动作，仍为候选模式。

6 项流程测试通过，其中一项使用真实双检出和两个实际 prepare/commit 阶段，验证准确父提交与重复执行不重复安装；另覆盖 main 等待、local 失败恢复、发现离线、获取结果未核实、并发。远端映射到临时本地 Git，GitHub/依赖命令/构建结果受控，不能代替完整真实自动同步。定时触发、通知投递、已合并阶段恢复与最终原生验收仍未完成；当前两个 PR 的新 CI 暂无失败项但尚未结束。

### 2026-10-21：通知序号与送达确认

将候选通知序号逻辑提取并复用于统一推进结果，增加 notice:orca34:release 读取/显式确认入口。重复失败保持序号，阶段/提交/消息变化形成新事件；读取不消费，确认核对当前 active 序号并持久保存。显示后确认前中断允许重复显示，避免提前确认导致丢消息。

通知、候选与统一流程共 22 项回归通过；另在统一流程的真实失败记录上验证读取、确认、再次离线不会重复待发送。GitHub/安装/构建仍按相应用例使用受控依赖。实际自动通知投递、定时器和最终原生验收仍未执行。

### 2026-10-21：已合并 main/local 的历史门禁恢复

增加独立的 merged workflow 核验：要求关闭且确已合并、固定实际 merge commit，并从 GitHub 读取测试/实际提交，检查双父身份与文件 tree 相同，仍检查最新完整 workflow 及 aggregate。合并前路径保持 open 要求。推进器消费已合并回执、跳过重复发布，并让 local 准备和候选构建复用历史证据；缺失原 admission 或 CI 重跑失败阻止推进。

工作流、合并门禁、合并恢复与两层推进器共 57 项测试通过，覆盖相同 tree/不同提交元数据、父提交或 tree 改变、已关闭未合并、默认 open 要求、重复发布拒绝、main 已合并后 local 准备及 local 已合并后候选重验。真实本地合并与回执，GitHub 历史证据受控注入；没有合并远端 PR，未以模拟历史证据宣称真实 CI 已通过。两个新 head 完整 CI 仍在运行。

### 2026-10-21：复用候选的统一交付与真实升级回退

deliver:orca34:local 增加 candidate 模式，先校验指定 SHA 的独立包，再复用既有备份/替换/健康检查状态机，不从调用目录重建。候选与目标/profile/交付目录隔离，恢复时禁止转回构建阶段。8 项回归及质量门禁通过；新测试真实调用维护许可，初次 Bun/tsx 不兼容后归入已有 Node 运行时套件，通过。

使用之前已校验的 ae59c7d448560c4570013f4feff29f217b5e8a7b 候选，在全新系统临时目录实际执行新 candidate 入口，将旧 966a0f556fc3b6918c9fa552acac0469926abccd 副本升级，健康诊断与普通界面重开通过。配套 profile 回退后旧版重开通过，双仓需求/分支/HEAD/KEEP 文件和根笔记保留，升级后数据保存在恢复目录。证据 .context/orca34-adopt-candidate-rehearsal.json，截图 .context/orca34-adopt-candidate-{installed,rollback}.png。应用已关闭，日常安装未修改；此演练验证候选复用入口，不代表最新源码已重新构建或最终原生验收完成。

协议 PR #3 的 ae202c91741ffeef149048adcf74af732221158b 已通过完整 pr.yml run 39518146096，现有门禁再读确认 full-workflow-and-merge-policy-successful、固定 base b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122。证据 .context/orca34-protocol-admission-current.json。未合并 PR；集成 PR #2 的完整 CI 仍在运行。

### 2026-10-21：显式合并/安装编排与暂停巡检

新增 apply:orca34:release，复用 merge 和 candidate delivery，不重新实现分支写入或安装机制。固定候选/head/PR/目标，先检查两侧 CI，依次合并并补验历史证据，最后采用候选并恢复同一交付。16 项定向测试通过，changed-code quality 通过；公共合并和日常安装均未执行。Codex 巡检 orca-34 已创建为 PAUSED，每 6 小时，仅候选模式，等待长期定制基线及独立验收。

### 2026-10-21：Codex 插件开关真实回归与修复

实际 Codex CLI 0.163.0 暴露了单元测试未捕获的问题：`-c plugins."id@market".enabled=false` 的键被按点字面拆分，引号成为键名的一部分，插件仍可见。改为一个 TOML inline table 覆盖；实际 CLI plugin list 与模型可见 Skill 均验证禁用有效，启用时能返回仅存在于 Skill 文件中的随机标记。另一个已禁用插件仍保持禁用；不改用户全局配置。三种 shell 的参数往返测试 6 项通过，增量质量检查通过。证据与隔离驱动为 `.context/orca34-codex-plugin-*`；该修复需要重新构建候选并独立复验。

CLI 当前拒绝含点的 marketplace 名称；参数序列化保留点的测试不等于当前 CLI 支持安装这种 marketplace。与 CLI 实际支持范围保持区分。

### 2026-10-21：上游版本再次发现

只读发现最新稳定版已为 v1.4.235，SHA 136dc46477b22981afc4cb574b2b29982ce405fe，发布于 2026-10-20 22:52:23 UTC。本次集成、候选与验收仍固定 v1.4.232；v1.4.235 记录为后续同步输入，不在已运行的验收中偷换版本。生产分支仍未合并，巡检保持暂停。

### 2026-10-21：实际官方检出与部分推进保护

真实 GitHub 发现/固定 v1.4.235、抓取 fork main 与官方 tag 到独立回执持有的源码目录成功，重复检出复用同一路径。仅只读远端，未对该新版本创建 PR、构建或合并。证据 `.context/orca34-real-checkout-result.json`。这是源码获取实测，不替代 v1.4.232 候选验收。

巡检现在遇到未完成的 application 回执会保留 release-run 候选并停止新发现，防止 main 已推进或安装失败时新官方版本覆盖恢复入口。恢复 healthy 后才允许下一次发现。7 项统一推进测试和增量质量检查通过。

### 2026-10-21：真实短路径安装回归与 CI 本地化修复

短路径真实安装发现旧 daemon 已退出后遗留的 daemon-v48.sock 会令 profile 快照失败；安装尚未发生，旧数据保留。安装入口现复用维护许可与 lsof 停止证明后，仅清理已知命名的实际 socket，保留同名文件、链接和未知端点。真实活动 socket 会阻止清理。16 项快照/事务/停止测试及 24 项安装/回退/健康/交付测试通过；同一失败 release application 正在恢复演练。

PR #4 run 39522466161 的静态检查失败于两个未本地化插件 placeholder；已加入中英文目录并通过覆盖、目录和提取校验，没有放宽门禁或添加白名单。
