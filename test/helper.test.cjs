const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { startHelper } = require("../src/helper.cjs");
test("local helper authenticates every request, exposes status and cleans up", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clampdown-helper-"));
    const service = await startHelper(root);
    const base = `http://127.0.0.1:${service.connection.port}`;
    const headers = { Authorization: `Bearer ${service.connection.token}` };
    try {
        assert.equal((await fetch(base + "/status")).status, 403);
        assert.equal((await fetch(base + "/status", { headers: { ...headers, Origin: "https://example.com" } })).status, 403);
        const status = await (await fetch(base + "/status", { headers })).json(); assert.equal(status.helper, "running");
        assert.equal((await fetch(base + "/unknown", { method: "POST", headers, body: "{}" })).status, 404);
        const invalid = await fetch(base + "/compress", { method: "POST", headers: { ...headers, "X-ClampDown-Meta": encodeURIComponent(JSON.stringify({ name: "file.exe", limit: 4096 })) }, body: new Uint8Array(10) });
        assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /file type/);
        const cancel = await fetch(base + "/cancelAll", { method: "POST", headers, body: "{}" }); assert.equal(cancel.status, 200);
    } finally { await service.close(); await fs.rm(root, { recursive: true, force: true }); }
});
