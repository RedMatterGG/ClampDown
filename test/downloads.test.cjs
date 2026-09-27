const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { downloadAll } = require("../src/downloads.cjs");

test("download all saves Discord archive parts without overwriting existing files", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "clampdown-downloads-"));
    const response = { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
    try {
        await fs.writeFile(path.join(folder, "renamed.7z.001"), "existing");
        const saved = await downloadAll([{ name: "bundle.7z.001", url: "https://cdn.discordapp.com/attachments/1/2/bundle.7z.001" }, { name: "bundle.7z.002", url: "https://media.discordapp.net/attachments/1/2/bundle.7z.002" }], path.join(folder, "renamed.7z.001"), async () => response);
        assert.deepEqual(saved.map(file => path.basename(file)), ["renamed (1).7z.001", "renamed (1).7z.002"]);
        assert.deepEqual(await fs.readFile(saved[0]), Buffer.from([1, 2, 3]));
        await assert.rejects(downloadAll([{ name: "bad.zip", url: "https://example.com/bad.zip" }], path.join(folder, "bad.zip"), async () => response), /non-Discord/);
    } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
