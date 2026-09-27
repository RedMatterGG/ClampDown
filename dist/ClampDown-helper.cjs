var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/policy.cjs
var require_policy = __commonJS({
  "src/policy.cjs"(exports2, module2) {
    "use strict";
    var DEFAULTS = Object.freeze({ enabled: true, archiveFiles: true, videoPreset: "balanced", imagePreset: "balanced", archiveLevel: "5", codec: "h264", hardware: "auto", imageFormat: "webp", maxHeight: 1080, audioKbps: 96, targetMiB: 0, archiveDictionaryMiB: 64, archiveThreads: 0, archivePartPercent: 96, imageBackend: "auto" });
    var PRESETS = Object.freeze({ fast: { cpu: "veryfast", quality: 76, edge: 1920, fps: 30 }, balanced: { cpu: "medium", quality: 84, edge: 2560, fps: 30 }, slow: { cpu: "slow", quality: 90, edge: 3840, fps: 60 } });
    function settings(value = {}) {
      const out = { ...DEFAULTS };
      for (const [key, choices] of Object.entries({ videoPreset: Object.keys(PRESETS), imagePreset: Object.keys(PRESETS), archiveLevel: ["0", "1", "3", "5", "7", "9"], codec: ["h264", "hevc"], hardware: ["auto", "cpu", "nvidia", "intel", "amd"], imageFormat: ["webp", "jpg", "png", "gif", "avif"], imageBackend: ["auto", "vips", "ffmpeg"] })) if (choices.includes(value[key])) out[key] = value[key];
      for (const [key, min, max] of [["maxHeight", 144, 2160], ["audioKbps", 32, 192], ["targetMiB", 0, 500], ["archiveDictionaryMiB", 4, 256], ["archiveThreads", 0, 32], ["archivePartPercent", 80, 98]]) if (Number.isFinite(value[key])) {
        const bounded = Math.min(max, Math.max(min, value[key]));
        out[key] = key === "targetMiB" ? bounded : Math.round(bounded);
      }
      if (typeof value.enabled === "boolean") out.enabled = value.enabled;
      if (typeof value.archiveFiles === "boolean") out.archiveFiles = value.archiveFiles;
      return out;
    }
    function archivePartBytes(limit, config) {
      if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 2 ** 31) throw Error("Discord's upload limit is unavailable. Set a target in Advanced settings and try again.");
      return Math.floor(Math.min(limit, config.targetMiB > 0 ? config.targetMiB * 1048576 : limit) * config.archivePartPercent / 100);
    }
    function targetBytes(limit, config) {
      if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 2 ** 31) throw Error("Discord's upload limit is unavailable. Set a target in Advanced settings and try again.");
      return Math.floor(Math.min(limit, config.targetMiB > 0 ? config.targetMiB * 1048576 : limit) * 0.96);
    }
    function kind(file) {
      const ext = String(file.name).split(".").pop().toLowerCase();
      if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "image";
      if (/^video\//.test(file.type || "") || ["mp4", "mov", "mkv", "webm", "avi", "m4v", "mts", "m2ts"].includes(ext)) return "video";
      return null;
    }
    function bitrate(target, duration, audioKbps) {
      if (!Number.isFinite(duration) || duration <= 0) throw Error("The video has no valid duration.");
      const total = Math.floor(target * 8 / duration * 0.96);
      const audio = Math.min(audioKbps * 1e3, Math.floor(total * 0.2));
      const video = total - audio;
      if (video < 24e3) throw Error("This video is too long for the upload limit. Trim it before attaching.");
      return { audio: Math.max(8e3, audio), video };
    }
    function archiveAttachments(message) {
      const source = message?.attachments?.toArray?.() || message?.attachments || [];
      return Array.from(source).filter((a) => /\.(?:7z|zip)(?:\.\d{3,})?$/i.test(a?.filename || "") && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(a?.url || "")).map((a) => ({ name: a.filename, url: a.url, size: a.size }));
    }
    module2.exports = { DEFAULTS, PRESETS, settings, targetBytes, archivePartBytes, kind, bitrate, archiveAttachments };
  }
});

