/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, UserStore } from "@webpack/common";
import { Channel } from "discord-types/general";

const lockedGroups = new Set<string>();

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Debug mode (detailed logs)",
        default: false
    }
});

function debugLog(message: string) {
    if (settings.store.debugMode) console.log(`[LockGroup] DEBUG: ${message}`);
}

function interceptAddMember(originalMethod: any) {
    return function (this: any, ...args: any[]) {
        const [requestData] = args;
        if (requestData?.url?.match(/^\/channels\/\d+\/recipients\/\d+$/)) {
            const urlParts = requestData.url.split("/");
            const channelId = urlParts[2];
            const targetUserId = urlParts[4];

            if (lockedGroups.has(channelId)) {
                const channel = ChannelStore.getChannel(channelId);
                const currentUserId = UserStore.getCurrentUser()?.id;

                if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                    debugLog("Owner allowed to add members");
                    return originalMethod.apply(this, args);
                }

                if (channel && channel.type === 3) {
                    const channelName = channel.name || "Groupe sans nom";
                    setTimeout(async () => {
                        try {
                            await RestAPI.del({ url: `/channels/${channelId}/recipients/${targetUserId}` });
                            if (settings.store.showNotifications) {
                                showNotification({ title: "LockGroup - Auto-kick", body: `Membre non autorisé retiré de "${channelName}"`, icon: undefined });
                            }
                        } catch (error) {
                            console.error("[LockGroup] Auto-kick error:", error);
                        }
                    }, 100);

                    if (settings.store.showNotifications) {
                        showNotification({ title: "LockGroup - Ajout non autorisé", body: `Ajout détecté dans "${channelName}" — auto-kick en cours...`, icon: undefined });
                    }
                }
            }
        }
        return originalMethod.apply(this, args);
    };
}

function toggleGroupLock(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!channel || channel.type !== 3 || !currentUserId) return;

    const channelName = channel.name || "Groupe sans nom";

    if (channel.ownerId !== currentUserId) {
        if (settings.store.showNotifications) {
            showNotification({ title: "LockGroup", body: "Seul le propriétaire peut verrouiller/déverrouiller le groupe", icon: undefined });
        }
        return;
    }

    if (lockedGroups.has(channelId)) {
        lockedGroups.delete(channelId);
        if (settings.store.showNotifications) {
            showNotification({ title: "LockGroup", body: `Groupe "${channelName}" déverrouillé`, icon: undefined });
        }
    } else {
        lockedGroups.add(channelId);
        if (settings.store.showNotifications) {
            showNotification({ title: "LockGroup", body: `Groupe "${channelName}" verrouillé`, icon: undefined });
        }
    }
}

const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel || channel.type !== 3) return;
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (channel.ownerId !== currentUserId) return;

    const isLocked = lockedGroups.has(channel.id);
    const group = findGroupChildrenByChildId("leave-channel", children);
    if (!group) return;

    group.push(<Menu.MenuSeparator key="lock-sep" />);

    if (!isLocked) {
        group.push(
            <Menu.MenuItem key="lock-group" id="vc-lock-group" label="Verrouiller le groupe" color="danger"
                action={() => toggleGroupLock(channel.id)}
                icon={() => (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z" />
                    </svg>
                )}
            />
        );
    } else {
        group.push(
            <Menu.MenuItem key="unlock-group" id="vc-unlock-group" label="Déverrouiller le groupe" color="brand"
                action={() => toggleGroupLock(channel.id)}
                icon={() => (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z" />
                    </svg>
                )}
            />
        );
    }
};

let originalPutMethod: any = null;

export default definePlugin({
    name: "LockGroup",
    enabledByDefault: true,
    description: "Lock/unlock groups via the context menu (prevents adding members)",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: { "gdm-context": GroupContextMenuPatch },

    flux: {
        MESSAGE_CREATE(event: { message: any; }) {
            const { message } = event;
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (message?.type !== 1) return;
            const channelId = message.channel_id;
            if (!lockedGroups.has(channelId)) return;
            const channel = ChannelStore.getChannel(channelId);
            if (!channel || channel.type !== 3 || channel.ownerId !== currentUserId) return;
            const addedUserId = message.mentions?.[0]?.id;
            const addedByUserId = message.author?.id;
            if (!addedUserId || addedByUserId === currentUserId) return;
            const channelName = channel.name || "Groupe sans nom";
            setTimeout(async () => {
                try {
                    await RestAPI.del({ url: `/channels/${channelId}/recipients/${addedUserId}` });
                } catch (error) {
                    debugLog(`Kick error: ${error}`);
                }
            }, 150);
            if (settings.store.showNotifications) {
                showNotification({ title: "LockGroup - Ajout non autorisé", body: `Membre ajouté sans autorisation dans "${channelName}" puis retiré`, icon: undefined });
            }
        }
    },

    start() {
        if (RestAPI?.put) {
            originalPutMethod = RestAPI.put;
            RestAPI.put = interceptAddMember(originalPutMethod);
        }
    },

    stop() {
        if (originalPutMethod && RestAPI) {
            RestAPI.put = originalPutMethod;
            originalPutMethod = null;
        }
        lockedGroups.clear();
    }
});
