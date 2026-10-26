/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { StickerFormatType } from "@vencord/discord-types/enums";
import { Constants, FluxDispatcher, Menu, RestAPI, StickersStore } from "@webpack/common";
import { Toasts } from "@api/legacyToast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmojiData { t: "Emoji"; id: string; name: string; isAnimated: boolean; }
interface StickerData { t: "Sticker"; id: string; name: string; format_type: number; }
type Data = EmojiData | StickerData;

// Lottie stickers are vector JSON, not a downloadable image — skip them.
const StickerExtMap: Record<number, string> = {
    [StickerFormatType.PNG]: "png",
    [StickerFormatType.APNG]: "png",
    [StickerFormatType.GIF]: "gif",
};

// ── URL building (same CDN/proxy hosts ExpressionCloner uses) ────────────────────
function getDownloadUrl(data: Data): string {
    if (data.t === "Emoji") {
        const ext = data.isAnimated ? "gif" : "png";
        return `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/emojis/${data.id}.${ext}?size=512&quality=lossless`;
    }
    const ext = StickerExtMap[data.format_type] ?? "png";
    return `${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}/stickers/${data.id}.${ext}?size=512&quality=lossless`;
}

function toast(message: string, type: number) {
    Toasts.show({ id: Toasts.genId(), message, type });
}

// ── Download to disk ────────────────────────────────────────────────────────────
async function download(data: Data) {
    const url = getDownloadUrl(data);
    const ext = url.split("?")[0].split(".").pop() ?? "png";
    const safeName = (data.name || data.id).replace(/[/\\:*?"<>|]/g, "_").slice(0, 64);
    const filename = `${safeName}.${ext}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);

        toast(`Téléchargé : ${filename}`, Toasts.Type.SUCCESS);
    } catch (e) {
        console.error("[ExpressionDownloader]", e);
        toast("Échec du téléchargement", Toasts.Type.FAILURE);
    }
}

// ── Fetch sticker metadata (need format_type) ────────────────────────────────────
async function fetchSticker(id: string): Promise<StickerData> {
    const cached = StickersStore.getStickerById(id);
    if (cached) return { t: "Sticker", id, name: (cached as any).name, format_type: (cached as any).format_type };

    const { body } = await RestAPI.get({ url: Constants.Endpoints.STICKER(id) });
    FluxDispatcher.dispatch({ type: "STICKER_FETCH_SUCCESS", sticker: body });
    return { t: "Sticker", id, name: body.name, format_type: body.format_type };
}

// ── Menu item ───────────────────────────────────────────────────────────────────
function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
        </svg>
    );
}

function buildItem(type: "Emoji" | "Sticker", getData: () => Data | Promise<Data>) {
    return (
        <Menu.MenuItem
            id="expression-download"
            key="expression-download"
            label={`Télécharger ${type === "Emoji" ? "l'emoji" : "le sticker"} (PC)`}
            icon={DownloadIcon}
            action={async () => {
                try {
                    await download(await getData());
                } catch (e) {
                    console.error("[ExpressionDownloader]", e);
                    toast("Impossible de récupérer l'expression", Toasts.Type.FAILURE);
                }
            }}
        />
    );
}

function isGifUrl(url?: string) {
    if (!url) return false;
    try {
        const u = new URL(url);
        return u.pathname.endsWith(".gif") || u.searchParams.get("animated") === "true";
    } catch {
        return false;
    }
}

// Right-click an emoji/sticker inside a message.
const messageContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const { favoriteableId, favoriteableType, itemHref, itemSrc } = props ?? {};
    if (!favoriteableId) return;

    let item: any;
    if (favoriteableType === "emoji") {
        const match = props.message?.content?.match(
            RegExp(`<a?:(\\w+)(?:~\\d+)?:${favoriteableId}>|/emojis/${favoriteableId}\\.`)
        );
        const reaction = props.message?.reactions?.find((r: any) => r.emoji.id === favoriteableId);
        if (!match && !reaction) return;
        const name = (match && match[1]) ?? reaction?.emoji.name ?? "emoji";
        item = buildItem("Emoji", () => ({ t: "Emoji", id: favoriteableId, name, isAnimated: isGifUrl(itemHref ?? itemSrc) }));
    } else if (favoriteableType === "sticker") {
        const sticker = props.message?.stickerItems?.find((s: any) => s.id === favoriteableId);
        if (sticker?.format_type === StickerFormatType.LOTTIE) return; // vector, not an image
        item = buildItem("Sticker", () => fetchSticker(favoriteableId));
    }

    if (item) (findGroupChildrenByChildId("copy-link", children) ?? children).push(item);
};

// Right-click an emoji/sticker in the picker.
const pickerContextPatch: NavContextMenuPatchCallback = (children, props: { target: HTMLElement; }) => {
    const { id, name, type } = props?.target?.dataset ?? {};
    if (!id) return;

    if (type === "emoji" && name) {
        const firstChild = props.target.firstChild as HTMLImageElement | null;
        children.push(buildItem("Emoji", () => ({ t: "Emoji", id, name, isAnimated: isGifUrl(firstChild?.src) })));
    } else if (type === "sticker" && !props.target.className?.includes("lottieCanvas")) {
        children.push(buildItem("Sticker", () => fetchSticker(id)));
    }
};

export default definePlugin({
    name: "ExpressionDownloader",
    description: "Ajoute « Télécharger (PC) » au clic droit sur un emoji ou un sticker. (Pour copier vers un serveur, utilise ExpressionCloner.)",
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    tags: ["Emotes", "Stickers", "Download"],
    enabledByDefault: true,
    contextMenus: {
        "message": messageContextPatch,
        "expression-picker": pickerContextPatch,
    },
});