// src/engine.cjs
var require_engine = __commonJS({
  "src/engine.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs/promises");
    var path2 = require("node:path");
    var { spawn } = require("node:child_process");
    var { randomUUID } = require("node:crypto");
    var { settings, PRESETS, targetBytes, archivePartBytes, kind, bitrate } = require_policy();
    function run(exe, args, { signal, env = {}, onProgress, timeout = 30 * 60 * 1e3 } = {}) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(Error("Cancelled"));
        const child = spawn(exe, args, { windowsHide: true, shell: false, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "", stopped = false;
        const stop = () => {
          stopped = true;
          child.kill();
        };
        const timer = setTimeout(stop, timeout);
        signal?.addEventListener("abort", stop, { once: true });
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", stop);
        };
        child.stdout.on("data", (chunk) => {
          const s = chunk.toString();
          stdout = (stdout + s).slice(-2 * 1024 * 1024);
          onProgress?.(s);
        });
        child.stderr.on("data", (chunk) => {
          stderr = (stderr + chunk).slice(-24e3);
        });
        child.on("error", (error) => {
          cleanup();
          reject(error);
        });
        child.on("close", (code) => {
          cleanup();
          code === 0 && !stopped ? resolve({ stdout, stderr }) : reject(Error(stopped ? "Cancelled or timed out" : `${path2.basename(exe)} failed (${code}): ${stderr.slice(-1800)}`));
        });
      });
    }
    var Engine2 = class {
      constructor(root) {
        this.root = path2.resolve(root);
        this.jobs = /* @__PURE__ */ new Map();
      }
      async init() {
        await fs2.mkdir(this.root, { recursive: true });
      }
      async paths() {
        try {
          return JSON.parse(await fs2.readFile(path2.join(this.root, "dependencies.json"), "utf8"));
        } catch {
          return {};
        }
      }
      async configure(name, executable) {
        if (!["ffmpeg", "vips", "sevenzip"].includes(name) || !path2.isAbsolute(executable)) throw Error("Select an absolute executable path.");
        const result = await run(executable, [name === "ffmpeg" ? "-version" : name === "sevenzip" ? "i" : "--version"], { timeout: 15e3 });
        if (!result.stdout.toLowerCase().includes(name === "sevenzip" ? "7-zip" : name)) throw Error(`This is not a working ${name === "sevenzip" ? "7-Zip" : name} executable.`);
        const entry = { path: executable, version: result.stdout.split(/\r?\n/).find(Boolean) || path2.basename(executable) };
        if (name === "vips") {
          await this.init();
          const probeDir = await fs2.mkdtemp(path2.join(this.root, "probe-"));
          try {
            const input = path2.join(probeDir, "pixel.png");
            await fs2.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
            entry.formats = [];
            for (const format of ["jpg", "png", "webp", "avif"]) {
              try {
                await run(executable, ["thumbnail", input, path2.join(probeDir, "pixel." + format), "1", "--height", "1", "--size", "down"], { timeout: 2e4 });
                entry.formats.push(format);
              } catch {
              }
            }
            if (!entry.formats.length) throw Error("libvips starts, but its image encoders failed the setup check.");
          } finally {
            await fs2.rm(probeDir, { recursive: true, force: true });
          }
        }
        if (name === "ffmpeg") {
          const probe = path2.join(path2.dirname(executable), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
          try {
            await run(probe, ["-version"], { timeout: 15e3 });
          } catch {
            throw Error("FFprobe must be next to FFmpeg. Import the complete FFmpeg ZIP, or select ffmpeg from its bin folder.");
          }
          entry.license = (await run(executable, ["-L"], { timeout: 15e3 })).stdout;
          const build = await run(executable, ["-buildconf"], { timeout: 15e3 });
          entry.build = build.stdout + build.stderr;
        }
        const existing = await this.paths();
        existing[name] = entry;
        await this.init();
        const temp = path2.join(this.root, `config-${randomUUID()}.tmp`);
        await fs2.writeFile(temp, JSON.stringify(existing, null, 2));
        await fs2.rename(temp, path2.join(this.root, "dependencies.json"));
        return entry;
      }
      async status() {
        return { dependencies: await this.paths(), jobs: [...this.jobs].map(([id, j]) => ({ id, ...j.status })), platform: process.platform, arch: process.arch };
      }
      cancel(id) {
        this.jobs.get(id)?.controller.abort();
      }
      cancelAll() {
        for (const job of this.jobs.values()) job.controller.abort();
      }
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
          dir = await fs2.mkdtemp(path2.join(this.root, "job-"));
          const input = path2.join(dir, "input" + (/\.[a-z0-9]{1,8}$/i.exec(String(name))?.[0] || ".bin"));
          const deps = await this.paths();
          await fs2.writeFile(input, bytes);
          let output;
          if (media === "video") output = await this.video(input, dir, target, config, deps, job, options);
          else output = await this.image(input, dir, target, config, deps, job, options);
          if (controller.signal.aborted) throw Error("Cancelled");
          const data = await fs2.readFile(output);
          if (!data.length || data.length > target) throw Error("Could not reach the upload limit. Try a smaller resolution or another format.");
          const extension = path2.extname(output);
          const safeName = path2.basename(String(name).replaceAll("\\", "/")).replace(/\.[^.]*$/, "");
          return { bytes: new Uint8Array(data), name: safeName + extension, type: extension === ".mp4" ? "video/mp4" : `image/${extension === ".jpg" ? "jpeg" : extension.slice(1)}`, originalBytes: bytes.length, outputBytes: data.length, backend: job.status.backend };
        } finally {
          this.jobs.delete(id);
          if (dir) await fs2.rm(dir, { recursive: true, force: true });
        }
      }
      async archive(request) {
        if (this.jobs.size) throw Error("A compression job is already running. Please wait for it to finish.");
        const { bytes, name, limit } = request;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 ** 3 || bytes.byteLength === 0) throw Error("Select a nonempty file smaller than 1 GiB.");
        const config = settings(request.settings), partBytes = archivePartBytes(limit, config);
        const deps = await this.paths(), sevenzip = deps.sevenzip?.path;
        if (!sevenzip) throw Error("Set up 7-Zip in ClampDown \u2192 Dependencies first.");
        const id = randomUUID(), controller = new AbortController();
        const job = { controller, status: { name, phase: "Creating multipart 7z archive", backend: "7-Zip", progress: 0, originalBytes: bytes.byteLength } };
        this.jobs.set(id, job);
        let dir;
        try {
          await this.init();
          dir = await fs2.mkdtemp(path2.join(this.root, "job-"));
          const safeName = path2.basename(String(name).replaceAll("\\", "/")).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 140) || "attachment";
          const input = path2.join(dir, safeName), archive = path2.join(dir, safeName + ".7z");
          await fs2.writeFile(input, bytes);
          const threads = config.archiveThreads || "on";
          await run(sevenzip, ["a", archive, input, "-t7z", `-mx=${config.archiveLevel}`, "-m0=lzma2", `-md=${config.archiveDictionaryMiB}m`, `-mmt=${threads}`, "-ms=on", `-v${partBytes}b`, "-y", "-bb0"], { signal: controller.signal, timeout: 30 * 60 * 1e3 });
          const prefix = safeName + ".7z.";
          const names = (await fs2.readdir(dir)).filter((file) => file.startsWith(prefix) && /^\d{3,}$/.test(file.slice(prefix.length))).sort();
          if (!names.length || names.length > 999) throw Error("The archive produced an unsupported number of parts.");
          const parts = [];
          for (const part of names) {
            const data = await fs2.readFile(path2.join(dir, part));
            if (!data.length || data.length > partBytes) throw Error("7-Zip produced an invalid archive part.");
            parts.push({ bytes: new Uint8Array(data), name: part, type: "application/x-7z-compressed" });
          }
          return { parts, baseName: safeName + ".7z", originalBytes: bytes.length, outputBytes: parts.reduce((sum, part) => sum + part.bytes.length, 0), backend: "7-Zip" };
        } finally {
          this.jobs.delete(id);
          if (dir) await fs2.rm(dir, { recursive: true, force: true });
        }
      }
      async probe(ffmpeg, input, options) {
        const probe = path2.join(path2.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
        const { stdout } = await run(probe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", input], options);
        return JSON.parse(stdout);
      }
      async video(input, dir, target, config, deps, job, options) {
        const ffmpeg = deps.ffmpeg?.path;
        if (!ffmpeg) throw Error("Set up FFmpeg in ClampDown \u2192 Dependencies first.");
        const info = await this.probe(ffmpeg, input, options);
        const stream = info.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
        if (!stream) throw Error("No video stream found.");
        const duration = Number(info.format.duration || stream.duration);
        const hasAudio = info.streams.some((s) => s.codec_type === "audio");
        const budget = bitrate(target, duration, hasAudio ? config.audioKbps : 0);
        const prefix = config.codec === "hevc" ? "hevc" : "h264";
        const cpu = config.codec === "hevc" ? "libx265" : "libx264";
        const listing = (await run(ffmpeg, ["-hide_banner", "-encoders"], options)).stdout;
        const hardware = { nvidia: prefix + "_nvenc", intel: prefix + "_qsv", amd: prefix + "_amf" };
        const candidates = config.hardware === "auto" ? Object.values(hardware).filter((e) => listing.includes(e)) : config.hardware === "cpu" ? [] : [hardware[config.hardware]];
        candidates.push(cpu);
        let lastError;
        const preset = PRESETS[config.videoPreset];
        for (const encoder of candidates) {
          for (let attempt = 0; attempt < 3; attempt++) {
            if (options.signal.aborted) throw Error("Cancelled");
            const rate = Math.floor(budget.video * 0.78 ** attempt);
            const edge = Math.min(config.maxHeight, rate < 3e5 ? 480 : rate < 7e5 ? 720 : 2160);
            const out = path2.join(dir, "compressed.mp4");
            job.status = { ...job.status, backend: encoder, phase: `Encoding video${attempt ? ` \xB7 fitting pass ${attempt + 1}` : ""}`, progress: 0 };
            const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", `0:${stream.index}`, "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-vf", `scale=w='min(${edge * 2},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`, "-r", String(preset.fps), "-c:v", encoder, "-b:v", String(rate), "-maxrate", String(rate), "-bufsize", String(rate * 2), "-pix_fmt", "yuv420p"];
            if (encoder === cpu) args.push("-preset", preset.cpu);
            if (encoder.endsWith("_nvenc")) args.push("-preset", { fast: "p2", balanced: "p4", slow: "p6" }[config.videoPreset]);
            if (encoder.endsWith("_amf")) args.push("-quality", { fast: "speed", balanced: "balanced", slow: "quality" }[config.videoPreset]);
            if (config.codec === "hevc") args.push("-tag:v", "hvc1");
            args.push("-c:a", "aac", "-b:a", String(budget.audio), "-ac", "2", "-movflags", "+faststart", "-progress", "pipe:1", out);
            try {
              await run(ffmpeg, args, { ...options, onProgress: (text) => {
                const m = /out_time_us=(\d+)/.exec(text);
                if (m) job.status.progress = Math.min(99, Number(m[1]) / duration / 1e4);
              } });
              if ((await fs2.stat(out)).size <= target) return out;
            } catch (error) {
              lastError = error;
              if (options.signal.aborted) throw error;
              break;
            }
          }
        }
        throw lastError || Error("Video remains too large after fitting passes.");
      }
      async image(input, dir, target, config, deps, job, options) {
        const preset = PRESETS[config.imagePreset];
        const animated = /\.(gif|webp|avif|png)$/i.test(input) && await isAnimated(await fs2.readFile(input));
        const useVips = config.imageBackend !== "ffmpeg" && deps.vips && !animated && config.imageFormat !== "gif" && deps.vips.formats?.includes(config.imageFormat);
        if (config.imageBackend === "vips" && !useVips) throw Error("libvips is unavailable for this operation. Set up libvips, or choose Automatic to preserve animation with FFmpeg.");
        if (!useVips && !deps.ffmpeg) throw Error("Set up libvips or FFmpeg in ClampDown \u2192 Dependencies first.");
        let format = animated && !["gif", "webp"].includes(config.imageFormat) ? "gif" : config.imageFormat;
        if (animated && /\.webp$/i.test(input)) throw Error("Animated WebP is preserved unchanged. This build cannot resize it without losing frames; use a GIF or video source.");
        const output = path2.join(dir, "compressed." + format);
        let edge = preset.edge;
        for (let attempt = 0; attempt < 12; attempt++) {
          const quality = Math.max(30, preset.quality - attempt * 7);
          job.status = { ...job.status, backend: useVips ? "libvips" : "FFmpeg", phase: `Fitting image \xB7 pass ${attempt + 1}`, progress: attempt / 12 * 100 };
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
            args.push(output);
            await run(deps.ffmpeg.path, args, options);
          }
          const size = (await fs2.stat(output)).size;
          if (size <= target) return output;
          edge = Math.max(64, Math.floor(edge * Math.min(0.85, Math.sqrt(target / size) * 0.92)));
        }
        throw Error("Image is still over the limit. Try WebP or a larger target.");
      }
    };
    async function isAnimated(bytes) {
      if (bytes.subarray(0, 3).toString() === "GIF") return true;
      if (bytes.subarray(0, 4).toString() === "RIFF") return bytes.includes(Buffer.from("ANIM"));
      if (bytes[0] === 137 && bytes.subarray(1, 4).toString() === "PNG") return bytes.includes(Buffer.from("acTL"));
      return bytes.includes(Buffer.from("avis"));
    }
    module2.exports = { Engine: Engine2, run, isAnimated };
  }
});

