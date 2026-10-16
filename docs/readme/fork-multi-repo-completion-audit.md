# 多仓需求工作区：完成审计

审计日期：2026-10-17；源码检查点 `202252491f`。结论：**尚未证明完整完成**。
本表按批准设计第 10–11 节核对，不能把历史阶段日志中的“下一步”当作当前缺陷，
也不能把单元测试或隐藏启动扩大为真实系统权限、跨平台或完整 CI 已通过。

## 当前证据与缺口

| 要求 | 本轮核对的证据 | 结论与下一步 |
| --- | --- | --- |
| P0 跨组 A/B、固定提交、原 checkout 不变 | plan.test.ts 的真实 Git A/B 测试；本轮 228 项通过 | 模块边界通过；应用层 A/B 与 diff/review 上下文另查 |
| 根 Agent 修改多个成员并执行 Git | multi-repo-automatic-agent-verified.json 两仓提交 f1fe3316/57f32c1c；原权限验收记录 | 已有真实 Codex 证据；不代表所有 provider 均通过 |
| 创建预览与固定路径 | multi-repo-create-preview-verified.json，api/web 固定 commit/path | 已有 UI 创建证据；键盘、深浅色和成员 Explorer/diff 的覆盖仍需逐项核实 |
| P2 重复请求、profile 权威与故障恢复 | 本轮 store/service/IPC 等 14 文件 228 测试；恢复矩阵逐边界真实强退记录 | 测试与强退证据成立；profile 实际切换证据需单独核对 |
| P3 改名、归档 | multi-repo-root-settings-verify.json：journal/files 不变，取消归档，保留 18 会话 | 已有 UI 重启证据 |
| P3 停根、文件保护与部分删除 | multi-repo-agent-stop-result.json：实际 writer 停止、文件未删；恢复矩阵删除边界 | 已有真实停止/保护/恢复证据；其余服务种类不从此泛化 |
| P4 独立包身份 | 本轮 multi-repo-final-package-identity.json：主包及 6 个嵌套 bundle ID、orca34 scheme、manifest、deep strict 签名 | 当前已装第六候选通过静态核查；真实 Keychain service/授权尚未验证 |
| P4 升级与回退 | orca34-install-candidate6 三阶段 evidence、对应旧包和配套 profile 备份 | 隔离 profile 已通过；不等于日常默认 profile 首启 |
| P4 签名与权限 | 当前构建明确 ad hoc；macos-daemon-tcc-attribution.md 规定其走 fork fallback | 不能声称 Developer ID 稳定 helper/TCC 路径通过；普通首启/终端等待人工检查 |
| P5 有限同步 | fork-orca34-upstream-sync.md 的固定查询证据与可执行步骤 | 按批准的无后续稳定 tag 例外交付；没有实际升级或远端 PR gate 通过的声明 |
| 普通单仓/Folder Workspace、远端与 Git 兼容 | 历史专项测试及源码接入表 | 本轮模块测试不覆盖全部接入，最终需匹配具体回归和 Git 2.25 合约证据 |
| Claude structured 实机回归 | 既有真实测试因模型映射/rate_limit 失败 | 未通过；不能改全局账号或降低测试预期来消除缺口 |
| 完整 PR 检查 | 当前 .github/workflows/pr.yml 含 preflight、Git compatibility、shell contracts、package/Linux/Windows、E2E、wire、verify 等 | 本机 typecheck/模块测试/arm64 构建不能替代完整 workflow；尚无精确当前 head 的远端通过证据 |

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

1. 核对并补做隐藏 renderer 的键盘、深浅色、Explorer/成员 diff/review 上下文与 profile 切换证据。
2. 核对普通创建/删除、远端拒绝、Git 版本、构建身份各接入回归；明确完整 PR workflow 执行条件。
3. 收集普通首启/终端的人工结果；如失败，按实际错误定位，不重置系统权限或借用官方身份。
4. 逐项关闭证据缺口后再判断日常版交付是否成立；保持 Goal active。
