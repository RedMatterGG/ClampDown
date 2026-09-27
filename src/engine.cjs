// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { settings, PRESETS, targetBytes, archivePartBytes, kind, bitrate } = require("./policy.cjs");

function run(exe, args, { signal, env = {}, onProgress, timeout = 30 * 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(Error("Cancelled"));
        const child = spawn(exe, args, { windowsHide: true, shell: false, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "", stopped = false;
        const stop = () => { stopped = true; child.kill(); };
        const timer = setTimeout(stop, timeout);
        signal?.addEventListener("abort", stop, { once: true });
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); };
        child.stdout.on("data", chunk => { const s = chunk.toString(); stdout = (stdout + s).slice(-2 * 1024 * 1024); onProgress?.(s); });
        child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-24000); });
        child.on("error", error => { cleanup(); reject(error); });
        child.on("close", code => { cleanup(); code === 0 && !stopped ? resolve({ stdout, stderr }) : reject(Error(stopped ? "Cancelled or timed out" : `${path.basename(exe)} failed (${code}): ${stderr.slice(-1800)}`)); });
    });
}

class Engine {
    constructor(root) { this.root = path.resolve(root); this.jobs = new Map(); }
    async init() { await fs.mkdir(this.root, { recursive: true }); }
    async paths() { try { return JSON.parse(await fs.readFile(path.join(this.root, "dependencies.json"), "utf8")); } catch { return {}; } }
    async configure(name, executable) {
        if (!["ffmpeg", "vips", "sevenzip"].includes(name) || !path.isAbsolute(executable)) throw Error("Select an absolute executable path.");
        const result = await run(executable, [name === "ffmpeg" ? "-version" : name === "sevenzip" ? "i" : "--version"], { timeout: 15000 });
        if (!result.stdout.toLowerCase().includes(name === "sevenzip" ? "7-zip" : name)) throw Error(`This is not a working ${name === "sevenzip" ? "7-Zip" : name} executable.`);
        const entry = { path: executable, version: result.stdout.split(/\r?\n/).find(Boolean) || path.basename(executable) };
        if (name === "vips") {
            await this.init();
            const probeDir = await fs.mkdtemp(path.join(this.root, "probe-"));
            try {
                const input = path.join(probeDir, "pixel.png");
                await fs.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
                entry.formats = [];
                for (const format of ["jpg", "png", "webp", "avif"]) {
                    try { await run(executable, ["thumbnail", input, path.join(probeDir, "pixel." + format), "1", "--height", "1", "--size", "down"], { timeout: 20000 }); entry.formats.push(format); } catch { /* Optional codec absent from this build. */ }
                }
                if (!entry.formats.length) throw Error("libvips starts, but its image encoders failed the setup check.");
            } finally { await fs.rm(probeDir, { recursive: true, force: true }); }
        }
        if (name === "ffmpeg") {
            const probe = path.join(path.dirname(executable), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
            try { await run(probe, ["-version"], { timeout: 15000 }); } catch { throw Error("FFprobe must be next to FFmpeg. Import the complete FFmpeg ZIP, or select ffmpeg from its bin folder."); }
            entry.license = (await run(executable, ["-L"], { timeout: 15000 })).stdout;
            const build = await run(executable, ["-buildconf"], { timeout: 15000 });
            entry.build = build.stdout + build.stderr;
        }
        const existing = await this.paths(); existing[name] = entry;
        await this.init();
        const temp = path.join(this.root, `config-${randomUUID()}.tmp`);
        await fs.writeFile(temp, JSON.stringify(existing, null, 2));
        await fs.rename(temp, path.join(this.root, "dependencies.json"));
        return entry;
    }
    async status() { return { dependencies: await this.paths(), jobs: [...this.jobs].map(([id, j]) => ({ id, ...j.status })), platform: process.platform, arch: process.arch }; }
    cancel(id) { this.jobs.get(id)?.controller.abort(); }
    cancelAll() { for (const job of this.jobs.values()) job.controller.abort(); }
    async compress(request) {
        if (this.jobs.size) throw Error("A compression job is already running. Please wait for it to finish.");
        const { bytes, name, limit } = request;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 ** 3 || bytes.byteLength === 0) throw Error("Select a nonempty media file smaller than 1 GiB.");
        const config = settings(request.settings);
        const media = kind({ name, type: request.type });
        if (!media) throw Error("This file type cannot be compressed by ClampDown.");
        const target = targetBytes(limit, config);
        const id = randomUUID(), controller = new AbortController();
        const job = { controller, status: { name, phase: "Reading media", progress: 0, originalBytes: bytes.byteLength } };
        this.jobs.set(id, job);
        const options = { signal: controller.signal };
        let dir;
        try {
            await this.init();
            dir = await fs.mkdtemp(path.join(this.root, "job-"));
            const input = path.join(dir, "input" + (/\.[a-z0-9]{1,8}$/i.exec(String(name))?.[0] || ".bin"));
            const deps = await this.paths();
            await fs.writeFile(input, bytes);
            let output;
            if (media === "video") output = await this.video(input, dir, target, config, deps, job, options);
            else output = await this.image(input, dir, target, config, deps, job, options);
            if (controller.signal.aborted) throw Error("Cancelled");
            const data = await fs.readFile(output);
            if (!data.length || data.length > target) throw Error("Could not reach the upload limit. Try a smaller resolution or another format.");
            const extension = path.extname(output);
            const safeName = path.basename(String(name).replaceAll("\\", "/")).replace(/\.[^.]*$/, "");
            return { bytes: new Uint8Array(data), name: safeName + extension, type: extension === ".mp4" ? "video/mp4" : `image/${extension === ".jpg" ? "jpeg" : extension.slice(1)}`, originalBytes: bytes.length, outputBytes: data.length, backend: job.status.backend };
        } finally { this.jobs.delete(id); if (dir) await fs.rm(dir, { recursive: true, force: true }); }
    }
    async archive(request) {
        if (this.jobs.size) throw Error("A compression job is already running. Please wait for it to finish.");
        const { bytes, name, limit } = request;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 ** 3 || bytes.byteLength === 0) throw Error("Select a nonempty file smaller than 1 GiB.");
        const config = settings(request.settings), partBytes = archivePartBytes(limit, config);
        const deps = await this.paths(), sevenzip = deps.sevenzip?.path;
        if (!sevenzip) throw Error("Set up 7-Zip in ClampDown → Dependencies first.");
        const id = randomUUID(), controller = new AbortController();
        const job = { controller, status: { name, phase: "Creating multipart 7z archive", backend: "7-Zip", progress: 0, originalBytes: bytes.byteLength } };
        this.jobs.set(id, job);
        let dir;
        try {
            await this.init(); dir = await fs.mkdtemp(path.join(this.root, "job-"));
            const safeName = path.basename(String(name).replaceAll("\\", "/")).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 140) || "attachment";
            const input = path.join(dir, safeName), archive = path.join(dir, safeName + ".7z");
            await fs.writeFile(input, bytes);
            const threads = config.archiveThreads || "on";
            await run(sevenzip, ["a", archive, input, "-t7z", `-mx=${config.archiveLevel}`, "-m0=lzma2", `-md=${config.archiveDictionaryMiB}m`, `-mmt=${threads}`, "-ms=on", `-v${partBytes}b`, "-y", "-bb0"], { signal: controller.signal, timeout: 30 * 60 * 1000 });
            const prefix = safeName + ".7z.";
            const names = (await fs.readdir(dir)).filter(file => file.startsWith(prefix) && /^\d{3,}$/.test(file.slice(prefix.length))).sort();
            if (!names.length || names.length > 999) throw Error("The archive produced an unsupported number of parts.");
            const parts = [];
            for (const part of names) {
                const data = await fs.readFile(path.join(dir, part));
                if (!data.length || data.length > partBytes) throw Error("7-Zip produced an invalid archive part.");
                parts.push({ bytes: new Uint8Array(data), name: part, type: "application/x-7z-compressed" });
            }
            return { parts, baseName: safeName + ".7z", originalBytes: bytes.length, outputBytes: parts.reduce((sum, part) => sum + part.bytes.length, 0), backend: "7-Zip" };
        } finally { this.jobs.delete(id); if (dir) await fs.rm(dir, { recursive: true, force: true }); }
    }
    async probe(ffmpeg, input, options) {
        const probe = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
        const { stdout } = await run(probe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", input], options);
        return JSON.parse(stdout);
    }
    async video(input, dir, target, config, deps, job, options) {
        const ffmpeg = deps.ffmpeg?.path;
        if (!ffmpeg) throw Error("Set up FFmpeg in ClampDown → Dependencies first.");
        const info = await this.probe(ffmpeg, input, options);
        const stream = info.streams.find(s => s.codec_type === "video" && !s.disposition?.attached_pic);
        if (!stream) throw Error("No video stream found.");
        const duration = Number(info.format.duration || stream.duration);
        const hasAudio = info.streams.some(s => s.codec_type === "audio");
        const budget = bitrate(target, duration, hasAudio ? config.audioKbps : 0);
        const prefix = config.codec === "hevc" ? "hevc" : "h264";
        const cpu = config.codec === "hevc" ? "libx265" : "libx264";
        const listing = (await run(ffmpeg, ["-hide_banner", "-encoders"], options)).stdout;
        const hardware = { nvidia: prefix + "_nvenc", intel: prefix + "_qsv", amd: prefix + "_amf" };
        const candidates = config.hardware === "auto" ? Object.values(hardware).filter(e => listing.includes(e)) : config.hardware === "cpu" ? [] : [hardware[config.hardware]];
        candidates.push(cpu);
        let lastError;
        const preset = PRESETS[config.videoPreset];
        for (const encoder of candidates) {
            for (let attempt = 0; attempt < 3; attempt++) {
                if (options.signal.aborted) throw Error("Cancelled");
                const rate = Math.floor(budget.video * 0.78 ** attempt);
                const edge = Math.min(config.maxHeight, rate < 300000 ? 480 : rate < 700000 ? 720 : 2160);
                const out = path.join(dir, "compressed.mp4");
                job.status = { ...job.status, backend: encoder, phase: `Encoding video${attempt ? ` · fitting pass ${attempt + 1}` : ""}`, progress: 0 };
                const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", `0:${stream.index}`, "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-vf", `scale=w='min(${edge * 2},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`, "-r", String(preset.fps), "-c:v", encoder, "-b:v", String(rate), "-maxrate", String(rate), "-bufsize", String(rate * 2), "-pix_fmt", "yuv420p"];
                if (encoder === cpu) args.push("-preset", preset.cpu);
                if (encoder.endsWith("_nvenc")) args.push("-preset", { fast: "p2", balanced: "p4", slow: "p6" }[config.videoPreset]);
                if (encoder.endsWith("_amf")) args.push("-quality", { fast: "speed", balanced: "balanced", slow: "quality" }[config.videoPreset]);
                if (config.codec === "hevc") args.push("-tag:v", "hvc1");
                args.push("-c:a", "aac", "-b:a", String(budget.audio), "-ac", "2", "-movflags", "+faststart", "-progress", "pipe:1", out);
                try {
                    await run(ffmpeg, args, { ...options, onProgress: text => { const m = /out_time_us=(\d+)/.exec(text); if (m) job.status.progress = Math.min(99, Number(m[1]) / duration / 10000); } });
                    if ((await fs.stat(out)).size <= target) return out;
                } catch (error) { lastError = error; if (options.signal.aborted) throw error; break; }
            }
        }
        throw lastError || Error("Video remains too large after fitting passes.");
    }
    async image(input, dir, target, config, deps, job, options) {
        const preset = PRESETS[config.imagePreset];
        // Animated inputs stay on FFmpeg; libvips is used for still images only.
        const animated = /\.(gif|webp|avif|png)$/i.test(input) && await isAnimated(await fs.readFile(input));
        const useVips = config.imageBackend !== "ffmpeg" && deps.vips && !animated && config.imageFormat !== "gif" && deps.vips.formats?.includes(config.imageFormat);
        if (config.imageBackend === "vips" && !useVips) throw Error("libvips is unavailable for this operation. Set up libvips, or choose Automatic to preserve animation with FFmpeg.");
        if (!useVips && !deps.ffmpeg) throw Error("Set up libvips or FFmpeg in ClampDown → Dependencies first.");
        let format = animated && !["gif", "webp"].includes(config.imageFormat) ? "gif" : config.imageFormat;
        // FFmpeg cannot decode animated WebP reliably. Refuse instead of silently flattening it.
        if (animated && /\.webp$/i.test(input)) throw Error("Animated WebP is preserved unchanged. This build cannot resize it without losing frames; use a GIF or video source.");
        const output = path.join(dir, "compressed." + format);
        let edge = preset.edge;
        for (let attempt = 0; attempt < 12; attempt++) {
            const quality = Math.max(30, preset.quality - attempt * 7);
            job.status = { ...job.status, backend: useVips ? "libvips" : "FFmpeg", phase: `Fitting image · pass ${attempt + 1}`, progress: attempt / 12 * 100 };
            if (useVips) {
                await run(deps.vips.path, ["thumbnail", input, `${output}[Q=${quality},strip]`, String(edge), "--height", String(edge), "--size", "down"], options);
            } else {
                const scale = `scale=w='min(${edge},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease`;
                const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-an", "-map_metadata", "-1"];
                if (format === "gif") args.push("-filter_complex", `${scale},fps=15,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse`, "-loop", "0");
                else {
                    args.push("-vf", scale);
                    if (!animated) args.push("-frames:v", "1");
                    if (format === "webp") args.push("-c:v", animated ? "libwebp_anim" : "libwebp", "-quality", String(quality), "-loop", "0");
                    if (format === "jpg") args.push("-q:v", String(Math.max(2, Math.round((100 - quality) / 4))));
                    if (format === "avif") args.push("-c:v", "libaom-av1", "-still-picture", "1", "-cpu-used", "6", "-crf", String(Math.round((100 - quality) / 2)));
                }
                args.push(output); await run(deps.ffmpeg.path, args, options);
            }
            const size = (await fs.stat(output)).size;
            if (size <= target) return output;
            edge = Math.max(64, Math.floor(edge * Math.min(0.85, Math.sqrt(target / size) * 0.92)));
        }
        throw Error("Image is still over the limit. Try WebP or a larger target.");
    }
}
async function isAnimated(bytes) {
    if (bytes.subarray(0, 3).toString() === "GIF") return true;
    if (bytes.subarray(0, 4).toString() === "RIFF") return bytes.includes(Buffer.from("ANIM"));
    if (bytes[0] === 137 && bytes.subarray(1, 4).toString() === "PNG") return bytes.includes(Buffer.from("acTL"));
    return bytes.includes(Buffer.from("avis"));
}
module.exports = { Engine, run, isAnimated };