// src/dependencies.cjs
var require_dependencies = __commonJS({
  "src/dependencies.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs/promises");
    var path2 = require("node:path");
    var { createHash } = require("node:crypto");
    var { inflateRawSync } = require("node:zlib");
    var https = require("node:https");
    var { run } = require_engine();
    var RELEASES = {
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
      return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { "User-Agent": "ClampDown/1.2" } }, (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
            response.resume();
            clearTimeout(timer);
            resolve(download(new URL(response.headers.location, url).href, redirects + 1));
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            clearTimeout(timer);
            reject(Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }
          const chunks = [];
          let size = 0;
          response.on("data", (part) => {
            size += part.length;
            if (size > 512 * 1024 ** 2) request.destroy(Error("Archive exceeds 512 MiB."));
            else chunks.push(part);
          });
          response.on("error", reject);
          response.on("end", () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks));
          });
        });
        const timer = setTimeout(() => request.destroy(Error("Download timed out.")), 5 * 60 * 1e3);
        request.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    }
    function zipEntries(bytes) {
      let end = -1;
      for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 101010256 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
        end = i;
        break;
      }
      if (end < 0) throw Error("Not a supported ZIP archive.");
      const count = bytes.readUInt16LE(end + 10);
      let offset = bytes.readUInt32LE(end + 16), total = 0;
      if (count === 65535 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw Error("ZIP64/multipart archives are unsupported.");
      const entries = [], seen = /* @__PURE__ */ new Set();
      for (let i = 0; i < count; i++) {
        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 33639248) throw Error("Invalid ZIP directory.");
        const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), packed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
        const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
        const mode = bytes.readUInt32LE(offset + 38) >>> 16;
        const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
        const local = bytes.readUInt32LE(offset + 42);
        if (!name || /[\\:\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some((p) => p === "." || p === ".." || /[. ]$/.test(p)) || (mode & 61440) === 40960 || flags & 1 || ![0, 8].includes(method)) throw Error("ZIP contains an unsafe or unsupported entry.");
        const folded = name.toLowerCase();
        if (seen.has(folded)) throw Error("ZIP has duplicate paths.");
        seen.add(folded);
        total += size;
        if (total > 1024 ** 3 || size > 512 * 1024 ** 2 || count > 1e4) throw Error("ZIP expands beyond the installation budget.");
        if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 67324752) throw Error("Invalid ZIP file entry.");
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
        const target = path2.resolve(destination, e.name);
        if (!target.startsWith(path2.resolve(destination) + path2.sep)) throw Error("Archive path escapes its directory.");
        if (e.name.endsWith("/")) {
          await fs2.mkdir(target, { recursive: true });
          continue;
        }
        const source = bytes.subarray(e.start, e.start + e.packed);
        const data = e.method === 8 ? inflateRawSync(source, { maxOutputLength: Math.max(1, e.size) }) : source;
        if (data.length !== e.size) throw Error("Invalid ZIP entry length.");
        await fs2.mkdir(path2.dirname(target), { recursive: true });
        await fs2.writeFile(target, data, { flag: "wx", mode: 493 });
      }
    }
    async function findExecutable(root, name) {
      const matches = [];
      for (const e of await fs2.readdir(root, { withFileTypes: true })) {
        if (e.isSymbolicLink()) throw Error("Dependency archives must not contain symbolic links.");
        const file = path2.join(root, e.name);
        if (e.isDirectory()) matches.push(...await findExecutable(file, name));
        else if (name === "sevenzip" ? /^(?:7z|7za|7zr)(?:\.exe)?$/i.test(e.name) : e.name === name || e.name === name + ".exe") matches.push(file);
      }
      return matches;
    }
    async function install2(engine, name, options = {}) {
      if (!["ffmpeg", "vips", "sevenzip"].includes(name)) throw Error("Unknown dependency.");
      if (engine.installing) throw Error("A dependency installation is already running.");
      engine.installing = true;
      let folder;
      try {
        await engine.init();
        const spec = options.archive ? null : downloadSpec(name);
        const current = (await engine.paths())[name];
        if (spec && current?.version.includes(spec.version)) {
          try {
            return await engine.configure(name, current.path);
          } catch {
          }
        }
        const bytes = options.archive ? await fs2.readFile(options.archive) : await download(spec.url);
        if (bytes.length > 512 * 1024 ** 2) throw Error("Archive exceeds 512 MiB.");
        if (spec) verify(bytes, spec.sha256);
        const base = path2.join(engine.root, "dependencies");
        await fs2.mkdir(base, { recursive: true });
        folder = await fs2.mkdtemp(path2.join(base, `${name}-`));
        let candidates;
        if (spec?.executable) {
          const executable = path2.join(folder, spec.executable);
          await fs2.writeFile(executable, bytes, { mode: 493 });
          candidates = [executable];
        } else if (spec?.url.endsWith(".tar.gz")) {
          const archive = path2.join(folder, "upstream.tar.gz");
          await fs2.writeFile(archive, bytes);
          await run("tar", ["-xzf", archive, "-C", folder], { timeout: 12e4 });
          await fs2.unlink(archive);
        } else await extractZip(bytes, folder);
        candidates ||= await findExecutable(folder, name);
        if (candidates.length !== 1) throw Error(`Expected exactly one ${name} executable in the archive.`);
        if (process.platform !== "win32") await fs2.chmod(candidates[0], 493);
        const result = await engine.configure(name, candidates[0]);
        folder = null;
        return result;
      } finally {
        engine.installing = false;
        if (folder) await fs2.rm(folder, { recursive: true, force: true });
      }
    }
    module2.exports = { RELEASES, downloadSpec, verify, zipEntries, extractZip, install: install2 };
  }
});

