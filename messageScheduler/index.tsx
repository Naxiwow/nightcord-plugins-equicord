/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import {
    ChannelStore, Forms, GuildChannelStore, GuildStore, Menu, PermissionsBits, PermissionStore,
    React, RestAPI, SelectedChannelStore, showToast, SnowflakeUtils, useEffect, useMemo, UserStore, useState
} from "@webpack/common";

/*
 * Browser-friendly: no native code, everything runs in the Discord tab.
 * Schedules live in IndexedDB (DataStore) and are fired by an in-page timer,
 * so the Discord tab has to be open when a message is due.
 */

const STORE_KEY = "MessageScheduler_schedules_v1";
const LOCK_NAME = "MessageScheduler_tick";
const DM_GUILD = "@me";
const MIN_REPEAT_INTERVAL_MS = 5_000;
const MAX_REPEATS = 500;

const settings = definePluginSettings({
    lateToleranceMinutes: {
        type: OptionType.SLIDER,
        description: "If Discord was closed at the scheduled time, still send the message if it is at most this late (minutes). Older occurrences are skipped.",
        markers: [1, 5, 15, 30, 60, 120],
        default: 5,
        minValue: 1,
        maxValue: 120,
        stickToMarkers: false
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when a scheduled message is sent or fails",
        default: true
    }
});

// ─── Data ────────────────────────────────────────────────────────────────────

type ScheduleStatus = "pending" | "done" | "failed";

interface Schedule {
    id: string;
    userId: string;
    channelId: string;
    /** Snapshot of the "Server › #channel" label, used when the channel is not in cache */
    label: string;
    content: string;
    createdAt: number;
    nextRunAt: number;
    intervalMs: number;
    total: number;
    sent: number;
    missed: number;
    errors: number;
    status: ScheduleStatus;
    lastError?: string;
}

let schedules: Schedule[] = [];
let queue: Promise<unknown> = Promise.resolve();
let ticking = false;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let bc: BroadcastChannel | undefined;
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) {
        try { fn(); } catch { }
    }
}

function useSchedules(): Schedule[] {
    const [, setN] = useState(0);
    useEffect(() => {
        const fn = () => setN(n => n + 1);
        listeners.add(fn);
        // re-render every second so countdowns stay fresh
        const iv = setInterval(fn, 1000);
        return () => { listeners.delete(fn); clearInterval(iv); };
    }, []);
    return schedules;
}

async function reload() {
    const data = await DataStore.get<Schedule[]>(STORE_KEY);
    schedules = Array.isArray(data) ? data : [];
    notify();
}

async function persist() {
    await DataStore.set(STORE_KEY, schedules);
    notify();
    try { bc?.postMessage("changed"); } catch { }
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
    // Web Locks makes sure two Discord tabs never fire the same message
    const { locks } = (navigator as any);
    return locks?.request ? locks.request(LOCK_NAME, fn) : fn();
}

/** Reloads from storage, applies `fn`, saves — serialized in this tab and across tabs. */
function mutate<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = queue.then(() => withLock(async () => {
        await reload();
        const result = await fn();
        await persist();
        return result;
    }));
    queue = run.catch(() => { });
    return run;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

type SendResult =
    | { ok: true; }
    | { ok: false; message: string; fatal: boolean; retryAfterMs?: number; };

async function sendNow(s: Schedule): Promise<SendResult> {
    try {
        await RestAPI.post({
            url: `/channels/${s.channelId}/messages`,
            body: {
                content: s.content,
                flags: 0,
                tts: false,
                nonce: SnowflakeUtils.fromTimestamp(Date.now())
            }
        });
        return { ok: true };
    } catch (e: any) {
        const status: number | undefined = e?.status ?? e?.statusCode;
        const message: string = e?.body?.message ?? e?.message ?? `HTTP ${status ?? "?"}`;
        if (status === 429) {
            const retryAfter = Number(e?.body?.retry_after ?? 5);
            return { ok: false, message: "Rate limited", fatal: false, retryAfterMs: Math.ceil(retryAfter * 1000) + 250 };
        }
        // missing access / unknown channel / invalid content: retrying the same thing will not help
        const fatal = status === 400 || status === 401 || status === 403 || status === 404;
        return { ok: false, message: `${message}${status ? ` (${status})` : ""}`, fatal };
    }
}

