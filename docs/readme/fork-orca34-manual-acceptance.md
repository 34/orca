# Orca 34 多仓库需求工作区：人工验收步骤

> 第二轮新增功能请先读 [需求管理与上下文预设验收](./fork-orca34-multi-repo-v2-acceptance.md)。本文保留第一轮安装候选的验证步骤。

日期：2026-10-19。适用：用户本机 macOS arm64、Orca 34 第八候选、Codex、本机 Git 仓库。

## 1. 现在处于什么阶段

**Codex 本机多仓第一版已完成主要实现和自动化验证，可以开始人工业务验收；整个扩展计划尚未全部完成。**

| 项目                                                          | 当前结论                                                     | 后续动作                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| 创建、跨组选仓、独立 worktree、根会话、恢复、归档与保护性清理 | 已实现，已有自动化和隔离应用实测证据                         | 按本文确认实际使用体验                          |
| Codex 在需求根修改多个成员并执行 Git                          | 已有真实 Agent 证据                                          | 第 6 节人工复验                                 |
| 完整 PR 检查与 Mobile 检查                                    | 产品/CI 检查点 `a9f4fba5963` 已通过                          | 不需要用户重跑测试命令                          |
| Orca 34 普通启动、新建终端                                    | 用户截图已确认正常                                           | 可沿用，不必从零重验                            |
| Cursor 多仓根 Agent                                           | **尚未实现并验证**；当前选择器仅有 Codex/Claude              | 后续开发启动、成员目录/Git 权限适配，再另行验收 |
| Pi Agent                                                      | 用户明确当前不用                                             | 本轮不接入                                      |
| 真实 Claude CLI                                               | 用户明确当前不用                                             | 本轮不验，不要求 Claude 订阅                    |
| 全部 Keychain/TCC 权限路径                                    | 仅有普通启动/终端人工反馈；未覆盖所有原生授权场景            | 按实际使用补验，见第 13 节                      |
| 线上 GitHub/GitLab PR/MR 完整操作                             | 路由/上下文有测试；未完成所有真实线上操作                    | 后续在获授权的业务流程中补验                    |
| 上游源码同步演练                                              | 已按有限 P5 例外交付同步步骤；未完成一次真实后续版本合并升级 | 后续独立安排；跨版本通信测试不等于源码同步      |
| PR 远端 UI 前后截图附件                                       | 本地截图已有，公开 PR 尚未挂附件                             | 整理脱敏材料后补齐，不阻止本机开始验收          |
| 合并 PR、发布安装包                                           | 用户明确暂不执行                                             | 继续保持未合并、未发布                          |

通过本文必验项，表示“现有安装包的 Codex 本机多仓流程通过用户验收”，不表示 Cursor、远端多仓、所有系统权限或全部后续工作完成。

### 版本与证据

