/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

// Discord only adds roles to the @ autocomplete when fewer users than the limit matched
// (`if(T<h&&d)` … `.slice(0,h-T)`). With many matching users (worse with UniversalMention,
// which drops the "can view channel" filter) roles never showed up, so they couldn't be @'d.
// Always query roles and keep room for at least 3 of them.
export default definePlugin({
    name: "RoleMentionFix",
    description: "Always show matching roles in the @ mention autocomplete, even when many users match.",
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    enabledByDefault: true,

    patches: [
        {
            find: ",queryMentionResults(",
            replacement: {
                match: /if\((\i)<(\i)&&(\i)\)(\{let \i=\i\.getGuildId\(\).{0,500}?\.slice\(0,)\2-\1\)/,
                replace: "if($3)$4Math.max($2-$1,3))"
            }
        }
    ]
});
