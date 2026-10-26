/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    groqKey: {
        type: OptionType.STRING,
        description: "Clé API Groq pour les définitions AI en Safe Mode. Obtenez-la sur console.groq.com",
        default: "",
    },
});
