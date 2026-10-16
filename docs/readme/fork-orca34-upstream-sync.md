# Orca 34：上游同步与切回官方

## 当前结论（2026-10-17）

本次没有后续官方稳定 tag 可供升级。没有创建同步合并、推送 PR、运行远端 PR gate，
也没有把本地测试或安装回退演练记成官方版本升级。

| 核验项                      | 结果                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| 本地开发基线                | `b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`，2026-10-16 09:52:22 UTC                              |
| 最新官方稳定 release        | [v1.4.227](https://github.com/stablyai/orca/releases/tag/v1.4.227)，2026-10-16 03:42:35 UTC 发布 |
| release commit              | `f51e82c4c26745f6a15e215e4391f533327697e2`，2026-10-16 02:23:55 UTC                              |
| 基线与 release 的共同祖先   | `65580c5315e2aecc1eb9876cbab65093e3627f50`                                                       |
| 基线独有 / release 独有提交 | 1289 / 76；该旧 release 不是本次主线基线的后续版本                                               |
| 当时官方 main               | `33fd7d39918112a025fafb22774185a6696a4a77`；main 不等于稳定 release                              |
| 功能快照                    | `2f50c099de`；安装候选仍来自 `21ed142255`                                                        |

证据：`.context/multi-repo-upstream-v1.4-tags.txt`（221 个稳定 v1.4 tag，另有预发布 tag）、
`multi-repo-upstream-releases.json`、`multi-repo-upstream-main-head.txt`。
只查询了明确的 tags 命名空间、main 和 10 条 release，没有逐 ref 扫描文件树。
符合 [Goal 交接](fork-multi-repo-workspaces-goal.md) 的无后续 tag 例外：交付以下步骤，
不等待未来发布，不将同一 SHA 或旧版本合并冒充升级。

## 接入点与冲突检查

独立实现主要在 `src/main/multi-repo-workspaces/`、
`src/shared/multi-repo-workspaces/`、`src/preload/api/multi-repo-workspaces-{api,bridge}.ts` 和
`src/renderer/src/features/multi-repo-workspaces/`。

| 接入区域                                          | 必须保留的行为                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| runtime 本地创建、materialization、lineage        | 内部 task/member placement；固定 commit/路径；预分配实例；保留分支；普通创建仍走上游路径   |
| workspace-creation 与 setup provisioning          | 文件准备和未启动 setup 回执先持久化；setup token/terminal handle 不变；分屏传递同一 handle |
| Claude/Codex structured launch、terminal launch   | 根工作区对成员目录和 Git metadata 的精确授权；继续复用上游会话，不启动子 Agent             |
| worktree removal、teardown、watcher-removal-gate  | 根会话严格停机；父子目录启动门禁；删除中重新核验；等待真正删除完成；不强制删除             |
| main 初始化与退出、preload                        | profile 唯一 owner、drain/关闭、严格 IPC；不得接受远端裸 placement                         |
| renderer 入口、命令面板、sidebar                  | 创建/管理对话框；就绪后打开根；普通分组中的 Folder Workspace 可见；无独立状态来源          |
| build distribution、startup、daemon、CLI、updater | 独立 appId/userData/daemon/CLI/scheme；禁止官方更新 feed；无 fork 配置时保持官方默认       |
| 既有修复与测试                                    | 逐项阅读，不能因不在多仓目录就丢弃；结构化会话和终端相关修复也在当前分支内                 |

在 `2f50c099de` 相对固定基线的差异中，有 106 个既有文件修改、86 个新增文件（含测试、
文档及构建隔离），显著超过最初 10–20 个接入文件的估计。不能声称只有十几个接入点。
完整路径清单为 `.context/multi-repo-integration-files.txt`，可用以下命令从任一 checkout 重建：

```sh
source .context/multi-repo-env.sh
git diff --name-status b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122 2f50c099de
```

## 有新稳定版本后的本地步骤

以下为 macOS 当前工作树使用的 shell 命令。先完成正在运行的任务，退出待替换的 fork
及其 daemon，并按 [安装与回退说明](fork-orca34-install-and-rollback.md) 备份独立 profile。
工作树必须干净；不要使用 stash、reset 或强推掩盖未知改动。

1. 查询 release，明确选择已发布、非预发布且晚于当前基线的稳定 tag。
   检查目标仍包含所依赖的 runtime 拆分和 daemon 能力，不仅比较版本号。

```sh
source .context/multi-repo-env.sh
gh api 'repos/stablyai/orca/releases?per_page=10' --jq '.[] | select(.draft == false and .prerelease == false) | {tag_name,published_at,target_commitish}'
```

2. 设置 `ORCA_SYNC_TAG` 为已核验的 tag。只 fetch 该 tag；在当前主工作目录切换到独立
   sync 分支，不创建第二个 checkout，不更改 `origin`/`fork` 或官方默认分支。

```sh
source .context/multi-repo-env.sh
: "${ORCA_SYNC_TAG:?Set the verified stable tag first}"
git status --short
git fetch --no-tags origin "refs/tags/${ORCA_SYNC_TAG}:refs/tags/${ORCA_SYNC_TAG}"
git log -1 --format='%H %cI %s' "$ORCA_SYNC_TAG"
git rev-list --left-right --count "34/multi-repo-workspaces-v1...${ORCA_SYNC_TAG}"
git switch -c "34/sync-${ORCA_SYNC_TAG}" 34/multi-repo-workspaces-v1
git merge --no-ff --no-commit "$ORCA_SYNC_TAG"
```

有冲突时先处理接入表中的契约，再处理测试。不要整文件选 ours/theirs；不要修改
schemaVersion 来绕开已有任务校验。放弃演练时，在确认没有新增用户修改后使用
`git merge --abort` 返回合并前状态，保留原功能分支。正式集成分支若已发布，只 merge，
不反复 rebase/force-push。

3. 安装目标 lockfile 的依赖，运行相关测试和静态检查；所有应用和测试保持后台。
   runtime 的 `.spec.ts` 片段由 `orca-runtime.test.ts` 导入，不能单独传片段路径后宣称通过。

```sh
source .context/multi-repo-env.sh
pnpm install --frozen-lockfile
pnpm tc
pnpm test src/main/multi-repo-workspaces src/renderer/src/features/multi-repo-workspaces src/main/runtime/orca-runtime.test.ts
pnpm run check:code-quality:changed b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122
node config/scripts/ensure-native-runtime.mjs --runtime=electron
```

若改动 Claude structured-session，另运行 AGENTS.md 指定的真实 CLI 测试；账号/模型
失败按失败报告，不能用 mock 替代。同步涉及其他区域时补跑相应检查，完整平台检查
以 PR workflow 为准。提交解决后的合并，保持工作树干净，再构建可追溯 arm64 候选：

```sh
source .context/multi-repo-env.sh
git commit
pnpm run build:mac:orca34
```

当前脚本仅支持 macOS arm64，使用 ad hoc 签名；它不是 Developer ID 发布流程。
未来跨架构构建必须先 `pnpm install:release`。构建失败不得把旧 dist 文件当新产物。

4. 对候选包核对 manifest/source SHA、签名、DMG、独立 profile/daemon/CLI/scheme/update
   身份；按安装回退文档验证旧任务在升级后仍能打开、编辑、预览清理，并能退回旧包和
   旧数据。使用隐藏 renderer 与 Playwright CDP，不抢占焦点；不要在真实任务上试验删除。
   临时任务必须覆盖保留分支、用户笔记、dirty/untracked/ignored 文件、根会话停机、
   删除中断后显式继续。已有任务不能仅用新建成功代替验收。

## 远端 PR gate

仅向 `fork` 推送自用 sync 分支，使用 `.github/pull_request_template.md` 填写 PR。
运行结果必须属于准确的当前 head 和 `.github/workflows/pr.yml`；其 `verify` job 显示名
为 `PR checks passed`。Mobile Checks、另一个 workflow 的同名 job、本地绿灯均不能替代。

```sh
source .context/multi-repo-env.sh
: "${ORCA_PR_NUMBER:?Set the fork PR number}"
: "${ORCA_PR_RUN_ID:?Set the PR workflow run ID}"
gh pr view "$ORCA_PR_NUMBER" --repo 34/orca --json headRefOid,url,statusCheckRollup
gh api "repos/34/orca/actions/runs/${ORCA_PR_RUN_ID}" --jq '{head_sha,path,status,conclusion}'
gh api "repos/34/orca/actions/runs/${ORCA_PR_RUN_ID}/jobs?per_page=100" --paginate --jq '.jobs[] | {name,status,conclusion}'
```

逐项核对 required checks 和完整 aggregate 成功，确认 run.head_sha 等于 PR.headRefOid；
缺失、失败、取消或 pending 均阻止合并。head 改变必须重查。实际合并必须传
`--match-head-commit`，不得使用 `--admin` 或以 `--auto` 代替检查。本文没有已通过的 PR
run，不能据此宣称远端门禁完成。

## 切回官方与任务导出

任务 journal 是 fork 自用 schema，不保证官方可导入。停止根会话后，从当前 profile 的
`multi-repo-workspaces/tasks/<taskId>.json` 复制记录到备份；同时保留任务根中的
`.orca-multi-repo.json`。前者包含 task/name/成员 repoId、源仓目录/common-dir、分支、
固定 commit、目标路径和实例身份；后者只是计划快照，不能当作删除授权。

逐成员使用实际路径检查 Git，将要保留的工作提交或另行备份；推送是明确的人工决定，
本文不自动执行。记录每个成员当前 PR/MR 链接（从其现有 GitHub/GitLab review 面板），
不要把任务 journal 中没有的 PR 状态编造成导出结果。然后在官方版本登记已有目录，
或从保留的分支另建工作区。使用以下只读命令核对单个成员，路径作为参数传入：

```sh
source .context/multi-repo-env.sh
: "${ORCA_MEMBER_PATH:?Set the member worktree path}"
git -C "$ORCA_MEMBER_PATH" status --short --untracked-files=all
git -C "$ORCA_MEMBER_PATH" branch --show-current
git -C "$ORCA_MEMBER_PATH" rev-parse HEAD
git -C "$ORCA_MEMBER_PATH" log --max-count=10 --oneline
```

会话历史、原生 Chat、任务 UI 不保证迁移。不要把整个 fork profile 覆盖到官方 profile，
也不要直接让旧 writer 改写较新 journal。确认官方工作区正常和备份可用之前，保留
fork 包、独立 profile、任务目录和分支；不依靠删除 fork 来完成迁移。
