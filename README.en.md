<div align="center">

# dsh-session-delete

**One-click session deletion in the sidebar — archive first, then permanently remove the on-disk log**

[![version](https://img.shields.io/badge/version-0.1.0-181717)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-38a834)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-0078D6)](https://github.com/longhao666666/dsh-session-delete)
[![dsh](https://img.shields.io/badge/DeepSeek_Harness-%3E%3D_0.2.0--rc.2-5D45B0)](https://github.com/longhao666666/dsh-session-delete)
[![stars](https://img.shields.io/github/stars/longhao666666/dsh-session-delete?color=F9C513)](https://github.com/longhao666666/dsh-session-delete/stargazers)

[简体中文](./README.md) | English

</div>

---

> **Zero dependencies**: a regular Cordis plugin loaded from plain JS source — no build step, no Token / API key, no extra services.

Deletion removes the session's complete record (including the on-disk log) and is irreversible — if you just want it out of sight, keep using the built-in "archive".

## Features

| Capability | Details |
| --- | --- |
| Two entries | A trash button on session-row hover; a red 「删除会话…」 item in the row menu (after "archive") |
| Confirm dialog | Explicitly warns 「将永久删除「xxx」的完整对话记录（含磁盘日志），此操作不可恢复」 to prevent accidents |
| Safety fences | Archives through the official flow first; live (running) sessions are refused outright to avoid torn logs; verifies the `<root>/<project>/<session-id>` two-level shape and deletes only the target session's own directory |
| Precise location | Uses the persistence layer's `locate()` — never a re-derived path |
| Instant feedback | A 「已删除会话」 toast on success; the session list refreshes immediately |

## Requirements

- Windows
- DeepSeek Harness desktop installed and launched at least once (developed against 0.2.0-rc.2)

## Installation

One-click script (detects DSH, creates the `node_modules/@local` link, updates the profile config):

```powershell
git clone https://github.com/longhao666666/dsh-session-delete.git
cd dsh-session-delete
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

<details>
<summary>Manual mount (click to expand)</summary>

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
$repo    = "<path-to-clone>"    # e.g. "$HOME\code\dsh-session-delete"

New-Item -ItemType Directory -Force "$profile\node_modules\@local" | Out-Null
New-Item -ItemType Junction -Path "$profile\node_modules\@local\dsh-session-delete" -Target $repo
```

Then merge these fields into `$profile\package.json` (append inside existing fields):

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

Either way, **restart DeepSeek Harness** afterwards and confirm `@local/dsh-session-delete` is enabled on the plugin management page.

## Usage

1. After restarting DSH, hover any session row in the sidebar and click the trash icon, or open the row menu and choose 「删除会话…」.
2. Confirm by clicking 「删除」 in the dialog.
3. The 「已删除会话「xxx」」 toast marks completion — the on-disk log directory is cleaned at the same time.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

Takes effect after restarting DSH; the cloned repo files are left untouched.

<details>
<summary>How it works (click to expand)</summary>

- `host.js` (Node side): archive → locate the log directory via the persistence layer → verify the directory shape → delete → detach from the workspace → emit `api-session/removed` so the client refreshes the list. All safety fences live on this side.
- `client.js` (browser side): injects UI into three extension slots — `sidebar.workspaces.session.menu.item` (row menu), `sidebar.workspaces.session.row.action` (hover button) and `shell.overlay` (confirm dialog + toast) — only requesting and displaying.

</details>

## Related plugins

- [dsh-element-context](https://github.com/longhao666666/dsh-element-context) — pick UI elements into the conversation context
- [dsh-ask-mode](https://github.com/longhao666666/dsh-ask-mode) — one-click consultation mode in the session

## License

[MIT](./LICENSE)
