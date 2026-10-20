# Orca 34 安装包隔离核对

最新安装状态（2026-10-17）：b3ece9928cd7 的第六 arm64 候选已安装到
`~/Applications/Orca 34.app`，旧→新→旧（配套恢复旧数据）→新演练通过，应用已退出。
具体版本、校验摘要、备份和限制见 [安装与回退](fork-orca34-install-and-rollback.md)。
以下条目保留各阶段审计背景；真实 Keychain/Developer ID/TCC 与普通默认 profile 首启仍未验收。

本文件记录 P4 的源码核查与验收门槛，不代表安装包已可交付。开发基线为
`b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。当前隐藏开发实例使用独立
`.context/orca34-dev-profile`；该环境变量不能代替安装包自身的身份隔离。

## 固定目标

| 项目           | Orca 34 目标       | 约束                                                             |
| -------------- | ------------------ | ---------------------------------------------------------------- |
| 产品名         | Orca 34            | 菜单、About、bundle 一致                                         |
| bundle ID      | com.orca34.desktop | 不使用官方签名标识，不借用官方授权                               |
| 默认数据目录名 | orca34             | 在首次持久化路径捕获前确定；不复制正式 profile                   |
| URL scheme     | orca34             | 不注册/抢占官方 orca scheme                                      |
| 对外 CLI       | orca34             | 不覆盖全局 orca；任务内既有 wrapper 仍可叫 orca                  |
| 更新方式       | 手动               | 自动检查、菜单检查、下载、安装和 release 选择均不得套用官方 feed |
| 首发架构       | macOS arm64        | 版本使用真实上游版本加 fork 迭代，保留基线与 commit 清单         |

## 已核查的实际接入点

| 源码                                                                                                                       | 当前行为与下一步                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/electron-builder.config.cjs`                                                                                       | appId、productName、protocols、publish 指向官方；新增继承配置，覆盖有限字段而不复制回调。检查内层 mac 配置的产物名和签名政策，不能只覆盖顶层。                                                                                                            |
| `config/scripts/macos-terminal-host-bundle.cjs`                                                                            | helper 的 CFBundleIdentifier 从主 app Info.plist 读取；可复用。保持签名和架构校验，不另造 helper。                                                                                                                                                        |
| `config/scripts/mac-build-compatibility.cjs`                                                                               | 原先总写官方 contract appId；本轮改为接收 packager.appInfo.id，官方默认不变。运行时 contract 已按编译身份选择 appId。                                                                                                                                     |
| `src/shared/local-build-compatibility-contract.ts` 及生成 JSON                                                             | runtime 已从 build-distribution 选身份，JSON 保留官方基准；builder 清单使用实际包 ID。协议版本保持不变。                                                                                                                                                  |
| `src/main/startup/dev-instance-identity.ts`                                                                                | 已读统一构建身份；保留 shouldApplyPreReadyAppName 对 packaged 的现有行为，Keychain 仍依赖实际 bundle 名，尚待包内验证。                                                                                                                                   |
| `src/main/startup/main-process-preflight.ts`                                                                               | configureDevUserDataPath/configureOrcaUserDataPathEnv 后即 initDataPath；fork 默认目录已在这之前配置，所有 profile/cache/服务沿用捕获的路径；开发显式 override 继续有效。                                                                                 |
| `src/main/startup/main-process-ready-foundation.ts`                                                                        | ready 后 setAppUserModelId/setName 来自 devInstanceIdentity；来源已修正，不增加第二次路径捕获。                                                                                                                                                           |
| `src/main/daemon/macos-daemon-launchd.ts`                                                                                  | AssociatedBundleIdentifiers 使用 compatibility contract；已跟随编译后的 fork bundle ID，尚待真实 launchd 验证。                                                                                                                                           |
| `src/main/daemon/macos-daemon-job-label.ts`                                                                                | 前缀已使用产品 appId，尾部仍含 profile 路径 hash 和协议；现有恢复/停止复用同一 label 函数。不得扫描/停止官方作业。                                                                                                                                        |
| `src/main/daemon/macos-daemon-bundle.ts`                                                                                   | copy 位于 userData/daemon-host；隔离 userData 后可复用。须实测签名 helper 和 ad hoc fork fallback，不能宣称 ad hoc 等价于 Developer ID TCC 验证。                                                                                                         |
| `src/main/cli/cli-install-location.ts`、`cli-install-constants.ts`、`cli-command-installation.ts`                          | 注册层已从编译身份取 orca34/orca34-dev。mac/Linux 外部链接与 Windows 独立 forwarder 不覆盖官方命令；fork 跳过 Linux legacy cleanup，保留包内/profile 内 orca。CLI 自身默认数据目录、tsc 编译身份及开发 wrapper 已接通；实际包内启动器路径仍待候选包验证。 |
| `src/main/updater/updater-setup.ts`、`updater-menu-checks.ts`、`updater-download-install.ts`、`updater-build-selection.ts` | 已用编译身份的 automaticUpdates 政策拦住初始化、后台检查、菜单、release 列表、下载/安装与 Linux 恢复入口；错误卡不再引导官方发布页。作为服务器的 fork 返回既有 manual-service-update-required；客户端管理其他远端的能力保留。                             |
| `src/shared/pairing.ts`、web pairing、`src/main/window/macos-desktop-handoff.ts`                                           | orca URL 同时用于 pairing 数据格式和桌面 deep link；不能全局替换字符串。桌面 handoff 与分享解析已读编译身份的 orca34 scheme，旧 orca 分享链接仍可解析；pairing payload 保持 orca://pair。OS 注册待 fork builder。                                         |
| `src/main/macos-tcc-prompt-watch.ts`、`macos-press-and-hold-default.ts`                                                    | 已从编译身份选择 bundle ID；fork 不读写官方 defaults 域，TCC 仅匹配自身及既有六种 helper/dev/local 变体。真实权限提示归属待包内验收。                                                                                                                     |

