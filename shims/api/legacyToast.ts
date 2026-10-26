/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Compat layer for user plugins. Discord keeps changing its toast API and Equicord now only exposes
//   showToast({ text, variant: "default" | "success" | "critical" })
// while our plugins were written for the older shapes:
//   Toasts.show({ message, type: Toasts.Type.SUCCESS, id: Toasts.genId() })
//   showToast("text", "success" | "failure" | "message")
// Import { showToast, Toasts } from "@api/legacyToast" instead of "@webpack/common" and both keep working.

import { showToast as discordShowToast } from "@webpack/common";

type Variant = "default" | "success" | "critical";

const VARIANTS: Record<string, Variant> = {
    message: "default",
    default: "default",
    success: "success",
    failure: "critical",
    critical: "critical",
    // numeric Toasts.Type values of older builds: MESSAGE, SUCCESS, FAILURE
    0: "default",
    1: "success",
    2: "critical"
};

const variantOf = (type: unknown): Variant => VARIANTS[String(type ?? "message").toLowerCase()] ?? "default";

interface LegacyToast {
    text?: string;
    message?: string;
    type?: unknown;
    variant?: unknown;
    [key: string]: unknown;
}

export function showToast(arg: string | LegacyToast, type?: unknown, _options?: unknown): void {
    const data = typeof arg === "string"
        ? { text: arg, variant: variantOf(type) }
        : { ...arg, text: arg.text ?? arg.message ?? "", variant: variantOf(arg.variant ?? arg.type) };

    // A toast must never be able to break the plugin that asked for it.
    try {
        discordShowToast(data as any);
    } catch (e) {
        console.warn("[legacyToast] could not show toast", data, e);
    }
}

export const Toasts = {
    Type: {
        MESSAGE: "message",
        SUCCESS: "success",
        FAILURE: "failure",
        CUSTOM: "message",
        CLIP: "message",
        LINK: "message",
        FORWARD: "message",
        BOOKMARK: "message",
        CLOCK: "message"
    },
    Position: { TOP: 0, BOTTOM: 1 },
    genId: () => Math.random().toString(36).slice(2),
    show: (toast: LegacyToast) => showToast(toast),
    pop: () => { }
};
