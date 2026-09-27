const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function webpackFixture() {
    const exports = {
        get Ay() { throw new ReferenceError("Cannot access 'IP' before initialization"); },
        upload() { return "Unexpected mismatch between files and file metadata"; },
        limit() { /* getUserMaxFileSize */ return 10485760; },
        config() { /* getConfig */ return { enabled: true, threshold: 20, isGA: true }; }
    };
    const modules = { 416799() { return "Unexpected mismatch between files and file metadata getUserMaxFileSize kestrel"; } };
    return { modules, getStore() {}, Filters: { byStrings: text => value => String(value).includes(text) },
        getById(id, options) { assert.equal(options.raw, true); return id in modules ? { exports } : undefined; }
    };
}
test("packaged plugin loads and starts with BetterDiscord's restricted require", async () => {
    const requested = [], notices = [], writes = [];
    let patches = 0, intercept, menuPatch, menuUnpatches = 0, dialogOptions;
    const patcher = { instead(module, key, callback) { assert.equal(key, "upload"); patches++; intercept = callback; }, unpatchAll() {} };
    class BdApi { constructor() { this.Data = { load() {}, save() {} }; this.Patcher = patcher; this.ContextMenu = { patch(navId, callback) { assert.equal(navId, "message"); menuPatch = callback; return () => { menuUnpatches++; }; }, buildMenuChildren: groups => groups }; } }
    BdApi.Plugins = { folder: "C:\\Test\\plugins" };
    BdApi.UI = { showToast: text => notices.push(text), openDialog: async options => { dialogOptions = options; return { canceled: false, filePath: "C:\\Users\\Test\\Downloads\\runtime.7z.001" }; } };
    BdApi.Net = { fetch: async url => { if (String(url).startsWith("https://cdn.discordapp.com/")) return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }; throw Error("Helper offline"); } };
    BdApi.Webpack = webpackFixture();
    const sandbox = { module: { exports: {} }, BdApi, File, URL, process: { platform: "win32", env: {} }, console, setTimeout, clearTimeout,
        MutationObserver: class { observe() {} disconnect() {} }, document: { body: {}, querySelectorAll: () => [] },
        require: name => {
            requested.push(name);
            if (name === "electron") return { shell: { openPath: async () => { throw Error("Must not launch helper during startup"); } } };
            if (name === "crypto") return require("node:crypto");
            if (name === "path") return require("node:path").win32;
            if (name === "fs") return { readFileSync() { throw Error("No helper configuration"); }, existsSync() { return false; }, writeFile(file, bytes, options, callback) { writes.push({ file, bytes, options }); callback(null); } };
            throw Error(`Cannot find module ${name}`);
        }
    };
    vm.runInNewContext(fs.readFileSync("dist/ClampDown.plugin.js", "utf8"), sandbox);
    const plugin = new sandbox.module.exports(); plugin.start();
    assert.equal(patches, 1);
    // BetterDiscord's rendered message menu is nested below an outer wrapper.
    const menuItems = [], menu = { props: { children: [{ props: { children: { navId: "message", children: menuItems } } }] } };
    menuPatch(menu, { message: { attachments: ["001", "002", "003"].map(part => ({ filename: `windowsdesktop-runtime-10.0.6-win-x86.exe.7z.${part}`, url: `https://cdn.discordapp.com/attachments/1/2/runtime.7z.${part}` })) } });
    assert.equal(menuItems.length, 1); assert.equal(menuItems[0][0].items[0].label, "Download all 3 archive parts");
    await menuItems[0][0].items[0].action();
    assert.equal(dialogOptions.mode, "save"); assert.match(dialogOptions.defaultPath, /windowsdesktop-runtime-10\.0\.6-win-x86\.exe\.7z\.001$/);
    assert.deepEqual(writes.map(write => write.file.split("\\").at(-1)), ["runtime.7z.001", "runtime.7z.002", "runtime.7z.003"]);
    assert.equal(plugin.controller.limit({ guild_id: "test" }), 20971520);
    const compress = plugin.native.compress;
    let encoded = 0, resumed = 0;
    plugin.native.compress = async request => { encoded++; assert.equal(request.limit, 20971520); return { bytes: new Uint8Array(1024), name: request.name, type: request.type }; };
    const channel = { id: "channel", getGuildId: () => "guild" }, options = { requireConfirm: true };
    // Browser FileList is iterable but is not an Array and cannot be spliced.
    const fileList = size => Object.freeze({ length: 1, *[Symbol.iterator]() { yield new File([new Uint8Array(size)], "clip.mp4", { type: "video/mp4" }); } });
    const args = [fileList(23 * 1048576), channel, 0, options];
    intercept(null, args, (files, selected, draft, metadata) => {
        resumed++; assert.ok(Array.isArray(files)); assert.equal(files[0].size, 1024);
        assert.equal(selected, channel); assert.equal(draft, 0); assert.equal(metadata, options);
    });
    assert.equal(resumed, 0); await plugin.controller.tail;
    assert.equal(encoded, 1); assert.equal(resumed, 1);
    intercept(null, [fileList(15 * 1048576), channel, 0, options], files => { resumed++; assert.equal(files[0].size, 15 * 1048576); });
    assert.equal(encoded, 1); assert.equal(resumed, 2);
    plugin.native.compress = compress;
    assert.deepEqual([...new Set(requested)].sort(), ["crypto", "electron", "fs", "path"]);
    const status = await plugin.native.status(); assert.equal(status.helper, "offline");
    await assert.rejects(plugin.native.compress({ bytes: new Uint8Array(10), name: "a.png" }), /Set up the local helper/);
    plugin.stop();
    assert.equal(menuUnpatches, 1);
    assert.match(notices[0], /active and watching/);
    // Missing modules and targeted lookup errors must retry, then stop cleanly.
    const timers = new Map(); let timerId = 0;
    sandbox.setTimeout = callback => { timers.set(++timerId, callback); return timerId; };
    sandbox.clearTimeout = id => timers.delete(id);
    const lookup = BdApi.Webpack.getById;
    BdApi.Webpack.getById = () => { throw new ReferenceError("Cannot access 'IP' before initialization"); };
    const delayed = new sandbox.module.exports(); delayed.start();
    assert.equal(timers.size, 1); assert.equal(patches, 1);
    BdApi.Webpack.getById = lookup;
    const retry = [...timers.values()][0]; timers.clear(); retry();
    assert.equal(patches, 2); assert.equal(timers.size, 0); delayed.stop();
    BdApi.Webpack.getById = () => undefined;
    const stopped = new sandbox.module.exports(); stopped.start();
    assert.equal(timers.size, 1); stopped.stop(); assert.equal(timers.size, 0);
    const unavailable = new sandbox.module.exports(); unavailable.start();
    for (let i = 0; i < 29; i++) { const next = [...timers.values()][0]; timers.clear(); next(); }
    assert.equal(timers.size, 0); assert.match(notices.at(-1), /Automatic compression is inactive/);
    unavailable.stop();
});

