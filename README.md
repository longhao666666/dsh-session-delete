<div align="center">

# dsh-session-delete

**侧栏一键删除会话——先归档，再永久清理磁盘日志**

[![version](https://img.shields.io/badge/version-0.1.0-181717)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-38a834)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/longhao666666/dsh-session-delete)
[![dsh](https://img.shields.io/badge/DeepSeek_Harness-%3E%3D_0.2.0--rc.2-5D45B0)](https://github.com/longhao666666/dsh-session-delete)
[![stars](https://img.shields.io/github/stars/longhao666666/dsh-session-delete?color=F9C513)](https://github.com/longhao666666/dsh-session-delete/stargazers)

简体中文 | [English](./README.en.md)

</div>

---

> **零依赖**：常规 Cordis 插件，纯 JS 源码直接加载——无需编译、无需 Token / API Key、无需额外服务。

删除的是会话的完整记录（含磁盘日志），且不可恢复——不想这么彻底的话，请继续用官方的「归档」。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 两个入口 | 会话行悬停时的垃圾桶按钮；会话行菜单里的红色「删除会话…」项（排在「归档」之后） |
| 确认弹窗 | 明确提示「将永久删除「xxx」的完整对话记录（含磁盘日志），此操作不可恢复」，防止误触 |
| 安全围栏 | 先走官方归档流程；运行中的会话（live session）直接拒绝删除，防止撕裂日志产生残影；删除前校验目录形状（`<root>/<project>/<session-id>` 两级），只删目标会话自己的目录 |
| 精确定位 | 使用持久化层提供的 `locate()` 位置，绝不自行拼接路径 |
| 即时反馈 | 删除成功后 toast 提示「已删除会话「xxx」」，会话列表立即刷新 |

## 环境要求

- Windows
- DeepSeek Harness 桌面版已安装，并至少启动过一次（开发时基于 0.2.0-rc.2 验证）

## 安装

一键脚本（自动检测 DSH、建立 `node_modules/@local` 链接、写入 profile 配置）：

```powershell
git clone https://github.com/longhao666666/dsh-session-delete.git
cd dsh-session-delete
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

<details>
<summary>方式二：手动挂载（点开查看）</summary>

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

</details>

两种方式完成后都需**重启 DeepSeek Harness**，并在「插件管理」页确认 `@local/dsh-session-delete` 已启用。

## 使用说明

1. 重启 DSH 后，把鼠标悬停在侧栏任意会话行上，点击垃圾桶图标；或打开会话行菜单，选择「删除会话…」。
2. 在确认弹窗中点击「删除」。
3. 看到「已删除会话「xxx」」toast 即完成，磁盘上的日志目录同时被清理。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

重启 DSH 后生效；克隆下来的仓库文件不会被删除。

<details>
<summary>工作原理（点开查看）</summary>

- `host.js`（Node 侧）：归档 → 通过持久化层定位日志目录 → 校验目录形状 → 删除 → 从工作区脱离 → 发出 `api-session/removed` 事件让客户端刷新列表；所有安全围栏都在这一侧。
- `client.js`（浏览器侧）：向 `sidebar.workspaces.session.menu.item`（行菜单）、`sidebar.workspaces.session.row.action`（悬停按钮）、`shell.overlay`（确认弹窗 + toast）三个扩展槽注入 UI，只负责发起请求与展示。

</details>

## 相关插件

- [dsh-element-context](https://github.com/longhao666666/dsh-element-context) — 对话中圈选 UI 元素注入上下文
- [dsh-ask-mode](https://github.com/longhao666666/dsh-ask-mode) — 会话内一键切换「咨询模式」

## 许可证

[MIT](./LICENSE)
