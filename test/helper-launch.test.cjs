const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
test("bundled helper launches hidden through the generated Windows launcher", { skip: process.env.CLAMPDOWN_TEST_LAUNCH !== "1", timeout: 15000 }, async () => {
    await fsp.mkdir(".test-work", { recursive: true });
    const folder = await fsp.mkdtemp(path.resolve(".test-work/launch-"));
    let plugin;
    try {
        const data = {};
        class BdApi { constructor() { this.Data = { load: k => data[k], save: (k, v) => { data[k] = v; } }; this.Patcher = { instead() {}, unpatchAll() {} }; } }
        BdApi.Plugins = { folder }; BdApi.Net = { fetch }; BdApi.UI = { showToast() {} };
        BdApi.Webpack = { modules: { 1() { return "Unexpected mismatch between files and file metadata"; } }, getStore() {}, Filters: { byStrings: text => fn => String(fn).includes(text) }, getById: () => ({ exports: { upload() { return "Unexpected mismatch between files and file metadata"; } } }) };
        const sandbox = { module: { exports: {} }, BdApi, process, console, setTimeout, clearTimeout, Uint8Array,
            MutationObserver: class { observe() {} disconnect() {} }, document: { body: {}, querySelectorAll: () => [] },
            require: name => {
                if (name === "electron") return { shell: { openPath: file => new Promise((resolve, reject) => {
                    const p = spawn("cscript.exe", ["//Nologo", "//B", file], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
                    let output = ""; p.stdout.on("data", b => { output += b; }); p.stderr.on("data", b => { output += b; });
                    const timer = setTimeout(() => p.kill(), 5000);
                    p.once("error", e => { clearTimeout(timer); reject(e); }); p.once("exit", code => { clearTimeout(timer); resolve(code === 0 ? "" : `Launcher exit ${code}: ${output}`); });
                }) } };
                if (["crypto", "fs", "path"].includes(name)) return require(name);
                throw Error(`Unsupported module: ${name}`);
            }
        };
        vm.runInNewContext(fs.readFileSync("dist/ClampDown.plugin.js", "utf8"), sandbox);
        plugin = new sandbox.module.exports(); plugin.start();
        await plugin.native.start();
        assert.equal((await plugin.native.status()).helper, "running");
        assert.equal(data.helperEnabled, true);
    } finally {
        if (plugin) await plugin.native.stop();
        await new Promise(resolve => setTimeout(resolve, 500));
        await fsp.rm(folder, { recursive: true, force: true });
    }
});
