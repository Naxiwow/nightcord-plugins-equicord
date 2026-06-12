<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:09090d,50:7f1d1d,100:dc2626&height=200&section=header&text=Nightcord%20Plugins&fontSize=60&fontColor=f5f5f5&animation=fadeIn&fontAlignY=38&desc=Equicord%20compatibility%20refork&descAlignY=58&descSize=16&descColor=a3a3a3" width="100%"/>

<br/>

[![Equicord](https://img.shields.io/badge/Equicord-dc2626?style=for-the-badge&logo=discord&logoColor=white&labelColor=09090d)](https://github.com/Equicord/Equicord)
[![Nightcord](https://img.shields.io/badge/Nightcord-dc2626?style=for-the-badge&logo=gitea&logoColor=white&labelColor=09090d)](https://git.nightcord.st/nightcord/nightcord)
[![GitHub](https://img.shields.io/badge/GitHub-dc2626?style=for-the-badge&logo=github&logoColor=white&labelColor=09090d)](https://github.com/Naxiwow)

</div>

---

## About

Compatibility refork of select [Nightcord](https://git.nightcord.st/nightcord/nightcord) plugins for [Equicord](https://github.com/Equicord/Equicord).

I did **not** write these plugins. All credit goes to the original Nightcord contributors.  
This repo only exists to make them compile and run in Equicord without breaking voice/audio.

---

## Plugins

| Plugin | Description |
|---|---|
| **cancelFriendRequest** | Click the "Friend Request Sent" button again to cancel it |
| **eventLogs** | Comprehensive event log — voice joins/leaves, friends, server changes |
| **exportDM** | Export DMs to HTML / TXT / JSON / CSV / Markdown |
| **followUser** | Right-click a user → Follow User — auto-joins their voice channel |
| **lockGroup** | Lock group DMs — auto-kicks anyone added without owner approval |
| **messageLoggerEnhanced** | Full message logger with deleted/edited tracking and image cache |
| **muteAllServers** | Right-click any server → mute all + mark everything as read |
| **selfDestruct** | Messages auto-delete after a configurable delay |

---

## What was changed

| Plugin | Issue | Fix |
|---|---|---|
| **eventLogs** | `import { t, useTranslation } from "../autoTranslateNightcord"` | Replaced with `const t = (s: string) => s` |
| **eventLogs** | `VOICE_STATE_UPDATES` blocking audio pipeline synchronously | Wrapped effects in `setTimeout(0)` |
| **exportDM** | Same `autoTranslateNightcord` import | Replaced with inline stub |
| **followUser** | Minor risk of blocking audio in voice handler | Effects deferred via `setTimeout(0)` |
| **messageLoggerEnhanced** | `@nightcordplugins/...` webpack path aliases | Replaced with relative paths |
| **muteAllServers** | `findByPropsLazy` called inside async function | Moved to module level |
| **cancelFriendRequest** | — | Compatible as-is |
| **lockGroup** | — | Compatible as-is |
| **selfDestruct** | — | Compatible as-is |

> **Excluded:** `FakeVoice` and `VolumeBooster` — patch webpack chunks co-located with Discord's voice activity detection. Permanently breaks auto input sensitivity even when disabled. Not fixable without a full rewrite.

---

## Installation

Drop any plugin folder into `src/userplugins/` in your Equicord source, then:

```bash
pnpm build
```

Copy `dist/desktop.asar` → `%APPDATA%\Equicord\equicord.asar` and restart Discord.

---

## Credits

- [Nightcord](https://git.nightcord.st/nightcord/nightcord) — original plugin authors
- [Equicord](https://github.com/Equicord/Equicord) — the client mod
- [Vencord](https://github.com/Vendicated/Vencord) — upstream framework

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:dc2626,50:7f1d1d,100:09090d&height=120&section=footer" width="100%"/>
</div>
