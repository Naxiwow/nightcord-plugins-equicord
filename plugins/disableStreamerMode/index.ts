import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

// Intercept STREAMER_MODE_UPDATE dispatches that come from streaming app detection.
// When Discord detects OBS/XSplit/etc it dispatches with a non-null streamingApp field.
// We cancel those while leaving manual toggles (streamingApp === null) untouched.
const interceptor = (data: any): false | void => {
    if (data.type === "STREAMER_MODE_UPDATE" && data.streamingApp != null)
        return false;
};

// Correct format for STREAMER_MODE_UPDATE, as shown in the built-in streamerModeOnStream plugin.
// Discord's store ignores the old {enabled, locked, streamingApp} shape for this dispatch type.
const DISABLE_DISPATCH = Object.freeze({
    type: "STREAMER_MODE_UPDATE",
    key: "enabled",
    value: false,
});

export default definePlugin({
    name: "DisableStreamerMode",
    description: "Prevents Discord from auto-enabling streamer mode when OBS or other streaming apps are detected. You can still toggle it manually in settings.",
    authors: [{ name: "naxiwow", id: 875342291001278504n }],

    start() {
        FluxDispatcher.addInterceptor(interceptor);

        // Force-disable in case streamer mode was already active before the plugin loaded.
        // Two attempts: once early, once after Discord finishes its own initialization.
        setTimeout(() => FluxDispatcher.dispatch(DISABLE_DISPATCH as any), 500);
        setTimeout(() => FluxDispatcher.dispatch(DISABLE_DISPATCH as any), 2000);
    },

    stop() {
        // FluxDispatcher has no removeInterceptor method; splice it out of the internal array directly.
        const list = (FluxDispatcher as any)._interceptors ?? [];
        const idx = list.indexOf(interceptor);
        if (idx !== -1) list.splice(idx, 1);
    },
});
