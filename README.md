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
I did not write most of these plugins. Credit goes to the original Nightcord contributors.
This repo makes them compile and run in Equicord without breaking voice / audio.
Plugins marked ✦ are original work.
```

</div>

<br/>

## ◈ &nbsp; Plugins

All plugins live in [`plugins/`](plugins). **36 plugins**, grouped below. ✦ = original plugin, not from Nightcord.

### 💬 Messages & chat

| Plugin | Description |
|:---|:---|
| [**messageCleaner**](plugins/messageCleaner) | Cleans all your messages in a channel or server with rate-limit handling |
| [**messageLoggerEnhanced**](plugins/messageLoggerEnhanced) | Full message logger with deleted/edited tracking and image cache |
| [**messagePlanner**](plugins/messagePlanner) ✦ | Schedule messages: pick server, channel, date/time and how many times (with an interval) |
| [**selfDestruct**](plugins/selfDestruct) | Messages auto-delete after a configurable delay |
| [**silentDelete**](plugins/silentDelete) | Silently deletes a message — bypasses message loggers via placeholder replacement |
| [**snipeAttachments**](plugins/snipeAttachments) | Downloads and caches incoming attachments so you keep them even if deleted |
| [**fastPing**](plugins/fastPing) | Double-click a user ID typed in the chat box to turn it into a mention |
| [**roleMentionFix**](plugins/roleMentionFix) ✦ | Roles always show up in the `@` autocomplete, even when many users match |
| [**realtimeTimestamps**](plugins/realtimeTimestamps) | Live seconds on every message timestamp |
| [**fakeDM**](plugins/fakeDM) ✦ | Injects fake local messages into a DM or group DM |
| [**exportDM**](plugins/exportDM) | Export DMs to HTML · TXT · JSON · CSV · Markdown |

### 🏰 Servers

| Plugin | Description |
|:---|:---|
| [**muteAllServers**](plugins/muteAllServers) | Right-click any server → mute all + mark everything as read |
| [**leaveAllServers**](plugins/leaveAllServers) | Leave all selected servers from the server context menu |
| [**serverCloner**](plugins/serverCloner) | Clone a whole server (channels, roles, permissions, icon, emojis) to one you administer |
| [**copyTag**](plugins/copyTag) ✦ | Copy another server's tag (text, badge, colours) onto a server you own — tells you when the badge pack is missing |
| [**expressionDownloader**](plugins/expressionDownloader) ✦ | Right-click an emoji or sticker → download it |

### 👥 Friends & groups

| Plugin | Description |
|:---|:---|
| [**cancelFriendRequest**](plugins/cancelFriendRequest) | Click "Friend Request Sent" again to cancel it |
| [**unfriendAll**](plugins/unfriendAll) | Remove all selected friends from the friend context menu |
| [**lockGroup**](plugins/lockGroup) | Lock group DMs — auto-kicks anyone added without owner approval |
| [**SaveGroups**](plugins/SaveGroups) | Keeps group DMs you were kicked from, read-only, with saved history |
| [**followUser**](plugins/followUser) | Right-click → Follow User — auto-joins their voice channel |
| [**mutualScanner**](plugins/mutualScanner) | Scans servers for members that share a mutual friend with you |

### 🎙️ Voice & streaming

| Plugin | Description |
|:---|:---|
| [**fakeDeafen**](plugins/fakeDeafen) | Appear deafened and muted to others while you can still hear and talk (keybind) |
| [**customStream**](plugins/customStream) | Custom stream preview images with profiles & slideshow |
| [**streamBlurPrivacy**](plugins/streamBlurPrivacy) | Blur messages in selected conversations while streaming |
| [**disableStreamerMode**](plugins/disableStreamerMode) ✦ | Stops Discord from auto-enabling streamer mode when OBS is detected |

### 🔑 Accounts & profile

| Plugin | Description |
|:---|:---|
| [**loginWithToken**](plugins/loginWithToken) | Adds a "Login with Token" button on the Discord login page |
| [**tokenImporter**](plugins/tokenImporter) | Import and manage multiple Discord accounts via tokens |
| [**multiInstance**](plugins/multiInstance) | Opens a 2nd Discord window with another account |
| [**unlimitedAccounts**](plugins/unlimitedAccounts) | Increases the number of accounts you can add (default: unlimited) |
| [**fastPFP**](plugins/fastPFP) | Set any image as your profile picture or banner from the context menu |

### 📊 Logs & monitoring

| Plugin | Description |
|:---|:---|
| [**eventLogs**](plugins/eventLogs) | Comprehensive event log — voice joins/leaves, friends, server changes |
| [**Surveillance**](plugins/Surveillance) | Local live event dashboard for selected users and servers |

### ⚡ Performance & fixes

| Plugin | Description |
|:---|:---|
| [**fastDiscord**](plugins/fastDiscord) | Performance profile: animations, media, memory cache, background FPS, presence |
| [**fixPostMessageTransport**](plugins/fixPostMessageTransport) ✦ | Silences hCaptcha PostMessageTransport errors to reduce captcha lag |

### 🎮 Games

| Plugin | Description |
|:---|:---|
| [**wordBomb**](plugins/wordBomb) ✦ | BombParty / WordBomb assistant with a draggable overlay |

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
<summary><b>muteAllServers</b> — rewritten (October 2026)</summary>

<br/>

The original fired one `ack` + one settings request per server with no pause. Discord rate-limited (429) almost all of them, so most servers stayed unmuted, and the plugin still announced success.

- servers already muted are skipped
- one request per server, 600 ms apart, with automatic retry honouring Discord's `retry_after`
- "mark as read" is a single local `BULK_ACK` instead of one request per server
- the final toast shows real numbers (`Muted X · already muted Y · failed Z`)

</details>

<details>
<summary><b>tokenImporter</b> — 1 fix</summary>

<br/>

**Fix — nightcord translation function**
```diff
- import { t } from "../autoTranslateNightcord";
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

