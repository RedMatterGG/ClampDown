// SPDX-License-Identifier: GPL-3.0-or-later
// Separate Node process. This file is never executed in BetterDiscord's renderer.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { Engine } = require("./engine.cjs");
const { install } = require("./dependencies.cjs");

async function startHelper(root) {
    const engine = new Engine(root); await engine.init();
    const token = randomBytes(32).toString("hex");
    const runtimeFile = path.join(engine.root, "helper-runtime.json");
    let lastRequest = Date.now();
    const json = (res, value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    const server = http.createServer(async (req, res) => {
        const auth = Buffer.from(req.headers.authorization || "");
        const expected = Buffer.from(`Bearer ${token}`);
        if (auth.length !== expected.length || !timingSafeEqual(auth, expected) || req.headers.origin) { json(res, { error: "Unauthorized" }, 403); req.resume(); return; }
        lastRequest = Date.now();
        try {
            if (req.method === "GET" && req.url === "/status") { json(res, { ...await engine.status(), helper: "running", node: process.version }); return; }
            if (req.method !== "POST") { json(res, { error: "Not found" }, 404); return; }
            const chunks = []; let total = 0;
            const max = ["/compress", "/archive"].includes(req.url) ? 1024 ** 3 : 16384;
            for await (const chunk of req) { total += chunk.length; if (total > max) throw Error("Request too large"); chunks.push(chunk); }
            const body = Buffer.concat(chunks);
            if (["/compress", "/archive"].includes(req.url)) {
                const metadata = JSON.parse(decodeURIComponent(req.headers["x-clampdown-meta"] || ""));
                const result = await engine[req.url === "/archive" ? "archive" : "compress"]({ ...metadata, bytes: new Uint8Array(body) });
                const chunks = result.parts?.map(part => Buffer.from(part.bytes)) || [Buffer.from(result.bytes)];
                const info = result.parts ? { baseName: result.baseName, backend: result.backend, originalBytes: result.originalBytes, outputBytes: result.outputBytes, sizes: result.parts.map(part => part.bytes.length) } : (({ bytes, ...rest }) => rest)(result);
                res.writeHead(200, { "Content-Type": "application/octet-stream", "X-ClampDown-Meta": encodeURIComponent(JSON.stringify(info)), "Cache-Control": "no-store" });
                res.end(Buffer.concat(chunks)); return;
            }
            const args = JSON.parse(body.toString() || "{}");
            let result;
            switch (req.url) {
                case "/install": result = await install(engine, args.name); break;
                case "/configure": result = await engine.configure(args.name, args.path); break;
                case "/import": result = await install(engine, args.name, { archive: args.path }); break;
                case "/cancel": engine.cancel(args.id); break;
                case "/cancelAll": engine.cancelAll(); break;
                case "/shutdown": engine.cancelAll(); setTimeout(() => close(), 100).unref(); break;
                default: json(res, { error: "Not found" }, 404); return;
            }
            json(res, result || { ok: true });
        } catch (e) { if (!res.headersSent && !res.destroyed) json(res, { error: e.message }, 400); }
    });
    server.requestTimeout = 35 * 60 * 1000;
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const connection = { port: server.address().port, token, version: "1.2.3", pid: process.pid };
    await fs.writeFile(runtimeFile, JSON.stringify(connection), { mode: 0o600 });
    const timer = setInterval(() => { if (Date.now() - lastRequest > 10 * 60 * 1000 && !engine.jobs.size && !engine.installing) close(); }, 30000);
    timer.unref();
    async function close() {
        clearInterval(timer); engine.cancelAll(); server.close(); server.closeAllConnections();
        try { const current = JSON.parse(await fs.readFile(runtimeFile, "utf8")); if (current.token === token) await fs.unlink(runtimeFile); } catch {}
    }
    return { connection, engine, close };
}
if (require.main === module) {
    startHelper(process.argv[2] || __dirname).catch(e => { console.error(e); process.exitCode = 1; });
}
module.exports = { startHelper };
