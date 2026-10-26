/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { RelationshipStore } from "@webpack/common";
import { Toasts } from "@api/legacyToast";

// Discord renamed sendFriendRequest -> sendRequest, so the old props lookup found nothing.
const RelationshipActions = findByPropsLazy("cancelFriendRequest", "addRelationship");

const OUTGOING_REQUEST = 4;

function cancelRequest(userId: string) {
    try {
        RelationshipActions.cancelFriendRequest(userId);
        Toasts.show({ message: "Friend request cancelled ✓", type: Toasts.Type.SUCCESS, id: Toasts.genId() });
    } catch (e) {
        console.error("[CancelFriendRequest] Error:", e);
    }
}

function hasOutgoingRequests(): boolean {
    try {
        const rels = (RelationshipStore as any).getRelationships?.() ?? {};
        for (const type of Object.values(rels)) {
            if (type === OUTGOING_REQUEST) return true;
        }
    } catch {}
    return false;
}

function getUserIdFromOutgoingRelationships(): string | null {
    try {
        const rels = (RelationshipStore as any).getRelationships?.() ?? {};
        for (const [uid, type] of Object.entries(rels)) {
            if (type === OUTGOING_REQUEST) return uid;
        }
    } catch {}
    return null;
}

let observer: MutationObserver | null = null;

function patchBtn(btn: HTMLElement, userId: string) {
    if (btn.dataset.cfp) return;
    btn.dataset.cfp = "1";
    btn.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelRequest(userId);
    }, true);
    btn.removeAttribute("disabled");
    btn.style.cursor = "pointer";
    btn.style.opacity = "1";
}

function scan(root: Document | Element = document) {
    if (!hasOutgoingRequests()) return;
    root.querySelectorAll<HTMLElement>('button[aria-label="Outgoing Friend Request"]').forEach(btn => {
        const wholeModal = btn.closest("[class*='modal'], [class*='userPopout'], [class*='profileBody']") ?? document;
        const avatarImg = (wholeModal as Element)?.querySelector?.("img[src*='cdn.discordapp.com/avatars/']");
        if (avatarImg) {
            const m = avatarImg.getAttribute("src")?.match(/avatars\/(\d+)\//);
            if (m) { patchBtn(btn, m[1]); return; }
        }
        const uid = getUserIdFromOutgoingRelationships();
        if (uid) patchBtn(btn, uid);
    });

    root.querySelectorAll<HTMLElement>('button[disabled][class*="secondary"]').forEach(btn => {
        const container = btn.closest("[class*='container_b50d96'], [class*='dmWelcome'], [class*='privateChannelEmptyMessage']");
        if (!container) return;
        const avatarImg = container.querySelector("img[src*='cdn.discordapp.com/avatars/']");
        if (avatarImg) {
            const m = avatarImg.getAttribute("src")?.match(/avatars\/(\d+)\//);
            if (m) {
                const relType = (RelationshipStore as any).getRelationshipType(m[1]);
                if (relType === OUTGOING_REQUEST) { patchBtn(btn, m[1]); return; }
            }
        }
        const uid = getUserIdFromOutgoingRelationships();
        if (uid) {
            const relType = (RelationshipStore as any).getRelationshipType(uid);
            if (relType === OUTGOING_REQUEST) patchBtn(btn, uid);
        }
    });
}

// Coalesce bursts of DOM mutations into a single scan on the next idle tick,
// instead of scanning per added node on every mutation (Discord mutates the DOM
// constantly — that was a real FPS drain).
let scanScheduled = false;
function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    const run = () => { scanScheduled = false; scan(document); };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
    else setTimeout(run, 250);
}

function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
        observer?.disconnect();
    } else if (observer) {
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleScan();
    }
}

export default definePlugin({
    name: "CancelFriendRequest",
    enabledByDefault: true,
    description: "Cancels a pending friend request by clicking the button again.",
    authors: [{ name: "Nightcord", id: 0n }],

    start() {
        observer = new MutationObserver(() => {
            if (document.visibilityState === "hidden") return;
            // Cheap guard once per batch: if there are no outgoing requests there is
            // nothing to patch, so skip the whole DOM scan.
            if (!hasOutgoingRequests()) return;
            scheduleScan();
        });
        if (document.visibilityState !== "hidden") {
            observer.observe(document.body, { childList: true, subtree: true });
        }
        scan(document);
        document.addEventListener("visibilitychange", handleVisibilityChange);
    },

    stop() {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        observer?.disconnect();
        observer = null;
        document.querySelectorAll<HTMLElement>("[data-cfp]").forEach(el => {
            delete el.dataset.cfp;
        });
    },
});
