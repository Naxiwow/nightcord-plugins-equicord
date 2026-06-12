# Nightcord plugins refork for Equicord

Compatibility refork of select [Nightcord](https://github.com/Equicord/Nightcord) plugins for use with [Equicord](https://github.com/Equicord/Equicord).

I did **not** write these plugins. All credit goes to the original Nightcord contributors. This repo only exists to make them compile and run in Equicord without breaking voice/audio.

---

## What was changed

| Plugin | Original issue | Fix applied |
|---|---|---|
| **eventLogs** | `import { t, useTranslation } from "../autoTranslateNightcord"` (nightcord-only module) | Replaced with inline stubs `const t = (s: string) => s` |
| **eventLogs** | `VOICE_STATE_UPDATES` handler running synchronously, blocking Discord's audio pipeline | Wrapped effects in `setTimeout(0)` — state updated sync, side-effects deferred |
| **exportDM** | `import { t } from "../autoTranslateNightcord"` | Replaced with inline stub |
| **followUser** | `VOICE_STATE_UPDATES` handler — minor risk of blocking audio | State update kept sync, `joinChannel` + toast deferred via `setTimeout(0)` |
| **messageLoggerEnhanced** | `@nightcordplugins/messageLoggerEnhanced/index` path alias (nightcord webpack alias) | Replaced with relative path `../index` |
| **messageLoggerEnhanced** | `@nightcordplugins/messageLoggerEnhanced/utils/constants` path alias | Replaced with `../utils/constants` |
| **muteAllServers** | `findByPropsLazy` called inside async function body (new proxy each call) | Moved to module level |
| **cancelFriendRequest** | — | Compatible as-is, no changes |
| **lockGroup** | — | Compatible as-is, no changes |
| **selfDestruct** | — | Compatible as-is, no changes |

> **Removed (unfixable without full rewrite):**
> `FakeVoice` and `VolumeBooster` — both patch webpack chunks co-located with Discord's voice activity detection code. The patches are compile-time and always active regardless of the plugin toggle, which permanently breaks auto input sensitivity. They are excluded from this repo.

---

## Installation

Drop any plugin folder into `src/userplugins/` inside your Equicord source directory, then rebuild:

```
pnpm build
```

Copy `dist/desktop.asar` to `%APPDATA%\Equicord\equicord.asar`, or use dev injection (see Equicord docs).

---

## Plugins included

| Plugin | Description |
|---|---|
| **cancelFriendRequest** | Click the "Friend Request Sent" button again to cancel it |
| **eventLogs** | Comprehensive event log — voice joins/leaves, friends, server changes |
| **exportDM** | Export DMs to HTML / TXT / JSON / CSV / Markdown with a header bar button |
| **followUser** | Right-click a user → Follow User. Auto-joins their voice channel. Heart icon in header bar |
| **lockGroup** | Lock group DMs — auto-kicks anyone added without owner approval |
| **messageLoggerEnhanced** | Full message logger with deleted/edited tracking, image cache, folder export |
| **muteAllServers** | Right-click any server → mute all servers + mark everything as read |
| **selfDestruct** | Messages auto-delete after a configurable delay. Toggle via chat bar icon |

---

## Credits

- [Nightcord](https://github.com/Equicord/Nightcord) — original plugin authors
- [Equicord](https://github.com/Equicord/Equicord) — the client mod these are built for
- [Vencord](https://github.com/Vendicated/Vencord) — the upstream framework
