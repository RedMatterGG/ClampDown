// SPDX-License-Identifier: GPL-3.0-or-later
const { createNative } = require("./bd-native.cjs");
const { Controller } = require("./controller.cjs");
const { archiveAttachments } = require("./policy.cjs");
const { icon, openPanel, COMPOSER_CSS } = require("./ui.cjs");
// Lazy Discord export getters may throw before their module initializes.
function findExport(W, text, matches = W.Filters.byStrings(text)) {
    // Locate candidates by factory source first. This avoids walking every live
    // export object, where unrelated Discord getters may still be in a TDZ.
    try {
        for (const id of Object.keys(W.modules)) {
            try {
            if (!String(W.modules[id]).includes(text)) continue;
            const raw = W.getById(id, { raw: true });
            const exports = raw?.exports;
            if (typeof exports === "function" && matches(exports)) return { module: raw, key: "exports", value: exports };
            if (!exports || !["object", "function"].includes(typeof exports)) continue;
            for (const key of Object.keys(exports)) {
                try {
                    const value = exports[key];
                    if (typeof value === "function" && matches(value)) return { module: exports, key, value };
                } catch { /* Skip only the uninitialized export, not its siblings. */ }
            }
            } catch { /* A broken candidate must not hide subsequent modules. */ }
        }
    } catch { /* Host module checks may also encounter lazy getters; retry later. */ }
    return undefined;
}
function findMessageMenuChildren(root) {
    const seen = new Set();
    const visit = value => {
        if (!value || typeof value !== "object" || seen.has(value)) return undefined;
        seen.add(value);
        if (value.navId === "message" && Array.isArray(value.children)) return value.children;
        if (Array.isArray(value)) {
            for (const child of value) { const found = visit(child); if (found) return found; }
            return undefined;
        }
        return visit(value.props) || visit(value.children);
    };
    return visit(root);
}
module.exports = class ClampDown {
    start() {
        const api = this.api = new BdApi("ClampDown");
        const W = BdApi.Webpack;
        const currentChannel = () => W.getStore("ChannelStore")?.getChannel(W.getStore("SelectedChannelStore")?.getChannelId());
        const native = this.native = createNative(api);
        const controller = this.controller = new Controller({
            native, load: () => api.Data.load("settings"), save: value => api.Data.save("settings", value), channel: currentChannel, openSettings: () => openPanel(this.controller),
            notice: text => BdApi.UI.showToast(text, { type: "info", timeout: 6500 }),
            limit: channel => {
                const getLimit = findExport(W, "getUserMaxFileSize")?.value;
                const base = getLimit?.(channel?.getGuildId?.() ?? channel?.guild_id);
                const config = findExport(W, "kestrel", value => /getConfig/.test(String(value)) && /threshold/.test(String(value)) && /isGA/.test(String(value)))?.value;
                if (!config) throw Error("Discord's effective upload limit is unavailable");
                const state = config({ location: "web.filesExceedUploadLimits" });
                return state.enabled ? Math.max(base, state.threshold * 1048576) : base;
            }
        });
        this.menuUnpatch = api.ContextMenu?.patch?.("message", (menu, props) => {
            const attachments = archiveAttachments(props?.message); if (!attachments.length) return;
            const item = { id: "clampdown-download-archives", label: attachments.length === 1 ? "Download archive" : `Download all ${attachments.length} archive parts`, action: async () => {
                try { const saved = await native.downloadAll(attachments); if (saved.length) BdApi.UI.showToast(`ClampDown downloaded ${saved.length} file${saved.length === 1 ? "" : "s"}.`, { type: "success" }); }
                catch (error) { BdApi.UI.showToast(`ClampDown: ${error.message || error}`, { type: "error" }); }
            } };
            const children = findMessageMenuChildren(menu); if (!children) return;
            children.push(api.ContextMenu.buildMenuChildren([{ type: "group", items: [item] }]));
        });
        let attempts = 0;
        const attach = () => {
            const found = findExport(W, "Unexpected mismatch between files and file metadata");
            if (found) {
                api.Patcher.instead(found.module, found.key, (self, args, original) => {
                    // Picker/drop callers can pass FileList; normalize before the
                    // controller mutates the batch and before replaying Discord.
                    const input = args[0];
                    if (!Array.isArray(input) && input && typeof input[Symbol.iterator] === "function") args[0] = Array.from(input);
                    if (!controller.intercept(args[0], args[1], () => original.apply(self, args))) return original.apply(self, args);
                });
                BdApi.UI.showToast("ClampDown is active and watching oversized attachments.", { type: "success", timeout: 4000 });
                return;
            }
            if (++attempts < 30) this.hookTimer = setTimeout(attach, 1000);
            else BdApi.UI.showToast("ClampDown: Discord's upload hook is unavailable. Automatic compression is inactive; reload Discord or update the plugin.", { type: "error", timeout: 15000 });
        };
        attach();
        // BetterDiscord has no shared ChatButtons API. Attach only to the composer action row.
        this.buttons = new Set();
        this.observer = new MutationObserver(() => this.mountButtons());
        this.observer.observe(document.body, { childList: true, subtree: true }); this.mountButtons();
    }
    mountButtons() {
        for (const el of this.buttons) if (!el.isConnected) this.buttons.delete(el);
        for (const row of document.querySelectorAll('[class*="channelTextArea_"] [class*="buttons_"]')) {
            if (row.querySelector("[data-clampdown]")) continue;
            if (!this.buttonStyle) {
                this.buttonStyle = document.createElement("style");
                this.buttonStyle.textContent = COMPOSER_CSS;
                document.head.append(this.buttonStyle);
            }
            const button = document.createElement("button"); button.type = "button"; button.dataset.clampdown = "true"; button.title = "ClampDown · compression settings"; button.setAttribute("aria-label", "ClampDown compression settings");
            button.append(icon()); button.onclick = () => openPanel(this.controller); row.prepend(button); this.buttons.add(button);
        }
    }
    getSettingsPanel() { return openPanel(this.controller, true); }
    stop() { clearTimeout(this.hookTimer); this.menuUnpatch?.(); this.observer?.disconnect(); this.buttonStyle?.remove(); this.buttonStyle = null; for (const el of this.buttons || []) el.remove(); this.api?.Patcher.unpatchAll(); this.controller?.closePanel?.(); this.controller?.stop(); this.native?.stop(); }
};
