/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { closeModal, GuildStore, Menu, Modal, openModal, RestAPI, SearchableSelect, useEffect, useState, UserStore } from "@webpack/common";
import { showToast } from "@api/legacyToast";

const cl = classNameFactory("vc-copytag-");

interface TagProfile {
    id: string;
    name: string;
    tag: string | null;
    /** Badge number: 0-20 base badges, 21+ belong to a badge pack */
    badge: number | null;
    badge_color_primary: string | null;
    badge_color_secondary: string | null;
    badge_hash: string | null;
}

// Badge numbers per pack, straight from Discord's client.
const PACKS = [
    { feature: "GUILD_TAGS_BADGE_PACK_PETS", name: "Pets", from: 21, to: 25 },
    { feature: "GUILD_TAGS_BADGE_PACK_FLEX", name: "Flex", from: 26, to: 30 },
    { feature: "GUILD_TAGS_BADGE_PACK_PLANT", name: "Plant", from: 31, to: 35 },
    { feature: "GUILD_TAGS_BADGE_PACK_CREEPY_CRAWLIES", name: "Creepy Crawlies", from: 36, to: 40 }
];

const packOf = (badge: number | null) => badge == null ? undefined : PACKS.find(p => badge >= p.from && badge <= p.to);

function badgeUrl(guildId: string, hash: string | null) {
    if (!hash) return null;
    const host = (window as any).GLOBAL_ENV?.CDN_HOST ?? "cdn.discordapp.com";
    return `https://${host}/clan-badges/${guildId}/${hash}.png?size=64`;
}

function ownedGuilds(exceptId: string) {
    const me = UserStore.getCurrentUser().id;
    return Object.values(GuildStore.getGuilds())
        .filter(g => g.ownerId === me && g.id !== exceptId)
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything that would make Discord refuse this tag on that guild, in plain words. */
function problemsFor(guild: any, tag: TagProfile): string[] {
    const features: Set<string> = guild.features;
    const out: string[] = [];
    if (!features.has("GUILD_TAGS")) {
        out.push(`« ${guild.name} » n'a pas les tags de serveur (fonctionnalité GUILD_TAGS, débloquée par les boosts du serveur).`);
        return out;
    }
    const pack = packOf(tag.badge);
    if (pack && !features.has(pack.feature)) {
        out.push(`Il te manque le pack de badges « ${pack.name} » sur « ${guild.name} » : ce badge (n°${tag.badge}) en fait partie.`);
    }
    return out;
}

function CopyTagInner({ sourceId, rootProps, close }: { sourceId: string; rootProps: RenderModalProps; close: () => void; }) {
    const [profile, setProfile] = useState<TagProfile | null>(null);
    const [loadError, setLoadError] = useState("");
    const [targetId, setTargetId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        RestAPI.get({ url: `/guilds/${sourceId}/profile` })
            .then(res => {
                if (!alive) return;
                if (!res.body?.tag) setLoadError("Ce serveur n'a pas de tag.");
                else setProfile(res.body);
            })
            .catch(() => alive && setLoadError("Impossible de lire le tag de ce serveur."));
        return () => { alive = false; };
    }, [sourceId]);

    const owned = ownedGuilds(sourceId);
    const target = owned.find(g => g.id === targetId);
    const problems = profile && target ? problemsFor(target, profile) : [];

    async function submit() {
        if (!profile || !target || problems.length) return;
        setBusy(true);
        setError("");
        try {
            await RestAPI.patch({
                url: `/guilds/${target.id}/profile`,
                body: {
                    tag: profile.tag,
                    badge: profile.badge,
                    badge_color_primary: profile.badge_color_primary,
                    badge_color_secondary: profile.badge_color_secondary
                }
            });
            showToast(`Tag « ${profile.tag} » copié sur ${target.name}.`, "success");
            close();
        } catch (e: any) {
            setError(e?.body?.message ?? e?.message ?? "Discord a refusé la modification.");
            setBusy(false);
        }
    }

    const img = profile ? badgeUrl(profile.id, profile.badge_hash) : null;

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Copier le tag de serveur"
            actions={[
                { text: busy ? "Copie..." : "Copier le tag", variant: "primary", onClick: submit },
                { text: "Annuler", variant: "secondary", onClick: close }
            ]}
        >
            {loadError && <div className={cl("problem")}>{loadError}</div>}
            {!loadError && !profile && <div className={cl("hint")}>Chargement du tag...</div>}

            {profile && (
                <>
                    <div className={cl("preview")}>
                        {img && <img src={img} alt="" className={cl("badge")} />}
                        <span className={cl("text")}>{profile.tag}</span>
                    </div>
                    <div className={cl("details")}>
                        <div>Serveur : {profile.name}</div>
                        <div>
                            Badge n°{profile.badge ?? "?"}{packOf(profile.badge) ? ` (pack ${packOf(profile.badge)!.name})` : " (badge de base)"}
                        </div>
                        <div className={cl("colors")}>
                            Couleurs :
                            <span className={cl("swatch")} style={{ background: profile.badge_color_primary ?? "transparent" }} />
                            {profile.badge_color_primary ?? "aucune"}
                            {profile.badge_color_secondary && (
                                <>
                                    <span className={cl("swatch")} style={{ background: profile.badge_color_secondary }} />
                                    {profile.badge_color_secondary}
                                </>
                            )}
                        </div>
                    </div>

                    <Heading tag="h5" className={cl("label")}>Copier sur (un de tes serveurs)</Heading>
                    {owned.length === 0
                        ? <div className={cl("problem")}>Tu n'es propriétaire d'aucun autre serveur.</div>
                        : (
                            <SearchableSelect
                                options={owned.map(g => ({ label: g.name, value: g.id }))}
                                value={targetId ?? undefined}
                                placeholder="Choisir un serveur"
                                maxVisibleItems={8}
                                closeOnSelect
                                onChange={(v: string) => { setTargetId(v); setError(""); }}
                            />
                        )}

                    {target && problems.length === 0 && <div className={cl("ok")}>Ce serveur peut utiliser ce tag, tout est bon.</div>}
                    {problems.map(p => <div key={p} className={cl("problem")}>{p}</div>)}
                </>
            )}

            {error && <div className={cl("problem")}>{error}</div>}
        </Modal>
    );
}

const CopyTagModal = ErrorBoundary.wrap(CopyTagInner, { noop: true });

function openCopyTag(sourceId: string) {
    const key = openModal(props => <CopyTagModal sourceId={sourceId} rootProps={props} close={() => closeModal(key)} />);
}

const userContext: NavContextMenuPatchCallback = (children, { user }: { user?: any; }) => {
    const pg = user?.primaryGuild;
    if (!pg?.tag || !pg.identityGuildId || pg.identityEnabled === false) return;

    children.push(
        <Menu.MenuItem
            id="vc-copytag-user"
            label={`Copier le tag « ${pg.tag} »`}
            action={() => openCopyTag(pg.identityGuildId)}
        />
    );
};

const guildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: any; }) => {
    if (!guild) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup key="vc-copytag-guild-group">
            <Menu.MenuItem
                id="vc-copytag-guild"
                label="Copier le tag de ce serveur"
                action={() => openCopyTag(guild.id)}
            />
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "CopyTag",
    description: "Copie le tag de serveur d'un autre serveur (texte, badge, couleurs) sur un de tes serveurs. Te dit s'il te manque le pack de badges. Clic droit sur un membre ou sur un serveur.",
    tags: ["Servers", "Utility"],
    authors: [{ name: "naxiwow", id: 875342291001278504n }],

    contextMenus: {
        "user-context": userContext,
        "guild-context": guildContext
    }
});