/** An occurrence was resolved (sent, skipped or errored): move on to the next one. */
function settle(s: Schedule) {
    s.nextRunAt += s.intervalMs;
    if (s.sent + s.missed + s.errors >= s.total) s.status = "done";
}

function toast(msg: string, type: "success" | "failure") {
    if (settings.store.showToasts) showToast(msg, type);
}

async function processDue() {
    const me = UserStore.getCurrentUser()?.id;
    if (!me) return;
    const toleranceMs = (settings.store.lateToleranceMinutes ?? 5) * 60_000;

    for (const s of schedules) {
        if (s.userId !== me || s.status !== "pending") continue;

        // at most one real send per schedule per pass: if we are catching up on
        // several overdue occurrences, the extra ones are skipped instead of burst-sent
        let attempted = false;
        while (s.status === "pending" && s.nextRunAt <= Date.now()) {
            if (attempted || Date.now() - s.nextRunAt > toleranceMs) {
                s.missed++;
                settle(s);
                continue;
            }

            attempted = true;
            const res = await sendNow(s);
            if (res.ok) {
                s.sent++;
                s.lastError = undefined;
                toast(`Scheduled message sent → ${s.label}`, "success");
                settle(s);
            } else if (res.retryAfterMs) {
                s.nextRunAt = Date.now() + res.retryAfterMs;
                break;
            } else {
                s.errors++;
                s.lastError = res.message;
                toast(`Scheduled message failed (${s.label}): ${res.message}`, "failure");
                if (res.fatal) s.status = "failed";
                else settle(s);
            }
        }
    }
}

