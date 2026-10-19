# Orca 34：macOS arm64 安装与回退

当前候选版本：`1.4.214-local.1792185668342.966a0f556fc3.orca34`。
源码：`966a0f556fc3b6918c9fa552acac0469926abccd`；上游基线：
`b16a71c7fb044af96b29dc2a2c4f86ee7b9d0122`。本机已安装于
`/Users/wzh/Applications/Orca 34.app`。后面的各候选演练为历史记录，以本页顶部版本为当前安装检查点。

2026-10-19 用户已手动打开本候选并反馈新终端正常，普通首启/终端已有人工通过证据。其余业务验收按[人工验收步骤](fork-orca34-manual-acceptance.md)执行。

这是本机 ad hoc 签名候选，没有 notarization。隐藏启动、独立安装、任务数据升级与
回退已实测；真实 Keychain 授权、Developer ID/helper/TCC 稳定路径和完整功能验收
尚未完成，不能把下面的升级演练当作全部日常使用验收。

## 文件与数据位置

- 新 DMG/ZIP：当前工作树 `dist/orca34/`，文件名含上述完整版本和 `arm64`。
- 可回退候选：`1.4.214-local.1792185101537.c005a01a9447.orca34`，旧 app 与配套数据备份位于 `.context/orca34-install-candidate8/`；更早候选 ZIP 仍保留。
- 独立 bundle ID：`com.orca34.desktop`；URL scheme：`orca34`；外部 CLI 名称：`orca34`。
- 日常默认数据目录：`~/Library/Application Support/orca34`；使用显式 profile 时，以实际启动参数为准。
- 需求根和成员 Git worktrees 在用户选择的父目录下，不属于应用包，也不随应用卸载删除。
- 自动化安装演练没有注册全局 CLI、没有启动日常默认 profile。演练使用工作树内
  `.context/orca34-install-rehearsal/profile`，不是正式数据迁移。

不要把文件命名为 `Orca.app`，不要替换官方 Orca，不要用官方数据目录启动此包。
本候选关闭自动更新，后续升级使用手动安装的 fork 产物。

## 安装或升级

1. 保留当前安装包和包内 `Contents/Resources/orca34-build.json`。该清单给出版本、
   源码、架构和签名模式，不能只看 Finder 显示名称。
2. 保存工作，停止本实例的 Agent、服务和终端。退出 Orca 34 后核对其终端 daemon
   也已退出；daemon 可以独立于窗口存活，退出窗口本身不是证据。PID 记录在实际
   数据目录的 `daemon/daemon-v48.pid`，但不能仅凭旧 PID 文件杀进程。核对当前 PID、
   启动时间和命令中的本实例数据路径，只结束对应实例，不扫描或停止官方 Orca。
3. 在所有写入者退出后备份整个实际数据目录，包含 profiles、数据库、任务 journal
   和会话数据。备份与旧安装包配对保存；额外记录需求根、成员路径和分支。
4. 检查新包 SHA-256 与签名。DMG 可用 `hdiutil verify` 检查；app 可用
   `codesign --verify --deep --strict` 检查。不要删除签名或关闭系统检查以绕过失败。
5. 将旧 `~/Applications/Orca 34.app` 移到备份位置，再把新 `Orca 34.app` 复制到原位置。
   不在运行中覆盖 app。安装到该用户目录不需要改动 `/Applications/Orca.app`。
6. 启动相同 profile，检查包内版本、既有任务、根 Folder Workspace、成员路径/分支、
   用户文件和会话。确认后仍保留旧包及升级前数据备份。

默认目录的关闭后备份示例（显式 profile 必须替换为实际路径）：

```sh
orca34_data="$HOME/Library/Application Support/orca34"
/usr/bin/tar -czf /absolute/backup/orca34-before-upgrade.tar.gz \
  -C "$(dirname "$orca34_data")" "$(basename "$orca34_data")"
/usr/bin/tar -tzf /absolute/backup/orca34-before-upgrade.tar.gz >/dev/null
```

备份文件名应包含旧版本和日期；示例中的备份目录须事先创建。Git 工作目录另行保留，
不因为应用升级而 reset、clean 或删除它们。

## 回退

1. 停止新版本的本实例 Agent、终端和 daemon，退出应用；保留升级后的数据副本供排查。
2. 恢复旧 `Orca 34.app`，同时将升级前配套的数据备份恢复到原数据路径。
   **不要让旧版直接写新版数据库。** 不把备份解压合并到仍含新版数据库的目录，先将
   该目录完整移走，再恢复旧目录。
3. 不回滚需求根和成员工作目录。恢复后的任务清单应仍指向这些实际路径；若升级期间
   新建了任务，旧备份不会包含其记录，须保留这些目录和升级后记录供核对，不能自动删除。
4. 用旧版本核对任务、分支、工作文件；如仍不能打开，保留两份数据，不重复覆盖或重建。

## 第四至第五候选的既有演练

顺序为旧候选安装 → 新候选升级 → 恢复旧包及旧数据 → 再安装新候选。四次均从
`~/Applications/Orca 34.app` 直接隐藏启动，并验证运行版本、独立 HOME/profile、
窗口不可见且未聚焦。每次关闭主进程后也停止专用测试 daemon，才进行下一次替换。

