/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import definePlugin from "@utils/types";

import { settings } from "./settings";
import { loadJobs, startScheduler, stopScheduler } from "./store";
import { ClockIcon, openPlannerForm, openPlannerList } from "./ui";

const PlannerButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;

    return (
        <ChatBarButton
            tooltip="Programmer un message (clic droit : liste)"
            onClick={() => openPlannerForm()}
            onContextMenu={e => {
                e.preventDefault();
                openPlannerList();
            }}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <ClockIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "MessagePlanner",
    description: "Programme des messages : choisis le serveur, le salon, la date/heure et le nombre d'envois (avec un intervalle). L'onglet Discord doit rester ouvert.",
    tags: ["Chat", "Utility"],
    dependencies: ["ChatInputButtonAPI"],
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    settings,

    chatBarButton: {
        icon: ClockIcon,
        render: PlannerButton
    },

    toolboxActions: {
        "Messages programmés": openPlannerList
    },

    async start() {
        await loadJobs();
        startScheduler();
    },

    stop() {
        stopScheduler();
    }
});