// src/helper.cjs
var http = require("node:http");
var fs = require("node:fs/promises");
var path = require("node:path");
var { randomBytes, timingSafeEqual } = require("node:crypto");
var { Engine } = require_engine();
var { install } = require_dependencies();
async function startHelper(root) {
  const engine = new Engine(root);
  await engine.init();
  const token = randomBytes(32).toString("hex");
  const runtimeFile = path.join(engine.root, "helper-runtime.json");
  let lastRequest = Date.now();
  const json = (res, value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected) || req.headers.origin) {
      json(res, { error: "Unauthorized" }, 403);
      req.resume();
      return;
    }
    lastRequest = Date.now();
    try {
      if (req.method === "GET" && req.url === "/status") {
        json(res, { ...await engine.status(), helper: "running", node: process.version });
        return;
      }
      if (req.method !== "POST") {
        json(res, { error: "Not found" }, 404);
        return;
      }
      const chunks = [];
      let total = 0;
      const max = ["/compress", "/archive"].includes(req.url) ? 1024 ** 3 : 16384;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > max) throw Error("Request too large");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (["/compress", "/archive"].includes(req.url)) {
        const metadata = JSON.parse(decodeURIComponent(req.headers["x-clampdown-meta"] || ""));
        const result2 = await engine[req.url === "/archive" ? "archive" : "compress"]({ ...metadata, bytes: new Uint8Array(body) });
        const chunks2 = result2.parts?.map((part) => Buffer.from(part.bytes)) || [Buffer.from(result2.bytes)];
        const info = result2.parts ? { baseName: result2.baseName, backend: result2.backend, originalBytes: result2.originalBytes, outputBytes: result2.outputBytes, sizes: result2.parts.map((part) => part.bytes.length) } : (({ bytes, ...rest }) => rest)(result2);
        res.writeHead(200, { "Content-Type": "application/octet-stream", "X-ClampDown-Meta": encodeURIComponent(JSON.stringify(info)), "Cache-Control": "no-store" });
        res.end(Buffer.concat(chunks2));
        return;
      }
      const args = JSON.parse(body.toString() || "{}");
      let result;
      switch (req.url) {
        case "/install":
          result = await install(engine, args.name);
          break;
        case "/configure":
          result = await engine.configure(args.name, args.path);
          break;
        case "/import":
          result = await install(engine, args.name, { archive: args.path });
          break;
        case "/cancel":
          engine.cancel(args.id);
          break;
        case "/cancelAll":
          engine.cancelAll();
          break;
        case "/shutdown":
          engine.cancelAll();
          setTimeout(() => close(), 100).unref();
          break;
        default:
          json(res, { error: "Not found" }, 404);
          return;
      }
      json(res, result || { ok: true });
    } catch (e) {
      if (!res.headersSent && !res.destroyed) json(res, { error: e.message }, 400);
    }
  });
  server.requestTimeout = 35 * 60 * 1e3;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const connection = { port: server.address().port, token, version: "1.2.3", pid: process.pid };
  await fs.writeFile(runtimeFile, JSON.stringify(connection), { mode: 384 });
  const timer = setInterval(() => {
    if (Date.now() - lastRequest > 10 * 60 * 1e3 && !engine.jobs.size && !engine.installing) close();
  }, 3e4);
  timer.unref();
  async function close() {
    clearInterval(timer);
    engine.cancelAll();
    server.close();
    server.closeAllConnections();
    try {
      const current = JSON.parse(await fs.readFile(runtimeFile, "utf8"));
      if (current.token === token) await fs.unlink(runtimeFile);
    } catch {
    }
  }
  return { connection, engine, close };
}
if (require.main === module) {
  startHelper(process.argv[2] || __dirname).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
module.exports = { startHelper };
