# Orca 34 本地交付入口

当前支持 macOS arm64、Orca 34 独立身份的 ad hoc 本地包。命令不会创建 GitHub Release 或推进 main/local。它会替换你显式传入的安装目录，必须先使用隔离安装和隔离 profile 演练；不要把日常目录当作测试参数。

## 一次交付

源码需已提交且工作树干净。运行环境需要本项目的 Node/pnpm 和 macOS 构建工具；发布目录的父目录必须已存在，发布目录必须是全新路径。发布目录、目标应用和 profile 不能互相包含。建议在仓库之外的持久目录保存交付记录，不使用可清理的 `.context` 作为日常发布存储。

```sh
pnpm deliver:orca34:local start "/absolute/releases/new-delivery" "/absolute/installed/Orca 34.app" "/absolute/user-data"
```

必须显式指定真实 userData 路径；不能把需求目录或 Git 仓库目录当作 profile。入口固定当前源码 SHA，然后：

1. 在新建的 build-* 目录构建独立身份的安装包。
2. 校验精确源码、架构、签名及 manifest。
3. 取得维护许可，检查目标应用和 profile 没有写入者，校验旧包，备份旧包和 profile。
4. 持久记录安装事务位置，再执行可恢复的应用替换。
5. 启动隐藏诊断页面，核验应用身份、配置及原有需求，保存健康回执。

活跃终端、Agent 或无法确认的占用会阻止安装；工具不会替你强制停止它们。健康诊断不恢复工作区终端，不替代普通界面及 Agent 的操作验收。所有阶段通过才返回 `healthy`。

## 中断和失败

```sh
pnpm deliver:orca34:local status "/absolute/releases/new-delivery"
pnpm deliver:orca34:local resume "/absolute/releases/new-delivery"
```

恢复构建必须在记录的源码目录和原 SHA 上运行。中断的 build-* 目录保留，重新构建使用全新目录。准备完成后，从 delivery.json 中记录的同一安装事务继续，不重复替换已经安装的包。健康检查失败时保留 installed 阶段；resume 只重新检查健康，不重建、不再次备份。

若备份已完成但交付回执尚未落盘就退出，可能留下一个尚未开始替换的额外安装事务；保留它供诊断。工具遇到未完成的 `.pending` 回执会拒绝覆盖，不能将这种情况视为自动恢复成功。阶段恢复功能不等于可以在任意损坏的磁盘状态下继续。

## 显式回退

读取 delivery.json 的 `transaction` 字段，先关闭这个测试实例及其终端。健康启动可能写入 profile，因此使用配套数据回退：

```sh
pnpm install:orca34:local rollback-with-profile "/absolute/installation-transaction"
```

回退先保存升级后数据，再恢复配套旧 profile 和旧包；不会修改需求根目录、成员工作树或其 Git 分支。已产生的新工作不会被自动抛弃，升级后 profile 副本保留在事务记录的 profileRecoveryDirectory 中。回退中断可再次执行同一命令；恢复屏障会阻止普通应用在数据只恢复一半时启动。

`rollback-unstarted` 仅适用于 profile 尚未改变的安装；发现变化时拒绝继续。回退过的事务不能重新作为健康交付恢复；应建立新的交付目录。

## 已验证与未验证

旧源码 966a0f556fc3 → 候选 1bf574717afa → 旧源码的隔离真实双仓往返通过，需求、分支、HEAD、未提交文件和笔记保留。详细证据见 [开发执行记录](fork-orca34-delivery-goal.md)。统一入口复用已演练的底层构建和安装流程，并有阶段恢复测试；尚未以新统一命令从头执行完整构建。日常安装未替换，完整 computer use 验收、官方版本集成和自动调度仍待完成。
