/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Compat shim: les plugins nightcord importent un helper i18n (`t` / `tPlugin`).
// Equicord n'a pas de couche i18n -> passthrough identité.
export const tPlugin = (str: string, ..._args: any[]): string => str;
export const t = tPlugin;
export default { tPlugin, t };