<details>
<summary><b>Equicord compatibility shims</b> — required by most plugins</summary>

<br/>

Equicord keeps changing small internal APIs, so the plugins here import two tiny helper modules. Copy both files from [`shims/api/`](shims/api) into `src/api/` of your Equicord source:

- **`legacyToast.ts`** — recent Equicord removed `Toasts` / `createToast` and only keeps `showToast({ text, variant })`. This module keeps the old `Toasts.show({ message, type })` and `showToast("text", "success")` calls working. Plugins import `{ showToast, Toasts } from "@api/legacyToast"`.
- **`pluginI18n.ts`** — identity replacement for Nightcord's `t()` translation helper (`@api/pluginI18n`).

Also make sure your `tsconfig.json` maps `@plugins/*` to `./src/userplugins/*` as well.

</details>

> **Not included here:** server-specific plugins, third-party libraries (`philsPluginLibrary`, `betterMicrophone`) and the plugins that have their own repository (`better-quest-completer`, `copyProfile`, `weatherStatus`, `discordLyricsSpotifyStatus`).

> **Excluded:** `FakeVoice` and `VolumeBooster` — both apply compile-time webpack patches on chunks co-located with Discord's voice activity detection. Active regardless of the plugin toggle, permanently breaking auto input sensitivity. Not fixable without a full rewrite.

<br/>

## ◈ &nbsp; Installation

1. Copy the two files of [`shims/api/`](shims/api) into `src/api/` of your Equicord source.
2. Drop the plugin folders you want from [`plugins/`](plugins) into `src/userplugins/`.
3. Build, then inject the build into Discord with the Equicord installer and restart Discord:

```bash
pnpm build
```

<br/>

## ◈ &nbsp; Credits

- [Nightcord](https://git.nightcord.st/nightcord/nightcord) — original plugin authors
- [Equicord](https://github.com/Equicord/Equicord) — the client mod
- [Vencord](https://github.com/Vendicated/Vencord) — upstream framework

<br/>

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8b0000,50:2d0010,100:040004&height=140&section=footer" width="100%"/>

</div>