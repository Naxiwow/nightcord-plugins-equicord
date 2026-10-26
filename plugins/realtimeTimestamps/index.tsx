/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment, useEffect, useReducer } from "@webpack/common";

// ─── Settings ────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Seconds format displayed on every message timestamp",
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in the hover tooltip",
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in compact mode",
        default: true,
    },
});

// ─── Global tick ─ one shared setInterval for all timestamp components ───────
// This avoids creating one setInterval per rendered message (50+ messages = 50+
// intervals → 50+ React re-renders per second → Discord freeze).

const tickListeners = new Set<() => void>();
let globalTickInterval: ReturnType<typeof setInterval> | null = null;

function startGlobalTick() {
    if (globalTickInterval !== null) return;
    globalTickInterval = setInterval(() => {
        for (const fn of tickListeners) {
            try { fn(); } catch { }
        }
    }, 1000);
}

function stopGlobalTick() {
    if (tickListeners.size > 0) return;
    if (globalTickInterval !== null) {
        clearInterval(globalTickInterval);
        globalTickInterval = null;
    }
}

// ─── React Hook (only valid inside a React component) ────────────────────────
function useSecondTick() {
    const [, tick] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        tickListeners.add(tick);
        startGlobalTick();
        return () => {
            tickListeners.delete(tick);
            stopGlobalTick();
        };
    }, []);
}

// ─── Timestamp render functions ──────────────────────────────────────────────

function renderCozyText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return moment(date).format(fmt);
}

function renderCompactText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInCompact
        ? moment(date).format(fmt)
        : moment(date).format("LT");
}

function renderTooltipText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInTooltip
        ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
        : moment(date).format("LLLL");
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RealtimeTimestamps",
    description: "Replaces Discord timestamps (e.g. 15:31) with live seconds (e.g. 15:34:21), updated every second.",
    tags: ["Appearance", "Chat", "Utility"],
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    enabledByDefault: true,
    settings,

    renderCozy(date: Date) {
        return renderCozyText(date);
    },
    renderCompact(date: Date) {
        return renderCompactText(date);
    },
    renderTooltip(date: Date) {
        return renderTooltipText(date);
    },

    stop() {
        tickListeners.clear();
        if (globalTickInterval !== null) {
            clearInterval(globalTickInterval);
            globalTickInterval = null;
        }
    },

    patches: [
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            replacement: [
                {
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderCompact(arguments[0].timestamp)",
                },
                {
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderCozy(arguments[0].timestamp)",
                },
                {
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTooltip(arguments[0].timestamp)",
                },
            ],
        },
        {
            find: /.full,.{0,15}children:/,
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTooltip(new Date(arguments[0].node.timestamp*1000))",
            },
        },
    ],
});
