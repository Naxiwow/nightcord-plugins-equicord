import definePlugin from "@utils/types";

export default definePlugin({
    name: "FixPostMessageTransport",
    description: "Silences PostMessageTransport errors from hCaptcha iframes to reduce lag during Discord captcha popups.",
    authors: [{ name: "naxiwow", id: 875342291001278504n }],
    patches: [{
        find: "event data should be an Array",
        replacement: {
            // Discord's PostMessageTransport expects Array data; hCaptcha sends objects/strings
            // which hit this branch repeatedly during captcha. Discord now returns early itself
            // but still logs a console.warn per message, so drop the warn.
            match: /if\(!Array\.isArray\((\i)\)\)return void console\.warn\("\[PostMessageTransport\][^"]*"\);/,
            replace: "if(!Array.isArray($1))return;",
        }
    }]
});
