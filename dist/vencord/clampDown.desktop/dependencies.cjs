// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { inflateRawSync } = require("node:zlib");
const https = require("node:https");
const { run } = require("./engine.cjs");
const RELEASES = {
    ffmpeg: { version: "9.0.1", url: "https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip", sha256: "fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9" },
    sevenzip: { version: "26.03", url: "https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe", sha256: "ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d", executable: "7zr.exe" },
    vips: { version: "8.18.2", targets: {
        "win32-x64": ["x64", "aec9b8d5e79c06aade9fd51224570c87687675896d4da335955047c211d40e01"],
        "win32-arm64": ["arm64", "349942b14cd401cc315b9a93bd2ab7f3c1b5f37ce30d8a90d4136875e4e63129"],
        "win32-ia32": ["x86", "0eb5b60295cc7d3a2797848c99554b19c0b8a99f1883c4feb9c8435398bb2183"]
    } }
};
function downloadSpec(name, platform = process.platform, arch = process.arch) {
    if (name === "ffmpeg" && platform === "win32" && arch === "x64") return RELEASES.ffmpeg;
    if (name === "sevenzip" && platform === "win32" && ["x64", "arm64", "ia32"].includes(arch)) return RELEASES.sevenzip;
    if (name === "vips") {
        const pair = RELEASES.vips.targets[`${platform}-${arch}`];
        if (pair) return { version: RELEASES.vips.version, url: `https://github.com/libvips/build-win64-mxe/releases/download/v8.18.2/vips-dev-${pair[0]}-all-8.18.2.zip`, sha256: pair[1] };
    }
    throw Error(`No pinned official ${name} download for ${platform}/${arch}. Select an existing executable or import a ZIP.`);
}
function verify(bytes, expected) {
    if (!/^[a-f0-9]{64}$/.test(expected) || createHash("sha256").update(bytes).digest("hex") !== expected) throw Error("SHA-256 verification failed. Nothing was installed.");
}
function download(url, redirects = 0) {
    if (new URL(url).protocol !== "https:" || redirects > 5) return Promise.reject(Error("Unsafe download redirect."));
    // Node HTTPS also works inside BetterDiscord's renderer, independent of CORS/CSP.
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { "User-Agent": "ClampDown/1.2" } }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume(); clearTimeout(timer); resolve(download(new URL(response.headers.location, url).href, redirects + 1)); return;
            }
            if (response.statusCode !== 200) { response.resume(); clearTimeout(timer); reject(Error(`Download failed: HTTP ${response.statusCode}`)); return; }
            const chunks = []; let size = 0;
            response.on("data", part => { size += part.length; if (size > 512 * 1024 ** 2) request.destroy(Error("Archive exceeds 512 MiB.")); else chunks.push(part); });
            response.on("error", reject);
            response.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
        });
        const timer = setTimeout(() => request.destroy(Error("Download timed out.")), 5 * 60 * 1000);
        request.on("error", e => { clearTimeout(timer); reject(e); });
    });
}
// Read the ZIP central directory before writing anything. No third-party unpacker,
// path traversal, encrypted entries, links, ZIP64, or unbounded inflation.
function zipEntries(bytes) {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
    if (end < 0) throw Error("Not a supported ZIP archive.");
    const count = bytes.readUInt16LE(end + 10);
    let offset = bytes.readUInt32LE(end + 16), total = 0;
    if (count === 65535 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw Error("ZIP64/multipart archives are unsupported.");
    const entries = [], seen = new Set();
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw Error("Invalid ZIP directory.");
        const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), packed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
        const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
        const mode = bytes.readUInt32LE(offset + 38) >>> 16;
        const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
        const local = bytes.readUInt32LE(offset + 42);
        if (!name || /[\\:\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === "." || p === ".." || /[. ]$/.test(p)) || (mode & 0xf000) === 0xa000 || flags & 1 || ![0, 8].includes(method)) throw Error("ZIP contains an unsafe or unsupported entry.");
        const folded = name.toLowerCase(); if (seen.has(folded)) throw Error("ZIP has duplicate paths."); seen.add(folded);
        total += size; if (total > 1024 ** 3 || size > 512 * 1024 ** 2 || count > 10000) throw Error("ZIP expands beyond the installation budget.");
        if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw Error("Invalid ZIP file entry.");
        const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
        if (start + packed > bytes.length) throw Error("Truncated ZIP entry.");
        entries.push({ name, method, size, start, packed });
        offset += 46 + length + extra + comment;
    }
    return entries;
}
async function extractZip(bytes, destination) {
    const entries = zipEntries(bytes);
    for (const e of entries) {
        const target = path.resolve(destination, e.name);
        if (!target.startsWith(path.resolve(destination) + path.sep)) throw Error("Archive path escapes its directory.");
        if (e.name.endsWith("/")) { await fs.mkdir(target, { recursive: true }); continue; }
        const source = bytes.subarray(e.start, e.start + e.packed);
        const data = e.method === 8 ? inflateRawSync(source, { maxOutputLength: Math.max(1, e.size) }) : source;
        if (data.length !== e.size) throw Error("Invalid ZIP entry length.");
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data, { flag: "wx", mode: 0o755 });
    }
}
async function findExecutable(root, name) {
    const matches = [];
    for (const e of await fs.readdir(root, { withFileTypes: true })) {
        if (e.isSymbolicLink()) throw Error("Dependency archives must not contain symbolic links.");
        const file = path.join(root, e.name);
        if (e.isDirectory()) matches.push(...await findExecutable(file, name));
        else if (name === "sevenzip" ? /^(?:7z|7za|7zr)(?:\.exe)?$/i.test(e.name) : e.name === name || e.name === name + ".exe") matches.push(file);
    }
    return matches;
}
async function install(engine, name, options = {}) {
    if (!["ffmpeg", "vips", "sevenzip"].includes(name)) throw Error("Unknown dependency.");
    if (engine.installing) throw Error("A dependency installation is already running.");
    engine.installing = true;
    let folder;
    try {
        await engine.init();
        const spec = options.archive ? null : downloadSpec(name);
        const current = (await engine.paths())[name];
        if (spec && current?.version.includes(spec.version)) {
            try { return await engine.configure(name, current.path); } catch { /* Missing or broken install: repair from the pinned archive. */ }
        }
        const bytes = options.archive ? await fs.readFile(options.archive) : await download(spec.url);
        if (bytes.length > 512 * 1024 ** 2) throw Error("Archive exceeds 512 MiB.");
        if (spec) verify(bytes, spec.sha256);
        const base = path.join(engine.root, "dependencies"); await fs.mkdir(base, { recursive: true });
        folder = await fs.mkdtemp(path.join(base, `${name}-`));
        let candidates;
        if (spec?.executable) {
            const executable = path.join(folder, spec.executable); await fs.writeFile(executable, bytes, { mode: 0o755 }); candidates = [executable];
        } else if (spec?.url.endsWith(".tar.gz")) {
            const archive = path.join(folder, "upstream.tar.gz"); await fs.writeFile(archive, bytes);
            // Only pinned, hash-verified upstream tar archives reach the system tar.
            await run("tar", ["-xzf", archive, "-C", folder], { timeout: 120000 });
            await fs.unlink(archive);
        } else await extractZip(bytes, folder);
        candidates ||= await findExecutable(folder, name);
        if (candidates.length !== 1) throw Error(`Expected exactly one ${name} executable in the archive.`);
        if (process.platform !== "win32") await fs.chmod(candidates[0], 0o755);
        const result = await engine.configure(name, candidates[0]);
        folder = null; // Installed directory remains, including upstream notices and licenses.
        return result;
    } finally {
        engine.installing = false;
        if (folder) await fs.rm(folder, { recursive: true, force: true });
    }
}
module.exports = { RELEASES, downloadSpec, verify, zipEntries, extractZip, install };