async function tick() {
    if (ticking) return;
    const me = UserStore.getCurrentUser()?.id;
    if (!me) return;
    const now = Date.now();
    if (!schedules.some(s => s.userId === me && s.status === "pending" && s.nextRunAt <= now)) return;

    ticking = true;
    try {
        await mutate(processDue);
    } catch (e) {
        console.error("[MessageScheduler] tick failed:", e);
    } finally {
        ticking = false;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UNITS = [
    { key: "s", label: "seconds", ms: 1000 },
    { key: "m", label: "minutes", ms: 60_000 },
    { key: "h", label: "hours", ms: 3_600_000 },
    { key: "d", label: "days", ms: 86_400_000 }
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInput(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${pad(s)}s`;
    return `${s}s`;
}

function dmName(ch: any): string {
    if (ch.name) return ch.name;
    const names = (ch.recipients ?? []).map((id: string) => {
        const u: any = UserStore.getUser(id);
        return u?.globalName ?? u?.username ?? id;
    });
    return ch.type === 1 ? `@${names[0] ?? "DM"}` : names.join(", ") || "Group DM";
}

function channelLabel(channelId: string, fallback?: string): string {
    const ch: any = ChannelStore.getChannel(channelId);
    if (!ch) return fallback ?? `Channel ${channelId}`;
    if (ch.guild_id) {
        const g: any = GuildStore.getGuild(ch.guild_id);
        return `${g?.name ?? "Server"} › #${ch.name}`;
    }
    return dmName(ch);
}

interface ChannelOption { id: string; label: string; }

function getGuildOptions(): Array<{ id: string; name: string; }> {
    const guilds = Object.values(GuildStore.getGuilds()) as any[];
    return guilds
        .map(g => ({ id: g.id as string, name: g.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function getChannelOptions(guildId: string, extraChannelId?: string): ChannelOption[] {
    let options: ChannelOption[];

    if (guildId === DM_GUILD) {
        const raw: any = ChannelStore.getSortedPrivateChannels?.() ?? [];
        options = (Array.isArray(raw) ? raw : Object.values(raw))
            .filter((c: any) => c.type === 1 || c.type === 3)
            .map((c: any) => ({ id: c.id, label: dmName(c) }));
    } else {
        options = GuildChannelStore.getSelectableChannels(guildId)
            .map(({ channel }: any) => channel)
            // text (0) and announcement (5) channels where we can actually talk
            .filter((c: any) => (c.type === 0 || c.type === 5) && PermissionStore.can(PermissionsBits.SEND_MESSAGES, c))
            .map((c: any) => ({ id: c.id, label: `#${c.name}` }));
    }

    // the channel the user is currently looking at may be a thread / not listed
    if (extraChannelId && !options.some(o => o.id === extraChannelId)) {
        const ch: any = ChannelStore.getChannel(extraChannelId);
        const belongs = ch && (ch.guild_id ?? DM_GUILD) === guildId;
        if (belongs) options.unshift({ id: ch.id, label: ch.guild_id ? `#${ch.name}` : dmName(ch) });
    }
    return options;
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function ClockIcon({ width = 20, height = 20 }: { width?: number; height?: number; }) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg"
            width={width} height={height} fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SchedulerModal({ rootProps, initialChannelId }: { rootProps: any; initialChannelId?: string; }) {
    const all = useSchedules();
    const me = UserStore.getCurrentUser();
    const mine = useMemo(
        () => all.filter(s => s.userId === me?.id).sort((a, b) => a.nextRunAt - b.nextRunAt),
        [all, me?.id]
    );
    const pendingCount = mine.filter(s => s.status === "pending").length;

    const startChannelId = initialChannelId ?? SelectedChannelStore.getChannelId() ?? undefined;
    const startChannel: any = startChannelId ? ChannelStore.getChannel(startChannelId) : undefined;
    const startGuild: string = startChannel ? (startChannel.guild_id ?? DM_GUILD) : DM_GUILD;

    const [tab, setTab] = useState<"new" | "list">("new");
    const [guildId, setGuildId] = useState(startGuild);
    const [channelId, setChannelId] = useState<string>(startChannel?.id ?? "");
    const [content, setContent] = useState("");
    const [when, setWhen] = useState(() => toLocalInput(Math.ceil((Date.now() + 5 * 60_000) / 60_000) * 60_000));
    const [count, setCount] = useState(1);
    const [intervalValue, setIntervalValue] = useState(1);
    const [intervalUnit, setIntervalUnit] = useState<typeof UNITS[number]["key"]>("h");
    const [saving, setSaving] = useState(false);

    const guilds = useMemo(getGuildOptions, []);
    const channels = useMemo(
        () => getChannelOptions(guildId, startChannel?.id),
        [guildId, startChannel?.id]
    );

    // keep the selected channel valid when the server changes
    useEffect(() => {
        if (!channels.some(c => c.id === channelId)) setChannelId(channels[0]?.id ?? "");
    }, [channels]);

    const maxLength = (me as any)?.premiumType === 2 ? 4000 : 2000;
    const unitMs = UNITS.find(u => u.key === intervalUnit)!.ms;
    const intervalMs = count > 1 ? Math.round(intervalValue * unitMs) : 0;
    const firstRunAt = new Date(when).getTime();

    let error: string | null = null;
    if (!channelId) error = "Pick a channel";
    else if (!content.trim()) error = "Write a message";
    else if (content.length > maxLength) error = `Message is too long (max ${maxLength})`;
    else if (!Number.isFinite(firstRunAt)) error = "Pick a date and time";
    else if (firstRunAt < Date.now() - 30_000) error = "That time is in the past";
    else if (!Number.isInteger(count) || count < 1 || count > MAX_REPEATS) error = `Number of times must be between 1 and ${MAX_REPEATS}`;
    else if (count > 1 && !(intervalMs >= MIN_REPEAT_INTERVAL_MS)) error = "Minimum delay between messages is 5 seconds";

    const lastRunAt = firstRunAt + intervalMs * (count - 1);

    async function submit() {
        if (error || !me) return;
        setSaving(true);
        try {
            const s: Schedule = {
                id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                userId: me.id,
                channelId,
                label: channelLabel(channelId),
                content,
                createdAt: Date.now(),
                nextRunAt: firstRunAt,
                intervalMs,
                total: count,
                sent: 0,
                missed: 0,
                errors: 0,
                status: "pending"
            };
            await mutate(() => { schedules = [...schedules, s]; });
            showToast(`Message scheduled for ${formatDate(firstRunAt)}`, "success");
            setContent("");
            setTab("list");
        } catch (e) {
            console.error("[MessageScheduler] save failed:", e);
            showToast("Could not save the scheduled message", "failure");
        } finally {
            setSaving(false);
        }
    }

    const remove = (id: string) => mutate(() => { schedules = schedules.filter(s => s.id !== id); });
    const clearFinished = () => mutate(() => {
        schedules = schedules.filter(s => s.userId !== me?.id || s.status === "pending");
    });

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
                    <ClockIcon width={16} height={16} /> Scheduled messages
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="msch-content">
                <div className="msch-tabs">
                    <button className={`msch-tab ${tab === "new" ? "msch-tab--active" : ""}`} onClick={() => setTab("new")}>New</button>
                    <button className={`msch-tab ${tab === "list" ? "msch-tab--active" : ""}`} onClick={() => setTab("list")}>
                        Scheduled{pendingCount > 0 ? ` (${pendingCount})` : ""}
                    </button>
                </div>

                {tab === "new" && (
                    <>
                        <div className="msch-row">
                            <div className="msch-field">
                                <Forms.FormTitle tag="h5" className="msch-label">SERVER</Forms.FormTitle>
                                <select className="msch-input" value={guildId} onChange={e => setGuildId(e.currentTarget.value)}>
                                    <option value={DM_GUILD}>Direct Messages</option>
                                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <div className="msch-field">
                                <Forms.FormTitle tag="h5" className="msch-label">CHANNEL</Forms.FormTitle>
                                <select className="msch-input" value={channelId} onChange={e => setChannelId(e.currentTarget.value)}
                                    disabled={channels.length === 0}>
                                    {channels.length === 0 && <option value="">No channel available</option>}
                                    {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="msch-field">
                            <Forms.FormTitle tag="h5" className="msch-label">MESSAGE</Forms.FormTitle>
                            <textarea className="msch-input msch-textarea" rows={4} value={content}
                                placeholder="What should be sent?"
                                onChange={e => setContent(e.currentTarget.value)} />
                            <div className="msch-hint msch-hint--right">{content.length}/{maxLength}</div>
                        </div>

                        <div className="msch-row">
                            <div className="msch-field">
                                <Forms.FormTitle tag="h5" className="msch-label">SEND AT</Forms.FormTitle>
                                <input className="msch-input" type="datetime-local" value={when}
                                    onChange={e => setWhen(e.currentTarget.value)} />
                            </div>
                            <div className="msch-field msch-field--small">
                                <Forms.FormTitle tag="h5" className="msch-label">TIMES</Forms.FormTitle>
                                <input className="msch-input" type="number" min={1} max={MAX_REPEATS} value={count}
                                    onChange={e => setCount(Math.floor(Number(e.currentTarget.value)) || 1)} />
                            </div>
                        </div>

                        {count > 1 && (
                            <div className="msch-field">
                                <Forms.FormTitle tag="h5" className="msch-label">REPEAT EVERY</Forms.FormTitle>
                                <div className="msch-row">
                                    <input className="msch-input" type="number" min={1} value={intervalValue}
                                        onChange={e => setIntervalValue(Math.max(0, Number(e.currentTarget.value)))} />
                                    <select className="msch-input" value={intervalUnit}
                                        onChange={e => setIntervalUnit(e.currentTarget.value as any)}>
                                        {UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {!error && (
                            <div className="msch-summary">
                                {count === 1
                                    ? <>Sends once on <b>{formatDate(firstRunAt)}</b></>
                                    : <>Sends <b>{count}×</b>: first on <b>{formatDate(firstRunAt)}</b>, last on <b>{formatDate(lastRunAt)}</b></>}
                            </div>
                        )}
                        {error && <div className="msch-error">{error}</div>}

                        <div className="msch-hint">
                            Messages are sent from this Discord tab: keep it open (background is fine) at the scheduled time.
                        </div>

                        <button className="msch-submit" onClick={submit} disabled={!!error || saving}>
                            {saving ? "Saving..." : "Schedule"}
                        </button>
                    </>
                )}

                {tab === "list" && (
                    <>
                        {mine.length === 0 && <div className="msch-empty">Nothing scheduled yet</div>}
                        <div className="msch-list">
                            {mine.map(s => (
                                <div key={s.id} className={`msch-item msch-item--${s.status}`}>
                                    <div className="msch-item-head">
                                        <span className="msch-item-channel">{channelLabel(s.channelId, s.label)}</span>
                                        <span className={`msch-badge msch-badge--${s.status}`}>
                                            {s.status === "pending" ? "Pending" : s.status === "done" ? "Done" : "Failed"}
                                        </span>
                                        <button className="msch-del" title={s.status === "pending" ? "Cancel" : "Remove"}
                                            onClick={() => remove(s.id)}>✕</button>
                                    </div>
                                    <div className="msch-item-content">{s.content}</div>
                                    <div className="msch-item-meta">
                                        <span>
                                            {s.status === "pending"
                                                ? <>Next: {formatDate(s.nextRunAt)} (in {formatDuration(s.nextRunAt - Date.now())})</>
                                                : <>Created {formatDate(s.createdAt)}</>}
                                        </span>
                                        <span>
                                            {s.sent}/{s.total} sent
                                            {s.missed > 0 && ` · ${s.missed} missed`}
                                            {s.errors > 0 && ` · ${s.errors} failed`}
                                        </span>
                                    </div>
                                    {s.lastError && <div className="msch-item-error">{s.lastError}</div>}
                                </div>
                            ))}
                        </div>
                        {mine.some(s => s.status !== "pending") && (
                            <button className="msch-secondary" onClick={clearFinished}>Clear finished</button>
                        )}
                    </>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function openScheduler(channelId?: string) {
    openModal(props => <SchedulerModal rootProps={props} initialChannelId={channelId} />);
}

function SchedulerButton() {
    return (
        <HeaderBarButton
            icon={ClockIcon}
            tooltip="Scheduled messages"
            onClick={() => openScheduler()}
        />
    );
}

const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { channel?: any; } = {}) => {
    const { channel } = ctx;
    if (!channel || channel.type === 2 || channel.type === 4) return;
    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;
    group.push(
        <Menu.MenuItem
            key="msch-schedule"
            id="vc-msch-schedule"
            label="Schedule a message"
            action={() => openScheduler(channel.id)}
        />
    );
};

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "MessageScheduler",
    enabledByDefault: true,
    description: "Schedule messages: pick the time, the server and channel, and how many times to send. Works in the web version (no native code).",
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    dependencies: ["HeaderBarAPI", "ContextMenuAPI"],
    settings,

    contextMenus: {
        "channel-context": ChannelContextMenuPatch,
        "gdm-context": ChannelContextMenuPatch
    },

    async start() {
        addHeaderBarButton("nightcord-message-scheduler", () => <SchedulerButton />, 5);

        await reload();

        try {
            bc = new BroadcastChannel("MessageScheduler");
            bc.onmessage = () => { reload().catch(() => { }); };
        } catch { /* BroadcastChannel unavailable */ }

        tickTimer = setInterval(tick, 1000);
        // background tabs get their timers throttled: catch up as soon as the tab is visible again
        document.addEventListener("visibilitychange", tick);
    },

    stop() {
        removeHeaderBarButton("nightcord-message-scheduler");
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = undefined;
        document.removeEventListener("visibilitychange", tick);
        bc?.close();
        bc = undefined;
        listeners.clear();
    }
});
