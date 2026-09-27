const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { settings, targetBytes, archivePartBytes, bitrate, kind, archiveAttachments } = require("../src/policy.cjs");
const { zipEntries, extractZip, verify, downloadSpec } = require("../src/dependencies.cjs");
const { Controller } = require("../src/controller.cjs");
const { run, isAnimated } = require("../src/engine.cjs");

function zip(name, content = "data", mode = 0) {
    const n = Buffer.from(name), data = Buffer.from(content), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
    local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE((mode << 16) >>> 0, 38);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(local.length + n.length + data.length, 16);
    return Buffer.concat([local, n, data, central, n, end]);
}
test("settings reject executable/argument injection and invalid budgets", () => {
    assert.equal(settings({ codec: "h264; rm -rf /", maxHeight: -1 }).codec, "h264");
    assert.equal(settings({ maxHeight: -1 }).maxHeight, 144);
    assert.equal(targetBytes(10485760, settings()), Math.floor(10485760 * .96));
    assert.equal(archivePartBytes(10485760, settings({ archivePartPercent: 90 })), Math.floor(10485760 * .9));
    assert.equal(targetBytes(100 * 1048576, settings({ targetMiB: 2 })), Math.floor(2 * 1048576 * .96));
    assert.throws(() => targetBytes(NaN, settings())); assert.throws(() => bitrate(2000, 99999, 96));
    assert.equal(kind({ name: "invoice.zip" }), null);
    assert.equal(settings({ archiveLevel: "9; unsafe", archiveThreads: 99 }).archiveLevel, "5"); assert.equal(settings({ archiveThreads: 99 }).archiveThreads, 32);
    assert.deepEqual(archiveAttachments({ attachments: [{ filename: "backup.7z.001", url: "https://cdn.discordapp.com/attachments/1/2/a", size: 10 }, { filename: "photo.png", url: "https://cdn.discordapp.com/attachments/1/2/b" }, { filename: "bad.zip", url: "https://example.com/bad" }] }), [{ name: "backup.7z.001", url: "https://cdn.discordapp.com/attachments/1/2/a", size: 10 }]);
});
test("ZIP imports reject traversal, symlinks, Windows alternate streams and corrupt headers", async () => {
    for (const name of ["../ffmpeg.exe", "/ffmpeg.exe", "C:/ffmpeg.exe", "a\\ffmpeg.exe", "a/../b", "a./b", "a:b"]) assert.throws(() => zipEntries(zip(name)));
    assert.throws(() => zipEntries(zip("link", "target", 0xa000)));
    assert.throws(() => zipEntries(Buffer.from("not a zip")));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clampdown-test-"));
    try { await extractZip(zip("bin/ffmpeg.exe"), dir); assert.equal(await fs.readFile(path.join(dir, "bin/ffmpeg.exe"), "utf8"), "data"); } finally { await fs.rm(dir, { recursive: true }); }
});
test("download selection is pinned and checksum failure is fatal", () => {
    assert.match(downloadSpec("ffmpeg", "win32", "x64").url, /9\.0\.1/);
    assert.match(downloadSpec("vips", "win32", "x64").url, /vips-dev-x64-all-8\.18\.2\.zip/);
    assert.match(downloadSpec("sevenzip", "win32", "x64").url, /26\.03\/7zr\.exe/);
    assert.throws(() => downloadSpec("vips", "linux", "x64"), /No pinned/);
    assert.throws(() => verify(Buffer.from("tampered"), "0".repeat(64)), /SHA-256/);
});
test("controller replaces an oversized non-media file with every multipart archive volume", async () => {
    const files = [new File([new Uint8Array(4096)], "SPOILER_project.blend")]; let resumed = 0;
    const ctl = new Controller({ load: () => ({}), save() {}, notice() {}, limit: () => 2048, native: { archive: async () => ({ baseName: "SPOILER_project.blend.7z", backend: "7-Zip", parts: [{ bytes: new Uint8Array(1900), name: "SPOILER_project.blend.7z.001", type: "application/x-7z-compressed" }, { bytes: new Uint8Array(300), name: "SPOILER_project.blend.7z.002", type: "application/x-7z-compressed" }] }), cancelAll() {} } });
    assert.equal(ctl.intercept(files, {}, () => { resumed++; }), true); await ctl.tail;
    assert.equal(resumed, 1); assert.deepEqual(files.map(file => file.name), ["SPOILER_project.blend.7z.001", "SPOILER_project.blend.7z.002"]); assert.ok(files.every(file => file.size <= 2048));
});
test("controller commits a batch once, preserves spoiler names, and reads current limits", async () => {
    let resumed = 0, limitCalls = 0;
    const files = [new File([new Uint8Array(4096)], "SPOILER_photo.png", { type: "image/png" })];
    const ctl = new Controller({ load: () => ({}), save() {}, notice() {}, limit() { limitCalls++; return 2048; }, native: { compress: async request => ({ bytes: new Uint8Array(1024), name: request.name, type: "image/png", backend: "test" }), cancelAll() {} } });
    assert.equal(ctl.intercept(files, {}, () => { resumed++; assert.equal(ctl.intercept(files, {}, () => {}), false); }), true);
    assert.equal(ctl.intercept(files, {}, () => {}), true);
    await ctl.tail;
    assert.equal(resumed, 1); assert.equal(limitCalls, 1); assert.equal(files[0].size, 1024); assert.equal(files[0].name, "SPOILER_photo.png");
});
test("failed batches retain all originals and offer retry", async () => {
    const originals = [new File([new Uint8Array(4096)], "a.png"), new File([new Uint8Array(4096)], "b.png")]; const files = originals.slice(); let calls = 0, resumed = false;
    const ctl = new Controller({ load: () => ({}), save() {}, notice() {}, limit: () => 2048, native: { compress: async () => { if (++calls === 2) throw Error("failure"); return { bytes: new Uint8Array(10), name: "a.webp", type: "image/webp" }; }, cancelAll() {} } });
    ctl.intercept(files, {}, () => { resumed = true; }); await ctl.tail;
    assert.deepEqual(files, originals); assert.equal(resumed, false); assert.equal(typeof ctl.retry, "function");
});
test("unknown limits do not invent a Discord allowance", () => {
    const ctl = new Controller({ load: () => ({}), save() {}, notice() {}, limit: () => undefined, native: {} });
    assert.throws(() => ctl.limit({}), /unavailable/); ctl.save({ targetMiB: 5 }); assert.equal(ctl.limit({}), 5 * 1048576);
});
test("stopping a plugin cannot replay pending attachments", async () => {
    let finish, resumed = false;
    const ctl = new Controller({ load: () => ({}), save() {}, notice() {}, limit: () => 2048, native: { compress: () => new Promise(r => { finish = r; }), cancelAll() {} } });
    ctl.intercept([new File([new Uint8Array(4096)], "a.png")], {}, () => { resumed = true; });
    await new Promise(r => setImmediate(r)); ctl.stop(); finish({ bytes: new Uint8Array(1), name: "a.png" }); await ctl.tail; assert.equal(resumed, false);
});
test("subprocesses cancel and arguments are not interpreted by a shell", async () => {
    const text = "literal; $HOME && echo unsafe";
    assert.equal((await run(process.execPath, ["-e", "process.stdout.write(process.argv[1])", text])).stdout, text);
    const controller = new AbortController(); const p = run(process.execPath, ["-e", "setInterval(()=>{},100)"], { signal: controller.signal }); controller.abort(); await assert.rejects(p, /Cancel/);
    assert.equal(await isAnimated(Buffer.from("GIF89a")), true); assert.equal(await isAnimated(Buffer.from("RIFF    WEBPVP8 ")), false);
});
