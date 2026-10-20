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
