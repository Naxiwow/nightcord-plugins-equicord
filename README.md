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

<details>
<summary><b>eventLogs</b> — 2 fixes</summary>

<br/>

**Fix 1 — nightcord-only import**
```diff
- import { t, useTranslation } from "../autoTranslateNightcord";
+ const t = (s: string) => s;
+ const useTranslation = () => ({ t });
```

**Fix 2 — VOICE_STATE_UPDATES blocking Discord's audio pipeline**
```diff
- sub("VOICE_STATE_UPDATES", d => {
-     // ... all processing sync, blocks audio thread
-     pushLog(...);
- });
+ sub("VOICE_STATE_UPDATES", d => {
+     const snapshot = [...d.voiceStates];
+     // state update stays sync (needed for correctness)
+     for (const s of snapshot) { prevVS.set(s.userId, s); }
+     // heavy work deferred — audio thread never blocked
+     setTimeout(() => { for (const s of snapshot) { pushLog(...); } }, 0);
+ });
```

</details>

<details>
<summary><b>exportDM</b> — 1 fix</summary>

<br/>

**Fix — nightcord-only import**
```diff
- import { t } from "../autoTranslateNightcord";
+ const t = (s: string) => s;
```

</details>

<details>
<summary><b>followUser</b> — 1 fix</summary>

<br/>

**Fix — voice handler side-effects deferred to avoid audio blocking**
```diff
  function onVoiceStateUpdates(data: any) {
-     if (newCh !== followedChannel) {
-         followedChannel = newCh;
-         resetInactivityTimer();
-         joinChannel(newCh);        // dispatches sync
-         Toasts.show(...);          // triggers sync
-     }
+     // state updated sync so future comparisons are correct
+     followedChannel = newCh;
+     // effects deferred — audio dispatch thread never blocked
+     setTimeout(() => {
+         resetInactivityTimer();
+         joinChannel(newCh);
+         Toasts.show(...);
+     }, 0);
  }
```

</details>

<details>
<summary><b>messageLoggerEnhanced</b> — 2 fixes</summary>

<br/>

**Fix 1 — nightcord webpack path alias in `LogsButton.tsx`**
```diff
- import { cl } from "@nightcordplugins/messageLoggerEnhanced/index";
+ import { cl } from "../index";
```

**Fix 2 — nightcord webpack path aliases in `FolderSelectInput.tsx`**
```diff
- import { cl, Native, settings } from "@nightcordplugins/messageLoggerEnhanced/index";
- import { DEFAULT_IMAGE_CACHE_DIR } from "@nightcordplugins/messageLoggerEnhanced/utils/constants";
+ import { cl, Native, settings } from "../index";
+ import { DEFAULT_IMAGE_CACHE_DIR } from "../utils/constants";
```

</details>

<details>
<summary><b>muteAllServers</b> — 1 fix</summary>

<br/>

**Fix — `findByPropsLazy` called inside async function (new proxy each invocation)**
```diff
+ const updateGuildNotificationSettings = findByPropsLazy("updateGuildNotificationSettings");

  async function muteAll() {
-     const updateSettings = findByPropsLazy("updateGuildNotificationSettings");
-     if (updateSettings?.updateGuildNotificationSettings) {
-         await updateSettings.updateGuildNotificationSettings(id, settings);
+     if (updateGuildNotificationSettings?.updateGuildNotificationSettings) {
+         await updateGuildNotificationSettings.updateGuildNotificationSettings(id, notifSettings);
      }
  }
```

</details>

<details>
<summary><b>cancelFriendRequest / lockGroup / selfDestruct</b> — no changes needed</summary>

<br/>

Compatible with Equicord as-is. No nightcord-specific imports, no voice patches.

</details>

<br/>

> **Excluded:** `FakeVoice` and `VolumeBooster` — both apply compile-time webpack patches on chunks co-located with Discord's voice activity detection. Active regardless of the plugin toggle in settings, permanently breaking auto input sensitivity. Not fixable without a full rewrite.

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
