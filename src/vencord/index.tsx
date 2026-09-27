// SPDX-License-Identifier: GPL-3.0-or-later
import { ChatBarButton } from "@api/ChatButtons";
import * as DataStore from "@api/DataStore";
import definePlugin, { PluginNative } from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { ChannelStore, Menu, React, SelectedChannelStore, showToast } from "@webpack/common";
// These shared CommonJS files are copied beside this adapter by the build.
import { Controller } from "./controller.cjs";
import { archiveAttachments } from "./policy.cjs";
import { ICON_PATH, openPanel } from "./ui.cjs";

const Native = VencordNative.pluginHelpers.ClampDown as PluginNative<typeof import("./native")>;
const getLimit = findByCodeLazy("getUserMaxFileSize");
let controller: InstanceType<typeof Controller>;
function Icon() { return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d={ICON_PATH} /></svg>; }
function messageMenu(children: any[], { message }: any) {
    const attachments = archiveAttachments(message); if (!attachments.length) return;
    children.splice(-1, 0, <Menu.MenuItem id="clampdown-download-archives" label={attachments.length === 1 ? "Download archive" : `Download all ${attachments.length} archive parts`} action={async () => {
        try { const saved = await Native.downloadAll(attachments); if (saved.length) showToast(`ClampDown downloaded ${saved.length} file${saved.length === 1 ? "" : "s"}.`); }
        catch (error) { showToast(`ClampDown: ${error instanceof Error ? error.message : String(error)}`); }
    }} />);
}
export default definePlugin({
    name: "ClampDown",
    description: "Automatically fit images and videos to Discord's upload limit, entirely on your computer.",
    authors: [{ name: "RedMatterGG", id: 0n }],
    tags: ["Utility"],
    contextMenus: { "message": messageMenu },
    patches: [{
        find: "Unexpected mismatch between files and file metadata",
        replacement: {
            match: /async function (\i)\((\i),(\i),(\i)\)\{(?=let\{filesMetadata:)/,
            replace: "$&if($self.intercept($2,$3,()=> $1.apply(this,arguments)))return;"
        }
    }],
    async start() {
        const saved = await DataStore.get("ClampDown.settings");
        controller = new Controller({
            native: Native,
            openSettings: () => openPanel(controller),
            load: () => saved,
            save: (value: any) => { DataStore.set("ClampDown.settings", value).catch(console.error); },
            notice: (message: string) => showToast(message),
            channel: () => ChannelStore.getChannel(SelectedChannelStore.getChannelId()),
            limit: (channel: any) => getLimit(channel?.guild_id)
        });
    },
    stop() { controller?.closePanel?.(); controller?.stop(); },
    intercept(files: File[], channel: any, resume: () => void) { return controller?.intercept(files, channel, resume) ?? false; },
    chatBarButton: {
        icon: Icon,
        render: ({ isAnyChat }) => isAnyChat ? <ChatBarButton tooltip="ClampDown · compression settings" onClick={() => controller && openPanel(controller)}><Icon /></ChatBarButton> : null
    },
    settingsAboutComponent: () => <button onClick={() => controller && openPanel(controller)}>Open ClampDown settings and dependency setup</button>
});