- 应用：`/Users/wzh/Applications/Orca 34.app`。
- 已安装版本：`1.4.214-local.1792185668342.966a0f556fc3.orca34`。
- 安装包运行时代码：`966a0f556fc3b6918c9fa552acac0469926abccd`。
- 完整 CI 源码检查点：`a9f4fba59639eecc16a9554984932c66866e5084`。
- [PR #1](https://github.com/34/orca/pull/1)、[完整 PR 检查](https://github.com/34/orca/actions/runs/39196969863)、[Mobile 检查](https://github.com/34/orca/actions/runs/39196969832)。
- 五组单测 122,891 项通过；跨版本通信、E2E、布局、Git/shell、Linux/Windows 打包通过。部分平台/opt-in 用例跳过，不能据此声称全部机器和权限均实测。
- daemon 升级用例先连续通过 5 轮，共 25 次执行，再通过完整测试组。

安装包之后的提交主要修改 CI、测试夹具与文档；产品运行时代码另增加了认证清理异常的原始 cause，未改变关闭授权和业务流程。本次先验现有第八候选，**不需要为了本文重新安装**。它为 ad hoc 签名候选，尚未 notarize。

## 2. 怎么执行和记录

建议分两次完成：先做第 3–10 节的使用流程，再做第 11–12 节的清理保护。首次约 45–75 分钟，Codex 登录或响应耗时另计。

- 所有创建、提交、改名和删除测试只针对本文生成的临时仓库。
- 使用 Orca 34，保留官方 Orca 及其数据；不要将官方 profile 指给 Orca 34。
- 如果已经熟悉 profile，可使用验收专用 profile；否则在当前 Orca 34 中添加带“验收”前缀的项目组即可。后续一直使用同一 profile。
- 以下命令在**准备临时仓库的同一个 macOS 终端窗口**中执行。Orca 新终端不会自动继承这里的变量。若关闭该终端，先把 `ORCA34_ACCEPT_ROOT` 重新设为你记录的实际目录。
- 每节记录：通过 / 失败 / 未执行，附截图或命令输出。遇到路径指向业务仓库、文件意外消失、重复启动 Agent，停止后续写入和清理，按第 15 节反馈。

## 3. 准备三个临时仓库

在 macOS 终端复制下面整个代码块。它只创建一个全新目录，不克隆、不配置远端、不推送，也不改全局 Git 设置。

```bash
export ORCA34_ACCEPT_ROOT="$(mktemp -d "$HOME/orca34-acceptance.XXXXXX")"
bash <<'BASH'
set -euo pipefail
mkdir -p "$ORCA34_ACCEPT_ROOT/sources" "$ORCA34_ACCEPT_ROOT/需求 workspace" "$ORCA34_ACCEPT_ROOT/empty-hooks"
for name in api web admin; do
  repo="$ORCA34_ACCEPT_ROOT/sources/$name"
  git init "$repo"
  git -C "$repo" symbolic-ref HEAD refs/heads/main
  git -C "$repo" config --local user.name 'Orca34 Acceptance'
  git -C "$repo" config --local user.email 'acceptance@example.invalid'
  git -C "$repo" config --local commit.gpgSign false
  git -C "$repo" config --local core.hooksPath "$ORCA34_ACCEPT_ROOT/empty-hooks"
  printf '%s\n' "$name baseline" > "$repo/README.md"
  printf '%s\n' 'original baseline' > "$repo/ORIGINAL_ONLY.txt"
  printf '%s\n' 'ignored-acceptance.txt' > "$repo/.gitignore"
  git -C "$repo" add README.md ORIGINAL_ONLY.txt .gitignore
  git -C "$repo" commit -m 'Acceptance baseline'
done
repo="$ORCA34_ACCEPT_ROOT/sources/web"
git -C "$repo" checkout -b acceptance-alt
printf '%s\n' 'alternate web baseline' > "$repo/ALT_BASE.txt"
git -C "$repo" add ALT_BASE.txt
git -C "$repo" commit -m 'Alternate acceptance baseline'
git -C "$repo" checkout main
printf '%s\n' 'original uncommitted change must survive' >> "$ORCA34_ACCEPT_ROOT/sources/api/ORIGINAL_ONLY.txt"
{
  for name in api web admin; do
    printf '%s main: ' "$name"
    git -C "$ORCA34_ACCEPT_ROOT/sources/$name" rev-parse main
  done
  printf 'web acceptance-alt: '
  git -C "$ORCA34_ACCEPT_ROOT/sources/web" rev-parse acceptance-alt
} > "$ORCA34_ACCEPT_ROOT/baseline.txt"
cat "$ORCA34_ACCEPT_ROOT/baseline.txt"
printf '\n验收目录：%s\n需求父目录：%s\n' "$ORCA34_ACCEPT_ROOT" "$ORCA34_ACCEPT_ROOT/需求 workspace"
BASH
```

**预期**：三个仓库创建成功，输出四个提交 SHA 和两个绝对目录。保存输出；`api/ORIGINAL_ONLY.txt` 有一处刻意保留的未提交修改。

在 Orca 34 中使用已有“添加项目/仓库”入口，仅添加：

1. `<验收目录>/sources/api`，放入“Orca34 验收-服务端”项目组。
2. `<验收目录>/sources/web`，放入另一个“Orca34 验收-Web”项目组。
3. `<验收目录>/sources/admin`，可与 api 同组。

不要把整个验收父目录当成这三个源仓库，也不要为它执行 `git init`。确认源仓库均为本机执行。

## 4. 新建需求 A，先检查预览

1. 点击左侧“项目”标题旁的双文件夹图标，悬停提示应为“新建多仓库需求工作区”。也可通过 `⌘J` 面板搜索“多仓库”。
2. 填写下表，成员目录名要手动改为 `api` 和 `web`，便于后续命令核对。

| 字段                             | 值                                               |
| -------------------------------- | ------------------------------------------------ |
| 需求名称                         | `验收 A`                                         |
| 本机父目录（绝对路径）           | 第 3 节输出的“需求父目录”，包含 `需求 workspace` |
| 需求目录名                       | `acceptance-a`                                   |
| 仓库                             | api、web，来自两个项目组                         |
| api 成员目录 / 起始 ref / 新分支 | `api` / `main` / `acceptance/a`                  |
| web 成员目录 / 起始 ref / 新分支 | `web` / `acceptance-alt` / `acceptance/a`        |
| 两个成员 Setup                   | `跳过 setup`                                     |
| 根 Agent（可选）                 | `Codex`                                          |

需求说明粘贴以下内容，作为唯一根 Agent 的验收任务：

```text
这是临时仓库验收。先读取根目录 TASK.md，仅操作此需求中的 api/ 和 web/。
在两个成员中分别创建 ACCEPTANCE.md，内容为一行 task-a。
在各成员分别 git add ACCEPTANCE.md 并提交，提交说明为 Acceptance task A。
不要修改源仓库原 checkout、根元文件或其他文件，不要推送，不要启动服务或第二个 Agent。
沿用当前权限和 sandbox；若写成员或 Git metadata 被拒绝，报告具体路径与原始错误，不要关闭安全限制。
完成后报告根 cwd、两个成员的完整路径、分支、提交 SHA，以及各自 git status --short。
```

3. 点击“预览创建计划”。
4. 核对 api/web 的源路径、目标路径、分支与 `baseline.txt` 中对应提交 SHA。api 应取 main，web 应取 acceptance-alt。
5. 确认 web 源仓仍归原项目组，没有被移动。
6. 点击“返回修改”，再预览一次；这两次预览都不应创建 `acceptance-a` 或启动 Codex。

**通过标准**：预览完整且准确；支持中文/空格父路径；预览阶段没有写工作树或启动 Agent。保存预览截图。

## 5. 确认创建与一个根 Agent

1. 点击“确认创建需求工作区”。仅正常确认一次，不为压力测试反复点击。
2. 等待两个成员“已就绪”，Setup 为“已跳过”；创建中可以关闭对话框，再从“查看已有需求”找回同一条任务。
3. 进入需求根工作区，根路径应为 `<需求父目录>/acceptance-a`。
4. 观察 Codex：只自动创建一份根 Agent 会话，不在 api/web 各自动启动一份。
5. 如出现正常的成员权限确认，核对路径属于此验收目录，再按现有 Codex 授权流程处理。不要为了通过而关闭 sandbox 或授予全盘权限。

**通过标准**：任务只有一条；成员没有重复目录或额外分支；根会话只有一份。此处统计 Orca 中的 Agent 会话，不按操作系统子进程数量判断。

若 Codex 尚未登录或不可用，记录为“Agent 前置条件阻塞”，先完成无 Agent 的第 7–10 节；不用 Claude 替代，也不要把这一项直接勾为通过。

## 6. 核对 Codex 确实修改并提交两个成员

等 Codex 报告完成。在最初的 macOS 终端中执行：

```bash
ORCA34_A_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-a"
for name in api web; do
  printf '\nA/%s\n' "$name"
  git -C "$ORCA34_A_ROOT/$name" branch --show-current
  git -C "$ORCA34_A_ROOT/$name" log -1 --oneline
  git -C "$ORCA34_A_ROOT/$name" status --short
  cat "$ORCA34_A_ROOT/$name/ACCEPTANCE.md"
done
printf '\n源 api 状态\n'
git -C "$ORCA34_ACCEPT_ROOT/sources/api" status --short
cat "$ORCA34_ACCEPT_ROOT/sources/api/ORIGINAL_ONLY.txt"
```

**预期**：

- 两个 A 成员均在 `acceptance/a`，各有一笔验收提交，`ACCEPTANCE.md` 为 `task-a`。
- 两个成员 `git status --short` 均为空。
- 源 api 仍在 main，保留第 3 节的 `ORIGINAL_ONLY.txt` 未提交修改；源仓 main 的 SHA 仍等于 `baseline.txt`。
- 源 checkout 没有新增 `ACCEPTANCE.md`；A/web 有 `ALT_BASE.txt`，源 web/main 没有该文件。

**失败示例**：只改了一个成员；文件能写而 Git 提交报权限错误；改到 sources 下的原 checkout；自动启动了两个 Agent。保留原始报错，不用手工代提交来把 Agent 项目勾为通过。

## 7. 新建需求 B，确认同仓 A/B 隔离

从同一个多仓入口新建：

| 字段                  | 值                                         |
| --------------------- | ------------------------------------------ |
| 需求名称 / 需求目录名 | `验收 B` / `acceptance-b`                  |
| 父目录                | 与 A 相同                                  |
| 仓库                  | api、admin                                 |
| 成员目录              | `api`、`admin`                             |
| 起始 ref              | 两个成员均为 `main`                        |
| 新分支                | 两个成员均为 `acceptance/b`                |
| Setup / 根 Agent      | `跳过 setup` / `不启动`（清空 Agent 选择） |

预览并确认创建。然后执行：

```bash
ORCA34_A_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-a"
ORCA34_B_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-b"
git -C "$ORCA34_A_ROOT/api" branch --show-current
git -C "$ORCA34_B_ROOT/api" branch --show-current
git -C "$ORCA34_ACCEPT_ROOT/sources/api" worktree list --porcelain
if test -e "$ORCA34_B_ROOT/api/ACCEPTANCE.md"; then
  printf '%s\n' '失败：A 的新增文件串入 B'
else
  printf '%s\n' '通过：B 未继承 A 的新增文件'
fi
```

**通过标准**：A/api 与 B/api 是两个不同真实目录、分支分别为 `acceptance/a` 和 `acceptance/b`；B 没有继承 A 的提交文件；源 api/main 和原项目组均不变；B 未自动启动 Agent。

## 8. Explorer、编辑器与 diff 上下文

1. 在 A 的管理详情点击“打开根工作区”。Explorer 应能看到 `api`、`web`、`TASK.md` 等内容。
2. 从管理详情点击“打开成员 web”。确认进入 A/web，分支是 `acceptance/a`，不是源 web/main 或 B 的成员。
3. 编辑该成员的 `README.md`，新增一行 `task-a-local-diff` 并保存。
4. 打开现有 Source Control/更改面板，核对仓库、分支和 diff 中新增行；打开编辑器时核对完整文件路径。
5. 切到 A/api、B/api 与源 web，确认没有这条修改。
6. 回到 A/web，删除刚加入的这一行并保存。确认 A/web 再次干净。仅撤销这一处验收改动，不做全仓 reset/clean。

**通过标准**：根 Explorer 可跨成员浏览；Git/diff 仍按成员仓库显示；切换工作区后文件、分支、diff 不串上下文。不要在非 Git 的需求根执行统一 `git init` 或统一提交。

## 9. 改名、归档与重启

1. 进入 A 的“查看已有需求”→选择 A。
2. 将“显示名称”改为 `验收 A - 改名`，点击“保存显示名称”。
3. 核对显示名变更，但根目录仍为 `acceptance-a`，成员路径、分支、提交均不变。
4. 点击“归档根工作区”，确认目录和文件仍在；再从已有需求列表找到任务并“取消归档”。归档不等于停止会话，也不等于删除成员。
5. 保存文件，正常退出 Orca 34，再重新打开同一个 Orca 34/profile。不要强杀或手工删除 daemon 文件。
6. 从“查看已有需求”核对 A/B、改名、根目录和成员；重新打开 A、B，检查验收文件与提交。

**通过标准**：记录保留、归档可逆；重启后没有重复任务、目录或第二份自动启动的根 Agent。daemon 按设计可能独立于窗口存活，不把“关窗口后还有后台进程”直接判为失败。

## 10. 创建校验与可用性

这些测试只到“预览”，不确认创建：

| 操作                                                      | 预期                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| 将某成员起始 ref 改为不存在的 `does-not-exist-acceptance` | 明确报错，不创建目录/分支                      |
| 两个成员目录均填 `api`                                    | 拒绝冲突，保留可修改的表单                     |
| 需求目录填已存在的 `acceptance-a`                         | 拒绝覆盖；A 的文件和会话不变                   |
| 修改错误后重新预览                                        | 可以恢复正常预览，不重复旧任务                 |
| 切换深/浅色、使用 Tab/Enter/Escape                        | 文字、焦点和错误可辨认；窗口关闭后可以找回任务 |

本机多仓选择器不提供 SSH/WSL/远端仓库是当前范围，不需要用户伪造远端目标或修改内部记录。

## 11. 验收清理保护（仅 A）

先确认 Codex 已完成，不在写文件；B 留作对照。执行以下命令添加三个专门的验收文件：

```bash
ORCA34_A_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-a"
printf '%s\n' 'keep untracked' > "$ORCA34_A_ROOT/web/UNTRACKED_ACCEPTANCE.txt"
printf '%s\n' 'keep ignored' > "$ORCA34_A_ROOT/web/ignored-acceptance.txt"
printf '%s\n' 'keep root note' > "$ORCA34_A_ROOT/UAT-NOTES.txt"
```

1. 在 A 管理详情点击“检查清理影响”。
2. web 的“未提交或未跟踪”应包含 `UNTRACKED_ACCEPTANCE.txt`；“被 Git 忽略的内容”应包含 `ignored-acceptance.txt`。
3. 根目录保留内容应列出 `UAT-NOTES.txt`；预览本身不得删除任何文件。
4. web 的“清理此成员”应被阻止。不要使用强制删除绕过提示。
5. 仅移走刚才创建的两个成员验收文件，保留证据：

```bash
ORCA34_A_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-a"
mkdir -p "$ORCA34_ACCEPT_ROOT/kept-evidence"
mv "$ORCA34_A_ROOT/web/UNTRACKED_ACCEPTANCE.txt" "$ORCA34_ACCEPT_ROOT/kept-evidence/"
mv "$ORCA34_A_ROOT/web/ignored-acceptance.txt" "$ORCA34_ACCEPT_ROOT/kept-evidence/"
```

6. 重新点击“检查清理影响”。如果仍有未提交、未跟踪、ignored 文件或无法确认的服务，先查明原因；不要清业务文件或执行 `git clean`。
7. 点击“停止根会话”，读完确认框再确认。A 根终端/Chat 应关闭，文件与分支保持；B 会话和官方 Orca 不应受影响。

**通过标准**：脏文件、未跟踪/ignored 文件均被识别并保护；停止根会话不删除工作目录。真实运行服务的停止/不可确认状态已有工程测试，本轮无需用户在业务服务上制造故障。

## 12. 清理 A，验证保留分支和 B

本节确实删除 A 的临时成员 worktrees，确认预览路径全部位于本次验收目录再操作。

1. 在 A 的新清理预览中，对干净的 api 点击“清理此成员”，核对确认框中的路径和保留分支，再确认。
2. api 状态应为“已清理”；web 和 B 的文件仍在。之后同样清理 A/web。
3. 所有 A 成员均清理后，出现“清理根目录与入口”。A 根的 `UAT-NOTES.txt` 此时仍应保留。
4. 尝试根清理，确认内容保护生效：不得删除笔记或报告全部成功。未修改的生成元文件可能先被清理；不要手工补写元文件或 journal。
5. 将根笔记移出，再重新检查/清理根：

```bash
ORCA34_A_ROOT="$ORCA34_ACCEPT_ROOT/需求 workspace/acceptance-a"
mv "$ORCA34_A_ROOT/UAT-NOTES.txt" "$ORCA34_ACCEPT_ROOT/kept-evidence/UAT-NOTES.txt"
```

6. 根清理完成后，确认 A 根目录与侧栏入口已清理，B 仍能打开。
7. 在最初的终端验证保留分支及提交：

```bash
for name in api web; do
  repo="$ORCA34_ACCEPT_ROOT/sources/$name"
  git -C "$repo" show-ref --verify refs/heads/acceptance/a
  git -C "$repo" show acceptance/a:ACCEPTANCE.md
  git -C "$repo" worktree list --porcelain
done
git -C "$ORCA34_ACCEPT_ROOT/sources/api" status --short
cat "$ORCA34_ACCEPT_ROOT/sources/api/ORIGINAL_ONLY.txt"
```

**通过标准**：A 成员 worktree 不再登记；`acceptance/a` 分支和 `task-a` 提交内容保留；B/api 仍登记、可使用；源 api 的原始未提交修改与 `kept-evidence` 中三个文件保持完整。

验收通过后可以保留 B 与整个验收目录供回看。需要收尾时，B 仍走相同的预览、逐成员和根清理流程，不直接删除带已登记 worktrees 的整个父目录。

## 13. 系统权限与普通工作区补验

### 本轮必需

- 已有首启/终端反馈可勾“已通过”。
- 在一个普通单仓库工作区和一个普通 Folder Workspace 中分别打开文件、终端，确认基本操作与原来一致；不要执行删除或提交业务改动。
- 官方 Orca 与 Orca 34 的项目/设置没有被意外互相覆盖；Orca 34 显示手动更新。

### 按实际使用补验，单独记录

- 若使用到 Keychain 登录凭据、受保护目录、辅助功能等功能，记录真实系统提示、应用名称、操作和结果。普通终端通过不能代表这些权限全部通过。
- 本包为 ad hoc 签名，Developer ID/notarization 与稳定签名 helper 的授权表现属于后续发布工作，不要求本轮模拟成已通过。
- 线上 PR/MR：先只读核对成员的远端、分支、关联评审和 Checks 是否对应当前成员；实际创建/推送/合并须在另外明确授权的仓库和流程中做。本文临时仓库没有 remote，不会自动发布 PR/MR。
- Cursor 多仓接入、SSH/WSL 多仓和 Pi 不在本轮人工验收中勾“通过”。

## 14. 验收记录与通过条件

复制填写：

```text
验收日期：
验收人：
Orca 34 版本：
验收目录：
使用的 profile：
Codex 是否已登录：

[ ] 源仓库注册、跨项目组选择
[ ] 创建预览：路径/ref/SHA 正确，预览无写入
[ ] A 创建，只有一份根 Agent
[ ] Codex 在 api/web 都完成文件修改与 Git 提交
[ ] 源 checkout 与原未提交修改保留
[ ] B 创建，A/B 同仓不同目录和分支
[ ] 根 Explorer、成员编辑器与 diff 上下文
[ ] 改名、归档/取消归档
[ ] 正常退出和重启恢复
[ ] 错误输入保护、键盘与主题
[ ] 未跟踪/ignored 文件与根笔记保护
[ ] 停止根会话
[ ] 成员清理、根清理、分支保留、B 不受影响
[ ] 普通单仓/Folder Workspace 基本回归
[已通过] 普通启动和新终端（2026-10-19 用户截图）

未执行/阻塞项及原因：
失败编号与证据：
结论：通过 / 部分通过 / 不通过
```

- 第 3–12 节及第 13 节“本轮必需”全部通过，且没有丢文件、串仓、重复 Agent，可给出现有 Codex 本机多仓版的人工通过结论。
- Codex 未登录等前置阻塞，或必验项未执行，记为“部分通过”，不要用其他自动化结果补勾。
- 文件丢失、修改到源 checkout、串错 Git/评审上下文、停止/清理影响其他工作区，记为“不通过”，停止后续删除。
- 后续 Cursor 实现、线上评审实操、全部权限、正式签名/发布和真实上游同步，继续独立跟踪；人工通过不自动授权合并或发布。

## 15. 失败时怎么反馈

每个问题给一条记录即可：

```text
编号：例如 UAT-08-diff
对应章节/步骤：
预期：
实际：
是否可重复：
应用版本/profile：
需求名、根路径、成员完整路径、当前分支：
报错原文：
截图/录屏或相关命令输出：
目前是否仍有 Agent/服务运行：
```

保留现场，不 reset、clean、删除 journal、改 marker 或手工清 daemon 文件。日志通过应用已有日志入口取得；没有入口时先反馈截图与路径，由我们定位。提交公开 PR 前去掉 token、账号和业务内容。

突然断电、SIGKILL、journal 写入边界、恶意元数据、真实服务失联、安装升级/回退不是这份日常人工清单的操作要求；已有工程验证分别见[恢复验证](fork-multi-repo-recovery-validation.md)和[安装/回退说明](fork-orca34-install-and-rollback.md)。遇到真实故障由我们继续诊断，不要求用户手工注入故障。