旧包创建任务 `6954c4fc-3d8f-424c-a41d-3bf650ce2ed0`，包含分别来自两个项目组的
api/web 仓库。四个阶段的任务记录完全一致；两仓分支、各自未跟踪 `KEEP.txt` 和根目录
`notes.txt` 内容均保留。应用包替换与数据恢复未触碰这些 Git 目录。

证据在 `.context/orca34-install-rehearsal/`：各阶段的 `*-evidence.json`、日志、截图、
`original-task.json`、`profile-before-upgrade.tar.gz` 和保留的 `profile-after-upgrade`。
演练使用模拟 Keychain、预置临时按键偏好记录及 E2E profile 覆盖；不证明真实授权、
普通默认 profile 首启或所有 schema 升降级组合。

第五候选 DMG：268,568,562 字节，SHA-256
`dbeca6a0c06a14181f08b3e6228fbd4d469d118b66dcef23d683e5cbbf994cd4`。
第五候选 ZIP：270,604,228 字节，SHA-256
`8e5c1d930a3ff521b26589f3a8c5c205405804401b6b2adde71bdbfe7fd13b0a`。
签名与 DMG 完整性检查通过，来源清单与构建 commit 一致。

## 第六候选升级与回退

第六候选包含近期的根入口/删除持久化、扫描实例冲突、setup 完成观察和根清理最后
回执修复。源码清单为 b3ece9928cd7b025fcba539f940306763fef0b71，构建执行全量 typecheck、桌面资源、arm64
原生组件、打包 daemon/terminal host 的真实 PTY 验证；签名和 DMG 完整性检查通过。
仍为 ad hoc 签名，没有 notarization 或真实 Keychain/TCC 验收。

实际从已安装第五候选升级到第六候选，随后恢复第五候选及其关闭后的完整 profile
备份，再重新安装第六候选。三个阶段都从独立安装位置隐藏启动，验证版本、任务
6954c4fc-3d8f-424c-a41d-3bf650ce2ed0、两个成员分支、KEEP.txt 和根 notes.txt 不变。
每次替换前测试应用和专用 daemon 均退出；没有启动日常 profile 或修改全局 CLI。

证据 `.context/orca34-install-candidate6/` 中的 candidate6-{upgrade,rollback,final}-evidence.json、
对应日志与截图；previous.app 是第五候选，profile-before-upgrade.tar.gz 为配套备份，
profile-after-upgrade 保留首次升级数据。当前已装第六候选，应用已退出。

- DMG：268,560,536 字节，SHA-256 `5e4538bdcf2b18e4424c99c8b99c94fac43b886152f010f1d28e9ef087c5c43c`。
- ZIP：270,603,208 字节，SHA-256 `f9da220902e1c6f823dfedd239cbca266bd6a4c078dc4eac040e2bb3e205fdbd`。

## 第七候选：本地化与安装复验

第七候选 c005a01a9447 增加多仓界面及手动更新中英文文案，创建/删除策略不变。完整构建成功，
包括全量 typecheck、原生组件、打包终端 host 真实 PTY 检查；deep strict 签名与 DMG
校验通过。四组中英文 × 明暗主题隐藏 CDP 检查通过，键盘选择、预览、返回编辑正常，
长路径没有横向溢出。截图与日志见 `.context/multi-repo-localization-ui*`。

已实际完成第六 → 第七 → 第六（恢复配套 profile 备份）→ 第七安装，三个阶段均核对
上述任务、成员分支与保留文件。测试应用及专用 daemon 均退出。旧包与升级前数据在
`.context/orca34-install-candidate7/`，其中三个阶段的 evidence、日志和截图保留。
仍使用隔离 HOME、模拟 Keychain 和测试 profile；普通首启授权尚待人工验证。

第七候选 DMG：268,598,979 字节，SHA-256
`2993235b789bab83fe3c0dc7910e2200d463e68bde081708991793b8a8b854f0`。

第七候选 ZIP：270,654,813 字节，SHA-256
`f700c1dfd0f0deb737f436860e6eb83fcfb47582b053c1bdbfeeeaf56c9c4ed4`。

## 第八候选：完整 lint 修复

第八候选移除 mobile context/hooks、终端格子读数及选区计算的循环导入，原对外入口
保留。完整 pnpm lint、mobile 产品类型检查、测试类型 ratchet、684 项相关测试通过。
完整构建包含 typecheck、桌面/mobile 资源、arm64 原生组件、真实打包 PTY 验证；
签名 deep strict 和 DMG 校验通过。

已在独立安装位置完成第七 → 第八 → 第七及配套旧 profile → 第八三阶段复验，
上述任务、分支及保留文件一致；测试应用和 daemon 已退出。备份、日志和截图位于
`.context/orca34-install-candidate8/`。仍为 ad hoc 签名、隔离测试 profile 和模拟
Keychain；普通首启授权及远端完整 CI 尚未证明。

第八候选 DMG：268,575,622 字节，SHA-256
`18bcc68f181a5472d82d4db4f8606656868f103896e052afeddfcf7b0206b23c`。

第八候选 ZIP：270,654,467 字节，SHA-256
`4345edfc80200799dbd386c45d9e4193bad3295ecacc149c18b3752d39a22d25`。
