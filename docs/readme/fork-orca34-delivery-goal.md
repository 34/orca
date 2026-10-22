### 2026-10-20：保持协议与运行时构建修复分离

协议 PR 的 run 39450219496 已通过 v1.4.232 双向协议检查，但范围门禁拒绝同一 PR 修改协议版本与 build-orcad.mjs。协议分支恢复原构建入口，改由现有 CI 终端烟测步骤提供并回收 canary 目录；通用构建修复保留在后续集成分支。没有添加豁免标签或改变门禁断言。

真实 shell 夹具验证目录在运行期间存在、成功/失败后回收且原退出码保留；相关 54 项测试通过，范围门禁通过。原 watcher 配合 CI 父进程目录配置，在 Linux x64 / Node 24.21.0 下 400 次零失败，证据 .context/orca34-protocol-canary-native.log。仍需本次新提交的完整 PR CI，不能以本地回归替代。

### 2026-10-21：回移官方隐藏窗口首帧准备修复

协议 PR 的 run 39452947163 在 package job 的 popup native 测试失败，位置是夹具首次绘制等待，尚未执行 Shift POST 行为断言。回移官方提交 449cbb08a028666c499b317bc9150b0e9ffb136e（#30854）：将一次性 GPU/首帧准备放入 beforeAll，保持后续行为断言和 poll 预算不变，失败时报告具体页面。官方 v1.4.232 集成分支已含此修复。

本机 ORCA_BACKGROUND_LAUNCH=1 隐藏 Electron/CDP 运行 popup compatibility、native、background 三份测试，共 39 项通过；增量质量和运行时/协议范围门禁通过。日志 .context/orca34-popup-backport-tests.log。Linux CI 仍需新 head 完整验证；此前集成 run 39453264107 已取消，不能作为成功证据。

### 2026-10-21：回移 daemon 自然退出时的夹具收尾修复

协议 PR run 39515947079 的 Linux/Windows 打包、静态检查与其他分片已通过，Node 4/5 唯一失败为 AppImage 无独立 Node 用例收尾时无法再次验证 daemon。回移官方 7a77653c71aac0653cba74dffd5646f51f1f3584 的夹具与测试：仅在指定的端点失联错误后继续要求操作系统确认原 PID 退出，不把失联视为退出；仍拒绝活进程、不同端点所有者及其他错误，不追加按 PID 强杀。

原夹具运行官方定向回归稳定出现 2 项失败；修复后 17 项通过，1 项 Linux 专属 zombie 用例在 macOS 跳过。增量质量及运行时/协议范围门禁通过。证据 .context/orca34-retirement-{before,after}.log；本机未运行 Linux AppImage 实际用例，仍须新精确 head 的完整 CI。集成分支已包含官方修复。
