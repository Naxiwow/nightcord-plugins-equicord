/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    lateToleranceMinutes: {
        type: OptionType.NUMBER,
        description: "Retard maximum accepté (minutes). Un envoi plus en retard que ça (Discord fermé, PC éteint...) est sauté au lieu d'être envoyé n'importe quand.",
        default: 5
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher une notification à chaque envoi / échec.",
        default: true
    }
});
