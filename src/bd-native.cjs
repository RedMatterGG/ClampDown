// SPDX-License-Identifier: GPL-3.0-or-later
// Only BetterDiscord-supported modules belong here. Native modules stay in helper.cjs.
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { shell } = require("electron");
const { downloadAll: saveAttachments } = require("./downloads.cjs");
const helperSource = require("clampdown-helper-source");
const HELPER_VERSION = "1.2.3";
const NODE_RELEASES = {
    x64: { file: "node-v24.20.0-x64.msi", sha256: "28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a" },
    arm64: { file: "node-v24.20.0-arm64.msi", sha256: "15130c76b7a3a5f58233a3c383944ebd0da924d2fc80e50916769a4b7b9af6f8" }
};

function createNative(api) {
    const root = path.join(BdApi.Plugins.folder, "ClampDown");
    const runtimePath = path.join(root, "helper-runtime.json");
    let starting;
    let helperState = "offline";
    function connection() {
        const c = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
        if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535 || !/^[a-f0-9]{64}$/.test(c.token)) throw Error("Invalid local helper configuration");
        return c;
    }
    function nodePath() {
        return [path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"), path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe")].find(p => fs.existsSync(p));
    }
    async function request(route, data, raw, c = connection()) {
        const headers = { Authorization: `Bearer ${c.token}` };
        if (raw) headers["X-ClampDown-Meta"] = encodeURIComponent(JSON.stringify(data));
        else headers["Content-Type"] = "application/json";
        const res = await BdApi.Net.fetch(`http://127.0.0.1:${c.port}/${route}`, {
            method: route === "status" ? "GET" : "POST", headers,
            body: route === "status" ? undefined : raw || JSON.stringify(data || {}),
            timeout: route === "status" ? 2000 : 35 * 60 * 1000,
            maxRedirects: 0
        });
        if (!res.ok) { let error; try { error = (await res.json()).error; } catch {} throw Error(error || `Local helper error ${res.status}`); }
        if (raw) return { ...JSON.parse(decodeURIComponent(res.headers.get("X-ClampDown-Meta"))), bytes: new Uint8Array(await res.arrayBuffer()) };
        return res.json();
    }
    async function launch() {
        helperState = "starting";
        try { const c = connection(); if (c.version === HELPER_VERSION && (await request("status", null, null, c)).helper === "running") return; await request("shutdown", {}, null, c); } catch {}
        if (process.platform !== "win32") throw Error("Start the local helper with Node.js: node ClampDown/helper.cjs ClampDown");
        const node = nodePath();
        if (!node) throw Error("Install Node.js 22 or newer from nodejs.org, then click Start local helper again.");
        fs.mkdirSync(root, { recursive: true });
        const script = path.join(root, "helper.cjs"), launcher = path.join(root, "Start-ClampDown.vbs"), fallback = path.join(root, "Start-ClampDown.cmd");
        fs.writeFileSync(script, helperSource, "utf8");
        // WScript opens Node hidden. Paths are data, with VBScript quotes escaped.
        const command = [node, script, root].map(p => `"${p}"`).join(" ");
        fs.writeFileSync(launcher, `Set runner = CreateObject("WScript.Shell")\r\nrunner.Run "${command.replaceAll('"', '""')}", 0, False\r\n`, "utf8");
        fs.writeFileSync(fallback, `@echo off\r\nstart "" /b "%SystemRoot%\\System32\\wscript.exe" "${launcher}"\r\n`, "utf8");
        const error = await shell.openPath(launcher);
        if (error) throw Error(`Could not start the local helper: ${error}`);
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            try { if ((await request("status")).helper === "running") return; } catch {}
            if (i === 9) {
                const fallbackError = await shell.openPath(fallback);
                if (fallbackError) throw Error(`Could not start the local helper: ${fallbackError}`);
            }
        }
        throw Error(`The local helper did not start. Run node "${script}" "${root}" in a terminal to see the error.`);
    }
    async function ensure() {
        try { const c = connection(); if (c.version === HELPER_VERSION) { await request("status", null, null, c); return; } } catch {}
        if (!api.Data.load("helperEnabled")) throw Error("Set up the local helper in ClampDown → Dependencies & setup first.");
        if (!starting) starting = launch().finally(() => { starting = null; });
        await starting;
    }
    return {
        start: async () => { api.Data.save("helperEnabled", true); try { await ensure(); helperState = "running"; } catch (e) { helperState = "offline"; throw e; } },
        status: async () => { try { const state = await request("status"); helperState = "running"; return state; } catch { return { dependencies: {}, jobs: [], platform: process.platform, helper: helperState }; } },
        nodeStatus: async () => {
            const executable = nodePath();
            if (!executable) return { installed: false };
            try { return { installed: true, executable, version: (await request("status")).node }; } catch { return { installed: true, executable }; }
        },
        installNode: async () => {
            if (nodePath()) return { installed: true, message: "Node.js is already installed." };
            if (process.platform !== "win32" || !NODE_RELEASES[process.arch]) throw Error(`No pinned Node.js installer is available for ${process.platform}/${process.arch}.`);
            const release = NODE_RELEASES[process.arch];
            const response = await BdApi.Net.fetch(`https://nodejs.org/dist/v24.20.0/${release.file}`, { timeout: 5 * 60 * 1000, maxRedirects: 0 });
            if (!response.ok) throw Error(`Node.js download failed: HTTP ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length > 64 * 1024 ** 2 || createHash("sha256").update(bytes).digest("hex") !== release.sha256) throw Error("Node.js installer verification failed. Nothing was opened.");
            fs.mkdirSync(root, { recursive: true });
            const installer = path.join(root, release.file); fs.writeFileSync(installer, bytes);
            const error = await shell.openPath(installer); if (error) throw Error(`Could not open the Node.js installer: ${error}`);
            return { installed: false, message: "The verified Node.js installer is open. Finish its setup, then click Start local helper." };
        },
        compress: async ({ bytes, ...data }) => { await ensure(); return request("compress", data, bytes); },
        archive: async ({ bytes, ...data }) => {
            await ensure(); const result = await request("archive", data, bytes);
            let offset = 0;
            const parts = result.sizes.map((size, index) => { const part = { bytes: result.bytes.slice(offset, offset + size), name: `${result.baseName}.${String(index + 1).padStart(3, "0")}`, type: "application/x-7z-compressed" }; offset += size; return part; });
            if (offset !== result.bytes.length) throw Error("The helper returned an invalid multipart archive.");
            return { ...result, parts };
        },
        install: async name => { await ensure(); return request("install", { name }); },
        cancel: id => request("cancel", { id }).catch(() => {}),
        cancelAll: () => request("cancelAll").catch(() => {}),
        stop: () => request("shutdown").catch(() => {}),
        choose: async (name, kind) => {
            await ensure();
            const selected = await BdApi.UI.openDialog({ mode: "open", title: `Select ${name} ${kind}`, filters: kind === "zip" ? [{ name: "ZIP archive", extensions: ["zip"] }] : undefined, properties: ["openFile"] });
            if (selected.canceled || !selected.filePaths?.[0]) return;
            return request(kind === "zip" ? "import" : "configure", { name, path: selected.filePaths[0] });
        },
        downloadAll: async attachments => {
            const defaultPath = path.join(process.env.USERPROFILE || "", "Downloads", attachments[0].name);
            const selected = await BdApi.UI.openDialog({ mode: "save", title: "Download all archive parts", defaultPath, showOverwriteConfirmation: true });
            if (selected.canceled || !selected.filePath) return [];
            return saveAttachments(attachments, selected.filePath, BdApi.Net.fetch);
        }
    };
}
module.exports = { createNative };
