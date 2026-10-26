/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, closeModal, GuildChannelStore, GuildStore, Modal, openModal, PermissionsBits, PermissionStore, SearchableSelect, SelectedChannelStore, TextArea, TextInput, useEffect, useState, UserStore } from "@webpack/common";
import { showToast } from "@api/legacyToast";

import { addJob, clearFinished, getJobs, MAX_COUNT, MIN_INTERVAL_MS, PlannedJob, removeJob, subscribe } from "./store";

const cl = classNameFactory("vc-planner-");
const ME = "@me";

const UNITS = [
    { id: "s", label: "secondes", ms: 1000 },
    { id: "m", label: "minutes", ms: 60_000 },
    { id: "h", label: "heures", ms: 3_600_000 }
] as const;

const fmt = (ms: number) => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function toLocalInput(ms: number) {
    return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function dmLabel(c: any): string {
    if (c.name) return c.name;
    return (c.recipients ?? [])
        .map((id: string) => {
            const u: any = UserStore.getUser(id);
            return u?.globalName ?? u?.username ?? id;
        })
        .join(", ") || c.id;
}

function guildOptions() {
    return [
        { label: "Messages privés", value: ME },
        ...Object.values(GuildStore.getGuilds())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(g => ({ label: g.name, value: g.id }))
    ];
}

function channelOptions(guildId: string) {
    if (guildId === ME) {
        return ChannelStore.getSortedPrivateChannels().map((c: any) => ({ label: dmLabel(c), value: c.id }));
    }
    const selectable: any[] = (GuildChannelStore.getChannels(guildId) as any)?.SELECTABLE ?? [];
    return selectable
        .map(item => item.channel)
        .filter(c => c && (c.type === 0 || c.type === 5) && PermissionStore.can(PermissionsBits.SEND_MESSAGES, c))
        .map(c => ({ label: `# ${c.name}`, value: c.id }));
}

function ClockIcon({ width = 20, height = 20, color = "currentColor" }: { width?: number | string; height?: number | string; color?: string; className?: string; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export { ClockIcon };

/* -------------------------------------------------------------------------- */
/*                                    Form                                    */
/* -------------------------------------------------------------------------- */

function PlannerFormInner({ rootProps, close }: { rootProps: RenderModalProps; close: () => void; }) {
    const current = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
    const [guildId, setGuildId] = useState<string>(current ? (current.guild_id ?? ME) : ME);
    const [channelId, setChannelId] = useState<string | null>(current?.id ?? null);
    const [content, setContent] = useState("");
    const [when, setWhen] = useState(toLocalInput(Date.now() + 5 * 60_000));
    const [count, setCount] = useState("1");
    const [every, setEvery] = useState("60");
    const [unit, setUnit] = useState<typeof UNITS[number]["id"]>("m");
    const [error, setError] = useState("");

    const total = Math.floor(Number(count));
    const unitMs = UNITS.find(u => u.id === unit)!.ms;
    const intervalMs = Math.round(Number(every) * unitMs);
    const repeating = total > 1;
    const first = new Date(when).getTime();

    function validate(): string | null {
        if (!channelId) return "Choisis un salon.";
        if (!content.trim()) return "Écris un message.";
        if (content.length > 2000) return "Message trop long (2000 caractères max).";
        if (isNaN(first) || first <= Date.now()) return "Choisis une date et une heure dans le futur.";
        if (!Number.isInteger(total) || total < 1 || total > MAX_COUNT) return `Nombre d'envois invalide (1 à ${MAX_COUNT}).`;
        if (repeating && (!Number.isFinite(intervalMs) || intervalMs < MIN_INTERVAL_MS)) return `Intervalle trop court (minimum ${MIN_INTERVAL_MS / 1000} secondes).`;
        return null;
    }

    async function submit() {
        const problem = validate();
        if (problem) return setError(problem);

        const channel: any = ChannelStore.getChannel(channelId!);
        const guildName = guildId === ME ? "Messages privés" : GuildStore.getGuild(guildId)?.name ?? "Serveur";
        const channelName = guildId === ME ? dmLabel(channel ?? {}) : `#${channel?.name ?? channelId}`;

        await addJob({
            guildId,
            channelId: channelId!,
            label: `${guildName} › ${channelName}`,
            content,
            nextAt: first,
            total,
            intervalMs: repeating ? intervalMs : 0
        });
        showToast(repeating ? `${total} envois programmés.` : "Message programmé.", "success");
        close();
    }

    const summary = !isNaN(first) && Number.isInteger(total) && total >= 1
        ? repeating && Number.isFinite(intervalMs)
            ? `Premier envoi : ${fmt(first)} · ${total} envois · dernier : ${fmt(first + (total - 1) * intervalMs)}`
            : `Envoi : ${fmt(first)}`
        : "";

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Programmer un message"
            actions={[
                { text: "Programmer", variant: "primary", onClick: submit },
                { text: "Voir la liste", variant: "secondary", onClick: () => { close(); openPlannerList(); } },
                { text: "Annuler", variant: "secondary", onClick: close }
            ]}
        >
            <Heading tag="h5" className={cl("label")}>Serveur</Heading>
            <SearchableSelect
                options={guildOptions()}
                value={guildId}
                placeholder="Choisir un serveur"
                maxVisibleItems={8}
                closeOnSelect
                onChange={(v: string) => { setGuildId(v); setChannelId(null); }}
            />

            <Heading tag="h5" className={cl("label")}>Salon</Heading>
            <SearchableSelect
                options={channelOptions(guildId)}
                value={channelId ?? undefined}
                placeholder="Choisir un salon"
                maxVisibleItems={8}
                closeOnSelect
                onChange={(v: string) => setChannelId(v)}
            />

            <Heading tag="h5" className={cl("label")}>Message</Heading>
            <TextArea value={content} onChange={setContent} rows={4} placeholder="Ton message..." />

            <Heading tag="h5" className={cl("label")}>Date et heure du (premier) envoi</Heading>
            <input
                type="datetime-local"
                className={cl("datetime")}
                value={when}
                min={toLocalInput(Date.now())}
                onChange={e => setWhen(e.target.value)}
            />

            <Heading tag="h5" className={cl("label")}>Nombre d'envois</Heading>
            <TextInput type="number" value={count} onChange={setCount} placeholder="1" />

            {repeating && (
                <>
                    <Heading tag="h5" className={cl("label")}>Un envoi toutes les...</Heading>
                    <div className={cl("row")}>
                        <TextInput type="number" value={every} onChange={setEvery} />
                        {UNITS.map(u => (
                            <Button key={u.id} size="small" variant={unit === u.id ? "primary" : "secondary"} onClick={() => setUnit(u.id)}>
                                {u.label}
                            </Button>
                        ))}
                    </div>
                </>
            )}

            {summary && <div className={cl("summary")}>{summary}</div>}
            {error && <div className={cl("error")}>{error}</div>}
            <div className={cl("hint")}>L'onglet Discord doit rester ouvert à l'heure prévue.</div>
        </Modal>
    );
}

const PlannerForm = ErrorBoundary.wrap(PlannerFormInner, { noop: true });

export function openPlannerForm() {
    const key = openModal(props => <PlannerForm rootProps={props} close={() => closeModal(key)} />);
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

function statusText(job: PlannedJob) {
    switch (job.status) {
        case "active": return `Prochain : ${fmt(job.nextAt)} · envoyés ${job.sent}/${job.total}${job.missed ? ` · ${job.missed} manqué(s)` : ""}`;
        case "done": return `Terminé · ${job.sent} envoyé(s)${job.missed ? `, ${job.missed} manqué(s)` : ""}`;
        case "failed": return `Échec : ${job.lastError ?? "erreur inconnue"} (${job.sent}/${job.total} envoyés)`;
    }
}

function PlannerListInner({ rootProps, close }: { rootProps: RenderModalProps; close: () => void; }) {
    const [, force] = useState(0);
    useEffect(() => subscribe(() => force(n => n + 1)), []);

    const list = getJobs().slice().sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.nextAt - b.nextAt);

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Messages programmés"
            actions={[
                { text: "Nouveau", variant: "primary", onClick: () => { close(); openPlannerForm(); } },
                { text: "Vider les terminés", variant: "secondary", onClick: () => void clearFinished() },
                { text: "Fermer", variant: "secondary", onClick: close }
            ]}
        >
            {list.length === 0 && <div className={cl("hint")}>Aucun message programmé.</div>}
            {list.map(job => (
                <div key={job.id} className={cl("job", job.status)}>
                    <div className={cl("job-main")}>
                        <div className={cl("job-target")}>{job.label}</div>
                        <div className={cl("job-text")}>{job.content.length > 120 ? job.content.slice(0, 120) + "…" : job.content}</div>
                        <div className={cl("job-status")}>{statusText(job)}</div>
                    </div>
                    <Button size="small" variant="dangerSecondary" onClick={() => void removeJob(job.id)}>
                        {job.status === "active" ? "Annuler" : "Supprimer"}
                    </Button>
                </div>
            ))}
        </Modal>
    );
}

const PlannerList = ErrorBoundary.wrap(PlannerListInner, { noop: true });

export function openPlannerList() {
    const key = openModal(props => <PlannerList rootProps={props} close={() => closeModal(key)} />);
}