## 候选包证据要求

1. 同一份构建身份在 builder、主进程、CLI、daemon、兼容性清单中一致；普通官方构建的现有测试继续通过。
2. 安装候选包前先检查实际 app Info.plist、主 executable、嵌套 helper、签名、资源架构和 manifest。仅改文件名或环境变量不算通过。
3. 后台启动候选包，确认 canonical userData/profile、Keychain service 名、daemon endpoint/job label、URL 注册和 CLI 都属于 fork；正式应用和配置没有写入。
4. 明确关闭官方 updater 的所有入口，点击检查更新不能访问官方 feed 或安装官方包；不用取消签名验证绕过限制。
5. 保留 A/B 两个候选包与关闭后的隔离 profile 备份，实际进行升级/回退，成员 Git 文件不回滚或丢失；旧包不能直接写新版状态。
6. Developer ID 不可用时如实记录 ad hoc 限制。不能以 ad hoc fallback 通过来证明稳定 helper/TCC 升级路径通过。

安装、回退、上游同步候选包和完整 PR aggregate gate 的证据仍待取得；此文件不放宽已批准设计的验收标准。

## 编译身份接入状态（2026-10-17）

`ORCA_BUILD_DISTRIBUTION=orca34` 是编译开关；普通构建无开关继续使用官方身份。
运行时继承同名环境变量不能改变产品。`src/shared/build-distributions.json` 是
build/runtime 共用定义，当前贯通名称、默认数据目录、兼容性 appId 和 launchd 标识。
主构建生成 `out/main/orca-build-distribution.json`；builder 的 beforePack 会拒绝
Orca 34 主产物与官方包配置混用，以及独立包缺少匹配编译证据的情况。

已实际编译 fork 主进程并验证上述拒绝路径，随后恢复普通构建。
尚未提供可交付的 fork builder，CLI/scheme 隔离和安装包实测仍是阻塞交付的未完成工作。

## 手动更新政策（2026-10-17）

官方构建保持 automaticUpdates=true，Orca 34 为 false。策略来自同一编译身份，
后台不启动 updater 或定时检查；主动检查、下载、安装收到明确手动安装说明。
底层 updater 加载也设防，release 枚举和 Linux package 恢复不得绕过公共入口。
设置页保留远端管理，只去掉本机自动更新操作；错误卡不提供官方包链接或无效重试。
远端 RPC 沿用已有手动更新状态，无新 wire 字段或枚举。

单元回归已覆盖这些入口与官方默认路径，实际 fork 包和隐藏 renderer 的验证仍待候选包阶段。

## CLI 注册隔离状态（2026-10-17）

临时真实文件测试已验证 fork macOS 注册/卸载不修改官方 orca，Linux 不清理旧 orca，
Windows forwarder/PATH 仅管理独立目录；AppImage CLI cache 改为 orca34/appimage。
较宽的旧 launcher 识别仅用于官方发行版，fork 遇到其他目标或脚本保持 conflict。
当前限制：搬迁 fork 后旧目标未做 bundle 所有权验证，因此不自动接管旧链接。

tsc CLI 的编译身份、metadata 默认路径和开发 wrapper 已在后续接通；
macOS 包内脚本的 MacOS/Orca 名称仍须与最终 builder executableName 对照。
未安装全局命令或触碰正式 profile。

## CLI 编译与实例路由（2026-10-17）

CLI prepare 阶段向 tsc 生成的 CommonJS 身份模块写入固定常量，同时生成
out/cli/orca-build-distribution.json，包含身份模块与定义文件的摘要。运行时环境变量
不能改变选择；缺失/损坏/过期 marker 拒绝读取。既有不含身份模块的官方旧产物兼容。
beforePack 同时校验 main/CLI 身份，fork 缺 CLI 证据或与官方混用时拒绝。

