/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { ChannelStore } from "@webpack/common";
import { showToast } from "@api/legacyToast";

import { settings } from "./settings";

export type JobStatus = "active" | "done" | "failed";

export interface PlannedJob {
    id: string;
    /** "@me" for DMs / group DMs */
    guildId: string;
    channelId: string;
    /** Snapshot of the names, so the list still reads fine when the guild isn't loaded */
    label: string;
    content: string;
    /** Epoch ms of the next occurrence */
    nextAt: number;
    /** 0 when total === 1 */
    intervalMs: number;
    total: number;
    sent: number;
    missed: number;
    status: JobStatus;
    lastError?: string;
    createdAt: number;
}

const KEY = "MessagePlanner_jobs";
const logger = new Logger("MessagePlanner");

export const MIN_INTERVAL_MS = 10_000;
export const MAX_COUNT = 200;

let jobs: PlannedJob[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

export const getJobs = () => jobs;

export function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

const emit = () => listeners.forEach(fn => fn());

async function persist() {
    try {
        await DataStore.set(KEY, jobs);
    } catch (e) {
        logger.error("Could not save the planned messages", e);
    }
    emit();
}

export async function loadJobs() {
    try {
        const saved = await DataStore.get<PlannedJob[]>(KEY);
        jobs = Array.isArray(saved) ? saved : [];
    } catch (e) {
        logger.error("Could not load the planned messages", e);
        jobs = [];
    }
    emit();
}

export async function addJob(data: Pick<PlannedJob, "guildId" | "channelId" | "label" | "content" | "nextAt" | "total" | "intervalMs">) {
    jobs.push({
        ...data,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        sent: 0,
        missed: 0,
        status: "active",
        createdAt: Date.now()
    });
    await persist();
    void tick();
}

export async function removeJob(id: string) {
    jobs = jobs.filter(j => j.id !== id);
    await persist();
}

export async function clearFinished() {
    jobs = jobs.filter(j => j.status === "active");
    await persist();
}

function advance(job: PlannedJob) {
    job.nextAt += job.intervalMs;
    if (job.sent + job.missed >= job.total) job.status = "done";
}

function notify(message: string, type: "success" | "failure" | "message" = "message") {
    if (settings.store.showNotifications) showToast(message, type);
}

async function runDue(job: PlannedJob) {
    const tolerance = Math.max(0, Number(settings.store.lateToleranceMinutes) || 0) * 60_000;
    let changed = false;
    let skipped = 0;

    // Occurrences that are too late (Discord was closed, tab throttled for ages...) are skipped, not sent.
    while (job.status === "active" && job.nextAt <= Date.now() && Date.now() - job.nextAt > tolerance) {
        job.missed++;
        skipped++;
        advance(job);
        changed = true;
    }
    if (skipped) notify(`${skipped} message(s) planifié(s) manqué(s) : ${job.label}`, "failure");

    if (job.status === "active" && job.nextAt <= Date.now()) {
        changed = true;
        if (!ChannelStore.getChannel(job.channelId)) {
            job.status = "failed";
            job.lastError = "Salon introuvable (supprimé ou plus accessible).";
            notify(`Message planifié impossible : ${job.label} — ${job.lastError}`, "failure");
        } else {
            try {
                const res: any = await sendMessage(job.channelId, { content: job.content });
                if (res && res.ok === false) throw new Error(res.body?.message ?? "Envoi refusé par Discord.");
                job.sent++;
                advance(job);
                notify(`Message planifié envoyé (${job.sent}/${job.total}) : ${job.label}`, "success");
            } catch (e: any) {
                job.status = "failed";
                job.lastError = String(e?.message ?? e);
                logger.error("Send failed", e);
                notify(`Message planifié en échec : ${job.label} — ${job.lastError}`, "failure");
            }
        }
    }

    if (changed) await persist();
}

async function tick() {
    const now = Date.now();
    for (const job of jobs.slice()) {
        if (job.status !== "active" || job.nextAt > now || inFlight.has(job.id)) continue;
        inFlight.add(job.id);
        try {
            await runDue(job);
        } finally {
            inFlight.delete(job.id);
        }
    }
}

export function startScheduler() {
    stopScheduler();
    timer = setInterval(() => void tick(), 1000);
    void tick();
}

export function stopScheduler() {
    if (timer != null) clearInterval(timer);
    timer = null;
}
