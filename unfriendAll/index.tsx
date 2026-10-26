/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Forms, IconUtils, Menu, RelationshipStore, RestAPI, useMemo, UserStore, useState } from "@webpack/common";
import { showToast, Toasts } from "@api/legacyToast";

interface FriendEntry {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
}

const settings = definePluginSettings({
    delay: {
        description: "Delay between each unfriend, in milliseconds (too low = rate limited)",
        type: OptionType.NUMBER,
        default: 1000
    }
});

function getFriends(): FriendEntry[] {
    const ids: string[] = RelationshipStore?.getFriendIDs?.() ?? [];
    return ids.map(id => {
        const user = UserStore.getUser(id);
        return {
            id,
            name: RelationshipStore.getNickname(id) || (user as any)?.globalName || user?.username || id,
            username: user?.username ?? id,
            avatar: user ? IconUtils?.getUserAvatarURL(user, false, 64) ?? null : null
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
            <path d="M21.71 20.29l-5.01-5.01A7.94 7.94 0 0 0 18 10a8 8 0 1 0-8 8 7.94 7.94 0 0 0 5.28-1.3l5.01 5.01a1 1 0 0 0 1.42-1.42ZM4 10a6 6 0 1 1 6 6 6 6 0 0 1-6-6Z" />
        </svg>
    );
}

function UnfriendAllModal({ rootProps }: { rootProps: any; }) {
    const allFriends = useMemo(getFriends, []);
    const [selected, setSelected] = useState<Set<string>>(() => new Set(allFriends.map(f => f.id)));
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
    const [progress, setProgress] = useState("");
    const [currentIdx, setCurrentIdx] = useState(0);
    const [total, setTotal] = useState(0);

    const friends = useMemo(() => allFriends.filter(f => !removed.has(f.id)), [allFriends, removed]);

    const filtered = useMemo(() => {
        if (!search.trim()) return friends;
        const q = search.toLowerCase();
        return friends.filter(f =>
            f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q) || f.id.includes(q)
        );
    }, [friends, search]);

    const toggleFriend = (id: string) => {
        if (status === "running") return;
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(friends.map(f => f.id)));
    const selectNone = () => setSelected(new Set());

    const handleUnfriend = async () => {
        if (selected.size === 0) return;
        setStatus("running");
        const ids: string[] = Array.from(selected);
        const done = new Set<string>();
        let failed = 0;
        setTotal(ids.length);

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const friend = allFriends.find(f => f.id === id);
            setCurrentIdx(i + 1);
            setProgress(`[${i + 1}/${ids.length}] Removing: ${friend?.name ?? id}...`);

            // Déjà retiré entre-temps (par un autre client par ex.)
            if (!RelationshipStore.isFriend(id)) {
                done.add(id);
                continue;
            }

            try {
                await RestAPI.del({ url: `/users/@me/relationships/${id}` });
                done.add(id);
            } catch (e) {
                failed++;
                console.error(`[UnfriendAll] Failed to remove ${friend?.name ?? id}:`, e);
            }
            await new Promise(r => setTimeout(r, Math.max(0, settings.store.delay)));
        }

        setRemoved(prev => new Set([...prev, ...done]));
        setSelected(prev => new Set([...prev].filter(id => !done.has(id))));

        const msg = `${done.size} friend${done.size !== 1 ? "s" : ""} removed`
            + (failed ? `, ${failed} failed (see console)` : "");
        setStatus(done.size === 0 && failed > 0 ? "error" : "done");
        setProgress(msg);
        showToast(msg, failed ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS);
    };

    const pct = total > 0 && status === "running"
        ? Math.round((currentIdx / total) * 100) : 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
                    Unfriend All
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="uaf-content">

                {/* Barre de recherche */}
                <div className="uaf-search-bar">
                    <SearchIcon />
                    <input
                        className="uaf-search-input"
                        type="text"
                        placeholder="Search a friend..."
                        value={search}
                        onChange={e => setSearch(e.currentTarget.value)}
                        autoFocus
                    />
                    {search && (
                        <button className="uaf-search-clear" onClick={() => setSearch("")}>✕</button>
                    )}
                </div>

                {/* Header liste + boutons tout/rien */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Forms.FormTitle tag="h5" className="uaf-label">SELECT FRIENDS</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button className="uaf-mini-btn" onClick={selectAll} disabled={status === "running"}>All</button>
                        <button className="uaf-mini-btn" onClick={selectNone} disabled={status === "running"}>None</button>
                    </div>
                </div>

                {/* Liste amis */}
                <div className="uaf-friend-list">
                    {filtered.length === 0 && (
                        <div className="uaf-empty">
                            {search ? `No results for "${search}"` : "No friends found"}
                        </div>
                    )}
                    {filtered.map(f => {
                        const isSel = selected.has(f.id);
                        return (
                            <div
                                key={f.id}
                                className={`uaf-friend-row ${isSel ? "uaf-friend-row--selected" : ""}`}
                                onClick={() => toggleFriend(f.id)}
                            >
                                {f.avatar
                                    ? <img src={f.avatar} className="uaf-avatar" alt="" />
                                    : <div className="uaf-avatar-placeholder">{f.name.replace(/\s+/g, "").slice(0, 2).toUpperCase()}</div>
                                }
                                <span className="uaf-friend-name">{f.name}</span>
                                {f.name !== f.username && <span className="uaf-friend-username">@{f.username}</span>}
                                {isSel && <span className="uaf-check">✓</span>}
                            </div>
                        );
                    })}
                </div>

                {/* Status */}
                {status !== "idle" && (
                    <div className={`uaf-status uaf-status--${status}`}>{progress}</div>
                )}

                {/* Compteur */}
                <div className="uaf-footer-info">
                    <span>{selected.size} friends selected</span>
                </div>

                {/* Bouton principal */}
                <button
                    className="uaf-remove-btn"
                    onClick={handleUnfriend}
                    disabled={selected.size === 0 || status === "running"}
                >
                    {status === "running"
                        ? `In progress... (${pct}%)`
                        : `Unfriend ${selected.size} friends`}
                </button>

            </ModalContent>
        </ModalRoot>
    );
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; }; }) => {
    if (!children || !Array.isArray(children)) return;
    try {
        if (!user || !RelationshipStore.isFriend(user.id)) return;

        const group = findGroupChildrenByChildId("remove-friend", children) ?? children;
        const item = (
            <Menu.MenuItem
                id="unfriend-all"
                key="unfriend-all"
                label="Unfriend All"
                color="danger"
                action={() => openModal(props => <UnfriendAllModal rootProps={props} />)}
            />
        );

        if (Array.isArray(group)) {
            const idx = group.findIndex((c: any) => c?.props?.id === "remove-friend");
            if (idx >= 0) {
                group.splice(idx + 1, 0, item);
            } else {
                group.push(item);
            }
        }
    } catch (e) {
        console.error("[UnfriendAll] Context menu patch error:", e);
    }
};

export default definePlugin({
    name: "UnfriendAll",
    enabledByDefault: false,
    description: "Removes all selected friends. Accessible via right-click on a friend.",
    authors: [{ name: "Naxiwow", id: 0n }],
    settings,

    start() {
        addContextMenuPatch("user-context", patchUserContext);
    },

    stop() {
        removeContextMenuPatch("user-context", patchUserContext);
    }
});