CLI metadata 和启动默认 profile 选择 orca34/orca34-dev；显式 ORCA_USER_DATA_PATH
继续支持 profile 路由。开发脚本读取编译记录选择命令和默认目录，任务内 orca alias 保留。
ORCA_SKIP_DEV_CLI_INSTALL=1 可在验证构建时禁止全局 symlink 写入；默认官方行为不变。
实际分别编译 fork/官方 CLI，验证默认目录、固定身份、摘要与包装拒绝，最终恢复官方输出。
这些证据仍不替代独立候选包的安装、URL、daemon 和升级/回退验收。

## 桌面链接与 macOS 域（2026-10-17）

urlScheme 已加入统一构建身份。fork 的 sidecar handoff 生成 orca34://skills/share/…，
解析使用相同路径/ID 校验；旧 orca 分享 URL 仍可手工导入，官方构建不接收 fork scheme。
配对二维码维持旧协议，不能全局替换为 fork scheme。fork builder 尚未注册 OS scheme。

Press-and-hold 仍先核验实际 Info.plist 标识，只认当前产品 bundle ID 及其点分后缀；
fork 收到官方域时在 read/write defaults 之前拒绝。TCC watcher 仅变更归属筛选，不触发
任何权限请求或改变 helper 签名。测试使用注入 host/捕获日志形状，没有写真实 defaults。

下一步 builder 还需核查原 mac release team ID 校验、嵌套 Computer Use helper 的固定
身份及签名回调；不能仅覆盖顶层 appId 后宣称全部权限身份已隔离。

## 独立候选配置（2026-10-17）

入口 `pnpm run build:mac:orca34`，需 macOS arm64、干净源码工作树。脚本复用上游
build:desktop 与现有原生构建脚本（单架构），固定 fork 编译身份、实际基线版本加 local 时间/commit/orca34
后缀、完整源码 SHA、后台启动和禁止开发全局 CLI 安装，最后 publish never。
继承 `config/electron-builder.config.cjs` 的独立配置位于 `config/electron-builder.orca34.cjs`，
只覆盖产品身份/scheme/output/manual publish/arm64 target 和少量包装回调。

实际 builder 会用 executableName 命名 app，因此已改为 Orca 34；包内 CLI 从
Info.plist 读取 CFBundleExecutable，官方 Orca 与含空格的 Orca 34 均有真实 shell 测试。
Computer Use helper 在打包副本中改为 com.orca34.desktop.computer-use，随后调用
原 afterPack 重新签名并完成原校验；运行时读不到该 helper ID 时也不退到官方 ID。
主程序和辅助程序使用显式 ad hoc 签名，拒绝官方 release 身份开关；不能用这一候选
证明 Developer ID 稳定 helper/TCC 路径。包内 orca34-build.json 保存 baseline/SHA/版本/
架构/签名模式。`.context`、dist、out/bin 开发 wrapper 均被排除。

配置测试与类型/质量检查已通过；实际构建、包内校验及独立安装已完成，最新状态见上方安装记录。

候选 runner 使用现有 `--single-arch` 参数构建键盘/通知 helper，并为 Computer Use
提供同样选项；通知 helper 的内嵌 ID 显式为 com.orca34.desktop。官方原生脚本默认
仍生成双架构。Computer Use 产物路径从 Swift --show-bin-path 查询，各 slice 分别保存。
本机缺少 x86_64 Swift compatibility archives，arm64 三个 helper 已实际编译/验证。
移动独立依赖需先 `pnpm --dir mobile install --frozen-lockfile`，保持移动资源门槛。

第一次完成 DMG/ZIP 的构建（bcc9dae6c8）实际生成了 Orca.app，未用于安装，已移到
.context/rejected-orca34-bcc9dae6c8。虽然 daemon/PTY/签名校验通过，它不能满足独立
应用文件名要求。修正后将重建；terminal host 的显示名也跟随实际父 bundle。

第三次候选（de823e43c478）已实际生成 Orca 34.app、DMG、ZIP，静态身份/scheme/辅助程序/
arm64/签名/CLI/asar 隐私排除及 DMG 校验通过，证据见 Goal 的候选记录。
启动审查随后修复显式 --user-data-dir 被 fork 默认目录覆盖的问题；该旧候选未含修复，
不会直接用于隔离启动或日常安装。仍需重建并验收真实 profile、会话、权限及升级回退。

第四次候选（41b9b2c8f67b）已含显式 profile 修复，版本
1.4.214-local.1792176933068.41b9b2c8f67b.orca34；DMG/ZIP 签名、摘要、身份与
来源检查完成，完整摘要记录见 Goal。实际包已通过隐藏 Playwright CDP 启动及重启，
运行时 name/version、临时 HOME/userData、多仓 API 和不可见/未聚焦窗口断言通过。
验收必须同时复用 E2E HOME 隔离和 getElectronIsolatedKeychainArgs：仅更改 HOME
不能阻止 macOS Keychain 同步授权。首次遗漏该参数的等待已留 sample，不作为成功证据。
此处使用模拟 keychain 和 E2E profile 覆盖，并预置临时按键偏好记录以跳过 defaults；
普通 profile 路由、真实权限、独立安装及升级回退仍待验收，不能从隐藏启动结果推断。
