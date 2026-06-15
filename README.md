<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:040004,40:2d0010,100:8b0000&height=220&section=header&text=nightcord-plugins-equicord&fontSize=42&fontColor=f5f0f0&animation=fadeIn&fontAlignY=40&desc=Compatibility%20refork%20of%20Nightcord%20plugins%20for%20Equicord&descAlignY=60&descSize=16&descColor=cc0000" width="100%"/>

<br/>

[![Equicord](https://img.shields.io/badge/Equicord-8b0000?style=for-the-badge&logo=discord&logoColor=f5f0f0&labelColor=080008)](https://github.com/Equicord/Equicord)
[![Nightcord](https://img.shields.io/badge/Nightcord-8b0000?style=for-the-badge&logo=gitea&logoColor=f5f0f0&labelColor=080008)](https://git.nightcord.st/nightcord/nightcord)
[![TypeScript](https://img.shields.io/badge/TypeScript-8b0000?style=for-the-badge&logo=typescript&logoColor=f5f0f0&labelColor=080008)](https://github.com/Naxiwow)

</div>

<br/>

<div align="center">

```
I did not write these plugins. Credit goes to the original Nightcord contributors.
This repo makes them compile and run in Equicord without breaking voice / audio.
```

</div>

<br/>

## ◈ &nbsp; Plugins

<div align="center">

| Plugin | Description |
|:---|:---|
| **cancelFriendRequest** | Click "Friend Request Sent" again to cancel it |
| **eventLogs** | Comprehensive event log — voice joins/leaves, friends, server changes |
| **exportDM** | Export DMs to HTML · TXT · JSON · CSV · Markdown |
| **followUser** | Right-click → Follow User — auto-joins their voice channel |
| **lockGroup** | Lock group DMs — auto-kicks anyone added without owner approval |
| **loginWithToken** | Adds a "Login with Token" button on the Discord login page |
| **messageCleaner** | Cleans all your messages in a channel or server with rate-limit handling |
| **messageLoggerEnhanced** | Full message logger with deleted/edited tracking and image cache |
| **multiInstance** | Opens a 2nd Discord window with another account |
| **muteAllServers** | Right-click any server → mute all + mark everything as read |
| **selfDestruct** | Messages auto-delete after a configurable delay |
| **silentDelete** | Silently deletes a message — bypasses message loggers via placeholder replacement |
| **tokenImporter** | Import and manage multiple Discord accounts via tokens |
| **unlimitedAccounts** | Increases the number of accounts you can add (default: unlimited) |

</div>

<br/>

## ◈ &nbsp; What was changed

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
-     pushLog(...);   // sync, blocks audio thread
- });
+ sub("VOICE_STATE_UPDATES", d => {
+     const snapshot = [...d.voiceStates];
+     for (const s of snapshot) { prevVS.set(s.userId, s); }   // sync — correctness
+     setTimeout(() => { for (const s of snapshot) { pushLog(...); } }, 0);  // deferred
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
-     followedChannel = newCh;
-     resetInactivityTimer();
-     joinChannel(newCh);
-     Toasts.show(...);
+     followedChannel = newCh;   // sync — future comparisons correct
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
<summary><b>multiInstance</b> — 2 fixes</summary>

<br/>

**Fix 1 — nightcord translation function + leftover `t()` call in JSX**
```diff
- import { t } from "../autoTranslateNightcord";
  ...
- {t(allAccounts.length !== 1 ? "OTHER ACCOUNTS" : "OTHER ACCOUNT")}
+ {allAccounts.length !== 1 ? "OTHER ACCOUNTS" : "OTHER ACCOUNT"}
```

**Fix 2 — nightcord-specific native import replaced with inline implementation**
```diff
- import { registerMediaPermissionsForSession } from "../../nightcord/main/mediaPermissions";
+ function registerMediaPermissionsForSession(ses: Electron.Session): void {
+     ses.setPermissionRequestHandler((_wc, permission, callback) => {
+         const allowed = ["media", "mediaKeySystem", "geolocation", "notifications",
+                          "fullscreen", "pointerLock", "openExternal", "unknown"];
+         callback(allowed.includes(permission));
+     });
+ }
```

</details>

<details>
<summary><b>muteAllServers</b> — 1 fix</summary>

<br/>

**Fix — `findByPropsLazy` called inside async function**
```diff
+ const updateGuildNotificationSettings = findByPropsLazy("updateGuildNotificationSettings");

  async function muteAll() {
-     const updateSettings = findByPropsLazy("updateGuildNotificationSettings");
-     await updateSettings.updateGuildNotificationSettings(id, settings);
+     await updateGuildNotificationSettings.updateGuildNotificationSettings(id, notifSettings);
  }
```

</details>

<details>
<summary><b>tokenImporter</b> — 1 fix</summary>

<br/>

**Fix — nightcord translation function + unused import**
```diff
- import { t } from "../autoTranslateNightcord";
- import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
+ import { addHeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
  ...
- placeholder={t("Search accounts...")}
+ placeholder={"Search accounts..."}
```

</details>

<details>
<summary><b>cancelFriendRequest · lockGroup · loginWithToken · messageCleaner · selfDestruct · silentDelete · unlimitedAccounts</b> — no changes</summary>

<br/>

Compatible with Equicord as-is. No nightcord-specific imports or patches needed.

</details>

<br/>

> **Excluded:** `FakeVoice` and `VolumeBooster` — both apply compile-time webpack patches on chunks co-located with Discord's voice activity detection. Active regardless of the plugin toggle, permanently breaking auto input sensitivity. Not fixable without a full rewrite.

<br/>

## ◈ &nbsp; Installation

Drop any plugin folder into `src/userplugins/` in your Equicord source, then:

```bash
pnpm build
```

Copy `dist/desktop.asar` → `%APPDATA%\Equicord\equicord.asar` and restart Discord.

<br/>

## ◈ &nbsp; Credits

- [Nightcord](https://git.nightcord.st/nightcord/nightcord) — original plugin authors
- [Equicord](https://github.com/Equicord/Equicord) — the client mod
- [Vencord](https://github.com/Vendicated/Vencord) — upstream framework

<br/>

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8b0000,50:2d0010,100:040004&height=140&section=footer" width="100%"/>

</div>