test("packaged BetterDiscord adapter compresses through the authenticated helper", { skip: !fs.existsSync(".test-work/native/dependencies.json") }, async () => {
    const fsp = require("node:fs/promises"), path = require("node:path");
    const { startHelper } = require("../src/helper.cjs");
    const { run } = require("../src/engine.cjs");
    const folder = await fsp.mkdtemp(path.join(require("node:os").tmpdir(), "pd-adapter-"));
    const root = path.join(folder, "ClampDown");
    const helper = await startHelper(root);
    try {
        const deps = JSON.parse(await fsp.readFile(".test-work/native/dependencies.json", "utf8"));
        await helper.engine.configure("ffmpeg", deps.ffmpeg.path);
        const image = path.join(folder, "sample.png");
        await run(deps.ffmpeg.path, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=1600x900", "-frames:v", "1", image]);
        class BdApi { constructor() { this.Data = { load() {}, save() {} }; this.Patcher = { instead() {}, unpatchAll() {} }; } }
        BdApi.Plugins = { folder }; BdApi.Net = { fetch }; BdApi.UI = { showToast() {} };
        BdApi.Webpack = webpackFixture();
        const sandbox = { module: { exports: {} }, BdApi, process: { platform: process.platform, env: {} }, console, setTimeout, clearTimeout, Uint8Array,
            MutationObserver: class { observe() {} disconnect() {} }, document: { body: {}, querySelectorAll: () => [] },
            require: name => { if (name === "electron") return { shell: {} }; if (["crypto", "fs", "path"].includes(name)) return require(name); throw Error(`Unsupported: ${name}`); }
        };
        vm.runInNewContext(fs.readFileSync("dist/ClampDown.plugin.js", "utf8"), sandbox);
        const plugin = new sandbox.module.exports(); plugin.start();
        const result = await plugin.native.compress({ bytes: new Uint8Array(await fsp.readFile(image)), name: "SPOILER_sample.png", type: "image/png", limit: 20000, settings: { imageFormat: "webp", imageBackend: "ffmpeg" } });
        assert.ok(result.bytes.byteLength <= 19200); assert.equal(result.name, "SPOILER_sample.webp");
        const sevenzip = path.resolve(".test-work/7zip/7zr.exe");
        if (fs.existsSync(sevenzip)) {
            await helper.engine.configure("sevenzip", sevenzip);
            const archive = await plugin.native.archive({ bytes: new Uint8Array(require("node:crypto").randomBytes(240000)), name: "project.blend", limit: 100000, settings: { archivePartPercent: 90 } });
            assert.ok(archive.parts.length >= 3); assert.ok(archive.parts.every(part => part.bytes.length <= 90000)); assert.match(archive.parts[0].name, /\.7z\.001$/);
        }
        assert.equal((await plugin.native.status()).helper, "running");
    } finally { await helper.close(); await fsp.rm(folder, { recursive: true, force: true }); }
});
