/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { access, mkdir } from "fs/promises";
import path from "path";

export async function exists(filename: string) {
    try {
        await access(filename);
        return true;
    } catch (error) {
        return false;
    }
}

export async function ensureDirectoryExists(cacheDir: string) {
    if (!await exists(cacheDir))
        await mkdir(cacheDir);
}

export function getAttachmentIdFromFilename(filename: string) {
    const name = path.parse(filename).name;
    // New format: username_snowflakeId — snowflakes are always 17-19 digits
    const match = name.match(/(\d{17,19})$/);
    return match ? match[1] : name;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
