# dsh-session-delete

DeepSeek Harness（DSH 桌面版）插件：为侧栏会话列表补上「删除会话」——先归档，再永久删除该会话在磁盘上的完整日志目录，列表同步刷新。运行中的会话受保护，不会被删。

## 功能

- **两个入口**：会话行悬停时的垃圾桶按钮；会话行菜单里的红色「删除会话…」项（排在「归档」之后）。
- **确认弹窗**：明确提示「将永久删除「xxx」的完整对话记录（含磁盘日志），此操作不可恢复」，防止误触。
- **安全围栏**：
  - 先走官方归档流程，仍在运行的工作会被活动瀑布拒绝；
  - 运行中的会话（live session）直接拒绝删除，防止撕裂日志产生残影；
  - 删除前校验目录形状（`<root>/<project>/<session-id>` 两级结构），只删目标会话自己的目录；
  - 使用持久化层提供的精确位置（`locate()`），绝不自行拼接路径。
- **即时反馈**：删除成功后 toast 提示「已删除会话「xxx」」，会话列表立即刷新。

## 环境要求

- Windows
- DeepSeek Harness 桌面版已安装，并至少启动过一次（开发时基于 0.2.0-rc.2 验证）

## 安装

### 方式一：一键脚本

```powershell
git clone https://github.com/longhao666666/dsh-session-delete.git
cd dsh-session-delete
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

脚本会自动检测 DSH、建立 `node_modules/@local` 链接、把插件写进 profile 配置。

### 方式二：手动挂载

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
$repo    = "<你的克隆路径>"    # 例如 "$HOME\code\dsh-session-delete"

New-Item -ItemType Directory -Force "$profile\node_modules\@local" | Out-Null
New-Item -ItemType Junction -Path "$profile\node_modules\@local\dsh-session-delete" -Target $repo
```

然后编辑 `$profile\package.json`，合并以下字段（已存在的字段里追加即可）：

```json
{
  "dependencies": {
    "@local/dsh-session-delete": "link:C:/Users/you/code/dsh-session-delete"
  },
  "dsh": {
    "profile": {
      "bundles": ["@local/dsh-session-delete"]
    }
  }
}
```

两种方式完成后都需**重启 DeepSeek Harness**，并在「插件管理」页确认 `@local/dsh-session-delete` 已启用。

## 使用说明

1. 重启 DSH 后，把鼠标悬停在侧栏任意会话行上，点击垃圾桶图标；或打开会话行菜单，选择「删除会话…」。
2. 在确认弹窗中点击「删除」。
3. 看到「已删除会话「xxx」」toast 即完成，磁盘上的日志目录同时被清理。

> 提示：删除的是会话的完整记录（含磁盘日志），且不可恢复。只是想收起的话，请继续使用官方的「归档」。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

重启 DSH 后生效；克隆下来的仓库文件不会被删除。

## 工作原理

- `host.js`（Node 侧）：归档 → 通过持久化层定位日志目录 → 校验目录形状 → 删除 → 从工作区脱离 → 发出 `api-session/removed` 事件让客户端刷新列表；所有安全围栏都在这一侧。
- `client.js`（浏览器侧）：向 `sidebar.workspaces.session.menu.item`（行菜单）、`sidebar.workspaces.session.row.action`（悬停按钮）、`shell.overlay`（确认弹窗 + toast）三个扩展槽注入 UI，只负责发起请求与展示。

## 相关插件

- [dsh-element-context](https://github.com/longhao666666/dsh-element-context) — 对话中圈选 UI 元素注入上下文
- [dsh-ask-mode](https://github.com/longhao666666/dsh-ask-mode) — 会话内一键切换「咨询模式」

## 许可证

[MIT](./LICENSE)
