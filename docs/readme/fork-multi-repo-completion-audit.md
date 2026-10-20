# 多仓需求工作区：完成审计

> 2026-10-20 第二轮范围已扩展：默认值与直接创建、管理面板、成员增删与重新加入、富文本附件、根 AGENTS.md 与能力上下文预设。详见 [第二轮验收文档](./fork-orca34-multi-repo-v2-acceptance.md)。功能提交 `4c5a604a7d1f` 的完整 PR/Mobile 检查已通过；当前桌面宿主的 computer use 已恢复，2026-10-20 在用户批准显示隔离窗口后完成了核心原生流程验收。下文表格保留第一轮历史检查点，不能当作本轮完整能力清单；Cursor 专用接入、工作区插件隔离和本轮安装升级/回滚仍未完成。

更新日期：2026-10-19。产品安装检查点 `966a0f556fc3`；完整 CI 检查点 `a9f4fba5963`。

## 当前结论

**Codex 本机多仓第一版已进入人工业务验收阶段；扩展计划尚未全部完成。**
按[人工验收步骤](fork-orca34-manual-acceptance.md)操作，无需用户重跑全量测试或注入崩溃。

| 范围                                          | 当前状态                                                                                                                                                                                             | 尚待事项                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0–P3：创建、根 Agent、恢复、管理与保护性清理 | 已实现；真实 Git、Codex、隐藏 UI、profile 往返及故障边界有证据                                                                                                                                       | 用户确认实际业务使用流程                                           |
| P4：独立 macOS arm64 候选、升级/回退          | 第八候选已安装，安装演练通过；普通启动/终端用户截图通过                                                                                                                                              | 完整人工验收；全部 Keychain/TCC 路径未覆盖，ad hoc 包尚未 notarize |
| 完整 PR gate                                  | [PR Checks](https://github.com/34/orca/actions/runs/39196969863) 成功；pr.yml 的 verify / PR checks passed 对应 a9f4fba5963 成功；[Mobile](https://github.com/34/orca/actions/runs/39196969832) 成功 | 文档变更后的 gate 另行记录，不能混用 head                          |
| daemon 升级清理                               | 根因为测试先释放最后客户端/终端再认证清理，与自行退出相撞；顺序已修复                                                                                                                                | 5 轮共 25 次与完整测试均通过，当前无此项失败                       |
| Codex / Claude / Pi                           | Codex 已有真实多仓编辑与 Git 证据；Claude 按用户要求豁免，Pi 当前不接入                                                                                                                              | Codex 用户验收；不再将 Claude 登录列为阻塞                         |
| Cursor                                        | 当前多仓选择器/授权未接入                                                                                                                                                                            | 后续开发及真实 Agent 验证，不交给用户把未实现功能验成通过          |
| 线上 PR/MR                                    | 共用路由已有测试，全部真实线上流程未实操                                                                                                                                                             | 在获授权的真实评审流程补验                                         |
| 有限 P5                                       | 已按既有例外交付同步/切回步骤；未完成真实后续版本源码同步                                                                                                                                            | 后续安排同步演练；通信兼容通过不等于源码升级                       |
| 评审材料与发布                                | 本地 UI 截图已有，公开 PR 前后附件待补；PR 未合并、未发布包                                                                                                                                          | 补脱敏附件；继续遵守用户不合并/发布的要求                          |

五组单测 122,891 项通过；跨版本通信、E2E、布局、Git/shell 和 Linux/Windows 打包通过。
平台/opt-in 跳过仍存在。真实首启反馈只覆盖普通应用/终端，不扩大为所有系统授权。
后续源码相对已安装候选增加了异常 cause 保留，未改变关闭授权；其他变化主要为 CI、测试与文档。

下面保留历次阶段审计，早期的“等待推送”“等待首启”“Claude 阻塞”等状态已由本节更正。

## 2026-10-17 阶段证据与缺口（历史）

| 要求                                       | 本轮核对的证据                                                                                                              | 结论与下一步                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| P0 跨组 A/B、固定提交、原 checkout 不变    | plan.test.ts 的真实 Git A/B 测试；本轮 228 项通过                                                                           | 模块边界通过；应用层 A/B 与 diff/review 上下文另查                                                                             |
| 根 Agent 修改多个成员并执行 Git            | multi-repo-automatic-agent-verified.json 两仓提交 f1fe3316/57f32c1c；原权限验收记录                                         | 已有真实 Codex 证据；不代表所有 provider 均通过                                                                                |
| 创建预览与固定路径                         | multi-repo-create-preview-verified.json，api/web 固定 commit/path                                                           | 已有 UI 创建证据；第七候选中英文/深浅色预览及关键键盘交互通过，根 Explorer 与成员 editor/diff 本轮已实测；线上 review 仍待核实 |
| P2 重复请求、profile 权威与故障恢复        | 本轮 store/service/IPC 等 14 文件 228 测试；恢复矩阵逐边界真实强退记录                                                      | 测试、强退与第六候选真实 profile 往返证据已具备                                                                                |
| P3 改名、归档                              | multi-repo-root-settings-verify.json：journal/files 不变，取消归档，保留 18 会话                                            | 已有 UI 重启证据                                                                                                               |
| P3 停根、文件保护与部分删除                | multi-repo-agent-stop-result.json：实际 writer 停止、文件未删；恢复矩阵删除边界                                             | 已有真实停止/保护/恢复证据；其余服务种类不从此泛化                                                                             |
| P4 独立包身份                              | 本轮 multi-repo-final-package-identity.json：主包及 6 个嵌套 bundle ID、orca34 scheme、manifest、deep strict 签名           | 第六候选嵌套身份已有静态核查；当前第八候选构建/安装签名复验通过；真实 Keychain service/授权尚未验证                            |
| P4 升级与回退                              | orca34-install-candidate8 三阶段 evidence、对应旧包和配套 profile 备份                                                      | 隔离 profile 已通过；不等于日常默认 profile 首启                                                                               |
| P4 签名与权限                              | 当前构建明确 ad hoc；macos-daemon-tcc-attribution.md 规定其走 fork fallback                                                 | 不能声称 Developer ID 稳定 helper/TCC 路径通过；普通首启/终端等待人工检查                                                      |
| P5 有限同步                                | fork-orca34-upstream-sync.md 的固定查询证据与可执行步骤                                                                     | 按批准的无后续稳定 tag 例外交付；没有实际升级或远端 PR gate 通过的声明                                                         |
| 普通单仓/Folder Workspace、远端与 Git 兼容 | 历史专项测试及源码接入表                                                                                                    | 已补完整 Runtime、普通删除/持久化、Git 2.25 本机合约；跨平台完整 CI 仍未完成                                                   |
| Claude structured 实机回归                 | 既有真实测试因模型映射/rate_limit 失败                                                                                      | 未通过；不能改全局账号或降低测试预期来消除缺口                                                                                 |
| 完整 PR 检查                               | 当前 .github/workflows/pr.yml 含 preflight、Git compatibility、shell contracts、package/Linux/Windows、E2E、wire、verify 等 | 本机 typecheck/模块测试/arm64 构建不能替代完整 workflow；尚无精确当前 head 的远端通过证据                                      |

## 本轮执行

`pnpm test src/main/multi-repo-workspaces src/shared/multi-repo-workspaces
src/renderer/src/features/multi-repo-workspaces`：14 文件、228 项通过，日志
`.context/multi-repo-final-module-audit.log`；已恢复 Electron native runtime。
源码与候选构建 commit `b3ece9928cd7` 之间截至本轮只有验收文档差异，不需要仅为本次
审计重打包。实际安装路径 `~/Applications/Orca 34.app`，没有启动它或改变系统授权。

系统授权窗口可能影响桌面；遵守 AGENTS.md 的 Electron UI Validation，本轮未移除
mock-keychain 参数来触发原生授权。已请求用户方便时自行打开已安装应用、检查普通
终端并反馈结果；该人工结果尚未收到，也不能替代其余功能审计。

## 后续顺序

1. 键盘、中英文/深浅色、根 Explorer、成员 editor/diff 和真实 profile 往返已补验；review 共用路径为 mock transport 证据，未进行线上操作。
2. 普通 Runtime、删除/持久化、Git 2.25 和全部改动测试已补验；远端完整 PR workflow 仍待公开推送授权及实际执行。
3. 收集普通首启/终端的人工结果；如失败，按实际错误定位，不重置系统权限或借用官方身份。
4. 逐项关闭证据缺口后再判断日常版交付是否成立；保持 Goal active。

## 第六候选深浅色与键盘补验

在已安装第六候选、全新隔离 HOME/profile、mock-keychain 下，以 Playwright CDP 验证
浅色和深色。定位并赋予 DOM 焦点后，Enter 打开入口、Tab 从名称进入说明、键盘搜索
并选择仓库、Home/ArrowDown/Enter 选择跳过 setup、Enter 预览/返回、Escape 关闭均通过。
这不是从桌面起点连续 Tab 遍历或原生焦点测试，未显示或激活 OS 窗口。

两次预览 task 列表保持不变；对话框 clientWidth/scrollWidth 均 510，无横向溢出。
已查看两张截图，长路径换行、成员 commit/branch/setup 和两个操作按钮可见。
证据 `.context/multi-repo-keyboard-themes-evidence.json`、
`multi-repo-keyboard-themes-complete.log`（exit 0）、`multi-repo-keyboard-{light,dark}.png`。

早期尝试因首次功能提示拦截、Select 焦点调度及设置主题后未重新加载而失败，原日志
保留；最终测试仅在自身 profile 预置提示已读，并等待实际焦点及重载后的主题。
无产品代码改动。失败轮次遗留的专用 crashpad 经精确 profile/PID 核对后退出，最终
应用和专用 daemon 均退出；未变更日常 profile 或系统权限。

## 第六候选根 Explorer 与成员 editor/diff

新建隔离 profile 和两个不同项目组的本机源仓，创建 api/web 任务后分别修改成员
api.txt/web.txt。通过管理页真实按钮打开根，Explorer 显示 api、web、TASK.md 和 marker；
随后分别打开两个成员，文件列表只显示各自文件。可见 Monaco editor 的 data-uri 与
各自成员完整路径严格相等，实际渲染 modified api/modified web。

点击 Source Control 后分别显示 nav/api、nav/web 和对应文件 +1/-1；点击更改文件打开
diff，断言原始 original 和当前 modified 内容均出现，已检查截图。源 checkout 的文件
仍为 original，成员文件仍为 modified。没有提交、推送或线上 review 操作。

证据 `.context/multi-repo-navigation-fixture.json`、`multi-repo-navigation-initial.json`、
`multi-repo-navigation-editors.json`、`multi-repo-navigation-diff.log`（exit 0），以及
`multi-repo-navigation-{root,api-editor,web-editor,api-changes,web-changes,api-diff,web-diff}.png`。
初轮因 Monaco 空格渲染为 NBSP、切换后首个 editor 实为上一成员隐藏标签导致断言失败，
已保留日志；修正为规范化可见文本并核对当前可见 editor 精确 URI。没有修改产品实现。
应用使用隔离 HOME/profile/mock-keychain，窗口 invisible/unfocused，测试进程均退出。

## Profile 边界与核心注册回归

本轮 profile handler/持久化、preload 重启检查点、多仓 IPC/store 共 5 文件 70 项通过，
日志 `.context/multi-repo-profile-boundary-audit.log`。随后执行核心 handler 注册与退出
writer 测试，发现注册测试未 mock 新增多仓 registrar，首个用例因 Electron mock 缺少
ipcMain 中断，另外两个依赖初始化的测试连带失败。

按该文件现有 registrar mock 模式补齐接线，更新旧的直接回调预期；对应用重启和
profile 切换两种回调分别以未决 Promise 验证后续清理不能提前执行，释放多仓关闭后
才执行一次。修复后 2 文件 10 项通过，tc:node 与固定基线质量门通过，Electron native
runtime 已恢复。日志 `multi-repo-profile-wiring-{audit,fixed,tc,quality-final}.log`。
这是此前漏跑的接入回归缺口，现已修复；不是实际跨 profile 往返启动证据。没有修改
产品运行时代码，不影响当前第六候选的源码行为，仍需完成真实 profile 往返验收。

## 评审共用路径与 Git 2.25 基线

评审动作、点击路由、push target、creation eligibility、review creation/lookup 和 GitLab
merge-state 共 7 文件 103 项通过，日志 `multi-repo-review-context-audit.log`。包含 GitLab
现有 API/host capability 路由与旧上下文拒绝；使用 mock transport，不能据此宣称线上
GitHub/GitLab 账号、PR/MR 数据或真实网络调用已验证。

复用 `.github/actions/prepare-git-compatibility/action.yml` 的 Git 2.25.5 源码及固定
SHA-256 `41662c52fc16fec4963bfc41075e71f8ead6b5e386797eb6f9a1111ff95a8ddf`，在
`.context/git-compat-2.25.5/` 编译本机 arm64 测试二进制。未替换系统 Git；本次增加
NO_OPENSSL/NO_CURL 编译选项，只验证本地 Git 操作，不覆盖 HTTPS transport。

按 PR workflow 现有三份真实 Git 测试运行，36 项通过、1 项跳过；跳过项为 2.25 不支持
`rebase --update-refs` 的专用场景，由测试的窄 unsupported 检测触发。随后在同一二进制
优先 PATH/GIT_EXEC_PATH 下执行多仓主进程模块，10 文件 195 项全部通过；独立 Node
execFile('git', ['--version']) 确认命中 2.25.5。日志
`multi-repo-git225-{build,contract,module}.log`、`multi-repo-git225-environment.json`。
已恢复 Electron native runtime；本轮无源码修改。这是 macOS 本地基线证据，不替代
workflow 的 Linux 2.38/2.49 矩阵、Windows 打包或完整 PR verify gate。

## 普通 Runtime 与删除集成回归

完整入口 `pnpm test src/main/runtime/orca-runtime.test.ts` 通过 1392 项、跳过 1 项，
日志 `multi-repo-runtime-full-audit.log`。该入口加载普通本机创建、去重、SSH 生命周期、
终端、托管评审、删除/对账等片段，避免只筛选多仓用例。此处按 runner 汇总如实保留
跳过数，不声称所有可能的系统平台条件均已执行。

删除 safety/execution-host-route/authority/session-partition-fencing、local recovery、
watcher gate、Folder Workspace 持久化和真实 Git removal 共 8 文件 105 项通过，日志
`multi-repo-removal-integration-audit.log`。包括禁止以本机回答 SSH/runtime host、父子
工作树删除保护、普通 Folder Workspace 记录与真实磁盘删除；不是 Windows/SSH 实机测试。
Electron native runtime 已恢复，无产品代码变更。

## Fork CI 当前条件（只读查询）

2026-10-17 查询 `34/orca`：公开仓库，Actions enabled=true；main 仍为固定基线
b16a71c7fb04。返回的分支列表中未发现 34/local 或功能分支；最近工作流查询为空，
仓库 self-hosted runners 列表为空。现有 `.github/workflows/pr.yml` 的 code_paths、
preflight、unit runner 与 verify 使用 Blacksmith 标签，draft PR 的 code_paths 会跳过。
这些信息不足以证明 Blacksmith 服务不可用，也不足以证明完整 PR 检查可执行。
没有推送分支、创建公开 PR、更改 runner 配置或绕过 verify；完整 CI 仍未通过。

## 真实 profile 往返启动

第六候选在已有导航测试 profile 中通过正常 orcaProfiles.createLocal/switchProfile 接口
创建并切换第二本机 profile，再切回 local-default；没有改 index 或拦截 relaunch。
三个真实主进程 PID 91943 → 92824 → 93096。每次通过仅本机 Inspector 核对 userData
为同一测试目录、ORCA_BACKGROUND_LAUNCH=1、BrowserWindow invisible/unfocused，再用
Playwright CDP 读取当前 profile 和多仓 API。

第二 profile 的 repos/tasks 均为空；返回后任务列表与切换前 deepEqual，api/web 成员
modified 文件原样保留。最后从核对过 userData 的主进程正常 app.quit，并确认 PID 已退出，
停止该测试 profile 的 daemon。没有启动日常 profile 或触碰系统授权。

证据 `.context/multi-repo-profile-roundtrip-{intent,evidence}.json` 与
`multi-repo-profile-roundtrip.log`（exit 0）。此用例验证已就绪任务的正常往返隔离；
创建中的 drain 顺序由上一节的未决关闭回调与退出 writer 测试覆盖，不能扩大为所有
处理中操作的实机 profile 切换。测试使用接口切换，因为当前 multiProfileUi=false，
不声称 profile 菜单可见或已进行菜单点击验收。

## 完整 lint 审计发现（尚未全部通过）

首次 pnpm lint 在 anti-slop 报六处多仓参数 object 类型；改为复用现有
ProjectRuntimeResolutionStore，同时收紧 WeakMap 键。tc:node、11 文件 217 项相关测试、
固定基线 changed-code quality 均通过。esbuild 对三份源码与第六候选 commit 的编译输出
逐字比较一致，记录 multi-repo-owner-types-runtime-equivalence.json；这是类型边界修正。

复跑 lint 的 oxlint/anti-slop 通过，native plugins 因 mobile 四个文件的五条循环依赖
警告退出；这四个文件相对固定基线没有修改。保留完整失败，未修改规则或抑制警告。
单独执行余下所有 lint 脚本，除 localization coverage 外全部通过，逐项结果在
`.context/multi-repo-lint-remaining-results.json`。coverage 检出多仓界面硬编码文案，
属于本功能需要修复的问题，不能当作基线问题或已完成 UI。下一步复用既有翻译系统
补齐文案，再验证 UI/构建。完整 lint 与完整 CI 均未通过。

日志 multi-repo-full-lint-{audit,fixed}.log、multi-repo-owner-types-{tc,test,quality}.log
及 multi-repo-lint-verify-localization-coverage.log。没有推送或新建线上 PR。

## 本地化缺口已修复，第七候选已安装

源码 c005a01a94479c39ac4d009c2355285fb470b049 接入现有中英文翻译，阶段文案按
当前语言生成。renderer 与更新设置共 45 项测试、tc:web、changed quality、翻译
catalogs/extraction/coverage 通过；coverage 仅余 13 个既有 allowlist。四组中英文/
明暗主题隐藏 CDP 键盘流程通过，截图已目视检查，没有横向溢出。

第七候选完整构建、真实打包 PTY、签名与 DMG 校验通过，已在独立安装位置完成
第六 → 第七 → 第六及旧 profile → 第七往返；任务、成员分支和用户文件保留，
测试进程均退出。证据 multi-repo-localization-*.log、multi-repo-candidate7-artifacts.json
与 orca34-install-candidate7/。安装版本和摘要见安装回退文档。

前述本地化缺口不再待办；全量 lint 的既有 mobile 循环依赖、完整远端 CI、真实
普通首启授权及 Claude provider 相关限制仍未消除。没有推送或新建线上 PR。

## 全部改动测试与补充 preflight 检查

在 b0d12713c8 上，从固定基线的 diff 枚举全部 48 个新增/修改 `.test.*` 文件，
统一运行 `pnpm test`：47 文件通过、1 文件跳过，576 项通过、2 项跳过，退出码 0。
跳过的是未设置 ORCA_REAL_CODEX_CLI_TEST 的真实 CLI visuals；早前显式开启的通过
证据保留，本轮不重复计为实机通过。测试列表与结果分别保存为
`.context/multi-repo-changed-tests-list.json`、`multi-repo-changed-tests-result.json`，
完整日志 `multi-repo-changed-tests-combined.log`；测试后恢复 Electron native runtime。

同时执行 workflow 的 Zustand selector fanout、feature wall asset budget 和 macOS
entitlements 三项检查，全部通过，结果为 `multi-repo-preflight-extra-results.json`。
这些检查没有绕过既有 mobile lint 错误，不代表完整 PR aggregate 已通过。
本轮无产品源码变化，已装第七候选无需重新打包。

## 完整 lint 阻塞已修复

确认 PR workflow 也扫描 mobile 后，消除既有 context/hooks 与终端 geometry/selection
循环依赖：共享 context、格子读数和选区计算分别移至叶子模块，旧入口保留导出，
无交互算法修改。Web provider 重连测试现在直接连接真实 context，无循环 mock。
生成的 WebView 脚本已刷新，输入数新增两个本地计算模块，依赖/可复现检查保留。

完整 `pnpm lint` 退出 0；mobile 73 文件 684 项测试、产品类型检查、lint、测试类型
ratchet 以及固定基线 changed quality 通过。直接全测试 typecheck 仍有既有
grandfathered 文件错误，不称其全部通过。证据 multi-repo-full-lint-final.log、
multi-repo-mobile-cycle-{tests-final,tc-final,mobile-lint,test-tc-ratchet}.log。

本地全量 lint 不再阻塞。远端完整 CI、普通首启授权、Claude provider 问题仍待；
因 mobile 资源变化需要候选 8，当前已安装包仍为候选 7。

## 第八候选构建与安装复验

966a0f556fc3 构建成功，已安装版本为
`1.4.214-local.1792185668342.966a0f556fc3.orca34`。第七 → 第八 → 第七及配套
profile → 第八三个阶段的任务与 Git/用户文件核对全部通过；签名与 DMG 完整性
检查通过，测试进程已退出。证据 multi-repo-fork-builder-candidate8.log、
multi-repo-candidate8-artifacts.json、orca34-install-candidate8/。
当前剩余阻塞为公开推送/PR 检查的确认与实际执行、普通首启授权反馈，以及真实
Claude provider 模型映射/限流。完整本地 lint 已通过，不能继续将其列为阻塞。

## 2026-10-19 用户验收范围更新

用户明确暂时忽略真实 Claude 测试，没有 Claude 订阅/使用需求。其历史失败不再
阻塞当前验收。Codex 保留为已验证主路径；Cursor 是用户计划使用的 Agent，但当前
多仓选择器和终端授权仅接入 Codex/Claude，Cursor 多仓根启动仍需接入与验证。
Pi 当前不使用，不纳入本轮实现。公开推送授权及普通首启反馈仍待用户处理。

## 2026-10-19 普通首启/终端人工反馈

用户从桌面操作后反馈正常并提供截图：ORCA34_TERMINAL_OK 输出、正确仓库 cwd、
Git 干净状态及返回 shell 提示符均可见。只读进程核对 Orca 34 安装路径正在运行。
普通首启/新终端验收获得人工证据；不把它扩大为所有系统授权路径验证。
用户已授权公开推送和 PR 检查，禁止合并/发布安装包；此前等待确认不再阻塞。

## PR #1 已建立，首轮远端检查暴露并修复测试接线

PR：https://github.com/34/orca/pull/1，base=34/local。用户禁止合并或发布包。fork
Actions 总开关已开启，仅保留 PR/Mobile 与必要调用依赖，其余 88 个继承工作流禁用。
首轮 PR 等待 Blacksmith；已为本 fork 改用 GitHub 托管 runner，保留完整 gate。
Mobile 首轮 5 文件/45 项失败源于 context 迁移后录制 harness 仍加载旧局部变量；
修复后相关 1785 项本地通过、3 跳过，仍需新 head 的远端复验。当前不宣称 CI 通过。

## 第二轮 CI：Mobile 通过，补齐 fork 跨版本基线

1f6c8c2f70 的 Mobile Checks 39189653473 已通过；完整 PR Checks 39189653480
仍在执行。跨版本任务因 fork 没有发布标签而失败。新增仅 34/orca 生效的上游
发布标签 fetch，保留所有兼容旅程及汇总要求，不创建远端标签或发布包。
本地获取 v1.4.229 后，daemon 协议升级/回退与 48 项 CI/协议脚本测试通过。
仍必须用修复后精确 PR head 的完整远端结果验收。

## 完整 PR 首轮结果与集中修复

39189653480 的完整汇总失败。已修复 SQLite 测试运行环境登记、fork runner
表达式识别、仅断言批处理内容的测试登记、跨平台目录顺序断言，以及多仓侧栏
行为变化对应的旧测试。相关 116 项、未读 22 项、跨版本导出迁移 8 项通过。
macOS 启动器夹具补 Info.plist 与真实路径；两个 macOS 专属用例保留本机执行，
Linux 显式跳过。AppImage 升级用例转 Node 以复验 Bun 认证清理差异假设，安全
归属检查未改；仍须远端 Linux 实测确认。所有改动仅测试/CI/文档，候选八代码不变。

## 第三轮 CI：仅剩另一真实 daemon 升级测试的运行环境

4e5cf47ce2e 的完整跨版本、平台打包、E2E、布局和四组单测通过，第二组仅
Electron→Node daemon 升级的两个 Bun 清理用例失败。AppImage 对应用例在 Node
远端两项均通过。新增守卫先发现六个真实 daemon 清理消费者漏登记 Node，再补齐，
本地 14 项边界测试及质量检查通过。五个 opt-in 集成文件的运行资格保持原状，
不将登记修正记为已运行。仍待修复后 head 的完整 PR 汇总。

## daemon 清理的最终诊断方向

Node 中也复现了相同失败，运行环境登记不是完整根因。短反馈 CI 取到原始
ECONNRESET / ECONNREFUSED：测试先释放最后窗口并杀终端，随后认证清理正与
空闲 daemon 的自行退出相撞。调整夹具为先认证关闭 daemon，再回收终端/窗口，
不改变产品归属验证或 PID 停止策略。认证错误保留 cause，重复升级检查先于全量
分组执行；连续通过及完整汇总仍待新提交远端结果。
