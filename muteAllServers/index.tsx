/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { ActiveJoinedThreadsStore, ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore, Menu, React, ReadStateStore, RestAPI, UserGuildSettingsStore } from "@webpack/common";
import { showToast } from "@api/legacyToast";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
// Pause between guilds: firing one PATCH per guild with no delay got the whole
// batch rate-limited (429), so most servers silently stayed unmuted.
const DELAY_BETWEEN_GUILDS_MS = 600;
const MAX_RETRIES = 4;

let running = false;

function MuteIcon({ width = 18, height = 18 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function markAllAsRead() {
    const channels: Array<any> = [];

    Object.values(GuildStore.getGuilds()).forEach(guild => {
        const guildChannels = GuildChannelStore.getChannels(guild.id);
        if (!guildChannels) return;

        const allChannels = [
            ...(guildChannels.SELECTABLE || []),
            ...(guildChannels.VOCAL || []),
            ...Object.values(ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(guild.id))
                .flatMap((threadChannels: any) => Object.values(threadChannels))
        ];

        allChannels.forEach((c: any) => {
            const channelId = c.channel?.id || c.id;
            if (!channelId || !ReadStateStore.hasUnread(channelId)) return;
            channels.push({ channelId, messageId: ReadStateStore.lastMessageId(channelId), readStateType: 0 });
        });
    });

    ChannelStore.getSortedPrivateChannels().forEach((c: any) => {
        if (!ReadStateStore.hasUnread(c.id)) return;
        channels.push({ channelId: c.id, messageId: ReadStateStore.lastMessageId(c.id), readStateType: 0 });
    });

    if (channels.length > 0) {
        FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
    }
}

const MUTE_SETTINGS = {
    muted: true,
    mute_config: { selected_time_window: -1, end_time: null },
    suppress_everyone: true,
    suppress_roles: true,
    message_notifications: 2,
    mobile_push: false,
};

async function muteGuild(id: string): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            await RestAPI.patch({ url: `/users/@me/guilds/${id}/settings`, body: MUTE_SETTINGS });
            return true;
        } catch (e: any) {
            if (e?.status === 429 && attempt < MAX_RETRIES) {
                // Discord gives retry_after in seconds.
                const waitMs = Math.min(60_000, Math.ceil((e?.body?.retry_after ?? 2) * 1000) + 250);
                await sleep(waitMs);
                continue;
            }
            console.warn(`[MuteAllServers] Error for ${id}:`, e);
            return false;
        }
    }
    return false;
}

async function muteAll() {
    if (running) {
        showToast("Already running, please wait…", "message");
        return;
    }
    running = true;

    try {
        // Read first: one local BULK_ACK covers every channel, no per-guild request needed.
        try {
            markAllAsRead();
        } catch (e) {
            console.warn("[MuteAllServers] markAllAsRead failed:", e);
        }

        const guildIds = Object.keys(GuildStore.getGuilds());
        const toMute = guildIds.filter(id => !UserGuildSettingsStore.isMuted(id));
        const alreadyMuted = guildIds.length - toMute.length;

        showToast(
            toMute.length
                ? `Read all ✓ — muting ${toMute.length} server(s)… (~${Math.ceil(toMute.length * DELAY_BETWEEN_GUILDS_MS / 1000)}s)`
                : "Read all ✓ — every server was already muted.",
            "message"
        );

        let ok = 0;
        let failed = 0;
        for (const id of toMute) {
            if (await muteGuild(id)) ok++;
            else failed++;
            await sleep(DELAY_BETWEEN_GUILDS_MS);
        }

        showToast(
            `Muted ${ok} · already muted ${alreadyMuted}${failed ? ` · failed ${failed} (see console)` : ""}`,
            failed ? "failure" : "success"
        );
    } finally {
        running = false;
    }
}

const guildContextPatch = (children: any, { guild }: { guild?: any; }) => {
    if (!children || !Array.isArray(children) || !guild) return;
    children.splice(-1, 0, (
        <Menu.MenuGroup key="nc-mute-all-group">
            <Menu.MenuItem
                id="nc-mute-all-servers"
                label="Mute all servers & mark as read"
                icon={() => <MuteIcon />}
                action={() => muteAll()}
            />
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "MuteAllServers",
    enabledByDefault: true,
    description: "Right-click a server → mute all servers and mark all as read in one click.",
    authors: [{ name: "Nightcord", id: 0n }],

    start() {
        addContextMenuPatch("guild-context", guildContextPatch);
        addContextMenuPatch("guild-header-popout", guildContextPatch);
    },

    stop() {
        removeContextMenuPatch("guild-context", guildContextPatch);
        removeContextMenuPatch("guild-header-popout", guildContextPatch);
    },
});
