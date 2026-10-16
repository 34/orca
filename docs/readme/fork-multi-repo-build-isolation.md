# Orca 34 安装包隔离核对

本文件记录 P4 的源码核查与验收门槛，不代表安装包已可交付。开发基线为
`b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。当前隐藏开发实例使用独立
`.context/orca34-dev-profile`；该环境变量不能代替安装包自身的身份隔离。

## 固定目标

| 项目 | Orca 34 目标 | 约束 |
| --- | --- | --- |
| 产品名 | Orca 34 | 菜单、About、bundle 一致 |
| bundle ID | com.orca34.desktop | 不使用官方签名标识，不借用官方授权 |
| 默认数据目录名 | orca34 | 在首次持久化路径捕获前确定；不复制正式 profile |
| URL scheme | orca34 | 不注册/抢占官方 orca scheme |
| 对外 CLI | orca34 | 不覆盖全局 orca；任务内既有 wrapper 仍可叫 orca |
| 更新方式 | 手动 | 自动检查、菜单检查、下载、安装和 release 选择均不得套用官方 feed |
| 首发架构 | macOS arm64 | 版本使用真实上游版本加 fork 迭代，保留基线与 commit 清单 |

## 已核查的实际接入点

| 源码 | 当前行为与下一步 |
| --- | --- |
| `config/electron-builder.config.cjs` | appId、productName、protocols、publish 指向官方；新增继承配置，覆盖有限字段而不复制回调。检查内层 mac 配置的产物名和签名政策，不能只覆盖顶层。 |
| `config/scripts/macos-terminal-host-bundle.cjs` | helper 的 CFBundleIdentifier 从主 app Info.plist 读取；可复用。保持签名和架构校验，不另造 helper。 |
| `config/scripts/mac-build-compatibility.cjs` | 原先总写官方 contract appId；本轮改为接收 packager.appInfo.id，官方默认不变。运行时 contract 已按编译身份选择 appId。 |
| `src/shared/local-build-compatibility-contract.ts` 及生成 JSON | runtime 已从 build-distribution 选身份，JSON 保留官方基准；builder 清单使用实际包 ID。协议版本保持不变。 |
| `src/main/startup/dev-instance-identity.ts` | 已读统一构建身份；保留 shouldApplyPreReadyAppName 对 packaged 的现有行为，Keychain 仍依赖实际 bundle 名，尚待包内验证。 |
| `src/main/startup/main-process-preflight.ts` | configureDevUserDataPath/configureOrcaUserDataPathEnv 后即 initDataPath；fork 默认目录已在这之前配置，所有 profile/cache/服务沿用捕获的路径；开发显式 override 继续有效。 |
| `src/main/startup/main-process-ready-foundation.ts` | ready 后 setAppUserModelId/setName 来自 devInstanceIdentity；来源已修正，不增加第二次路径捕获。 |
| `src/main/daemon/macos-daemon-launchd.ts` | AssociatedBundleIdentifiers 使用 compatibility contract；已跟随编译后的 fork bundle ID，尚待真实 launchd 验证。 |
| `src/main/daemon/macos-daemon-job-label.ts` | 前缀已使用产品 appId，尾部仍含 profile 路径 hash 和协议；现有恢复/停止复用同一 label 函数。不得扫描/停止官方作业。 |
| `src/main/daemon/macos-daemon-bundle.ts` | copy 位于 userData/daemon-host；隔离 userData 后可复用。须实测签名 helper 和 ad hoc fork fallback，不能宣称 ad hoc 等价于 Developer ID TCC 验证。 |
| `src/main/cli/cli-install-location.ts`、`cli-install-constants.ts`、`cli-command-installation.ts` | mac command path 和名称固定 orca，Linux 有 orca-ide 与旧 orca 清理逻辑。fork 必须使用独立名称且不能进入官方旧 launcher 清理路径；保留 profile 内 wrapper 路由。 |
| `src/main/updater/updater-setup.ts`、`updater-menu-checks.ts`、`updater-download-install.ts`、`updater-build-selection.ts` | 仅禁初始化不够：菜单、选择 release、下载和安装是独立入口。使用统一手动更新政策拦住全部安装路径，并给 UI 明确状态。远端 server 更新是另一能力，不顺手禁掉。 |
| `src/shared/pairing.ts`、web pairing、`src/main/window/macos-desktop-handoff.ts` | orca URL 同时用于 pairing 数据格式和桌面 deep link；不能全局替换字符串。注册和桌面 handoff 用独立 scheme，保留旧 pairing payload 的解析兼容。 |
| `src/main/macos-tcc-prompt-watch.ts`、`macos-press-and-hold-default.ts` | 有官方 bundle ID 白名单/偏好域，需要核对 fork 的权限提示归属和键盘偏好；不写官方 defaults 域。 |

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
尚未提供可交付的 fork builder，CLI/scheme/updater 隔离和安装包实测仍是阻塞交付的未完成工作。
