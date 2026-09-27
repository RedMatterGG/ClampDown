/**
 * @name ClampDown
 * @author RedMatterGG
 * @version 1.2.3
 * @description Locally fit media and multipart 7z archives to Discord's upload limit.
 * @license GPL-3.0-or-later
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/downloads.cjs
var require_downloads = __commonJS({
  "src/downloads.cjs"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var suffix = (name) => String(name).match(/\.(?:7z|zip)(?:\.\d{3,})?$/i)?.[0];
    async function downloadAll(attachments, destination, fetcher = fetch) {
      if (!path.isAbsolute(destination) || !Array.isArray(attachments) || !attachments.length) throw Error("Choose a destination and at least one archive attachment.");
      const folder = path.dirname(destination);
      const names = attachments.map((attachment) => path.basename(String(attachment.name || "archive-part")).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 180) || "archive-part");
      if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw Error("The message contains duplicate archive filenames.");
      const firstSuffix = suffix(names[0]), sourceStem = firstSuffix && names[0].slice(0, -firstSuffix.length);
      const selected = path.basename(destination).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 180) || names[0];
      const selectedSuffix = suffix(selected), selectedStem = selectedSuffix ? selected.slice(0, -selectedSuffix.length) : selected;
      if (firstSuffix && names.every((name) => suffix(name) && name.slice(0, -suffix(name).length).toLowerCase() === sourceStem.toLowerCase())) {
        for (let index = 0; index < names.length; index++) names[index] = `${selectedStem}${suffix(names[index])}`;
      } else names[0] = selected;
      let targets;
      for (let attempt = 0; attempt < 1e3; attempt++) {
        const candidates = names.map((name) => attempt ? name.replace(/^(.*?)(\.(?:7z|zip))(\.\d{3,})?$/i, `$1 (${attempt})$2$3`) : name).map((name) => path.join(folder, name));
        const occupied = candidates.map((target) => fs.existsSync(target));
        if (!occupied.some(Boolean)) {
          targets = candidates;
          break;
        }
      }
      if (!targets) throw Error("Could not find unused archive filenames in that folder.");
      const saved = [];
      for (let index = 0; index < attachments.length; index++) {
        const attachment = attachments[index];
        const url = new URL(attachment.url);
        if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) throw Error("Refusing a non-Discord attachment URL.");
        const filename = path.basename(targets[index]);
        const response = await fetcher(url.href, { timeout: 5 * 60 * 1e3, maxRedirects: 0, redirect: "error" });
        if (!response.ok) throw Error(`Could not download ${filename}: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 1024 ** 3) throw Error(`Invalid attachment size for ${filename}.`);
        await new Promise((resolve, reject) => fs.writeFile(targets[index], bytes, { flag: "wx" }, (error) => error ? reject(error) : resolve()));
        saved.push(targets[index]);
      }
      return saved;
    }
    module2.exports = { downloadAll };
  }
});

// helper-text:helper
var require_helper = __commonJS({
  "helper-text:helper"(exports2, module2) {
    module2.exports = 'var __getOwnPropNames = Object.getOwnPropertyNames;\nvar __commonJS = (cb, mod) => function __require() {\n  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;\n};\n\n// src/policy.cjs\nvar require_policy = __commonJS({\n  "src/policy.cjs"(exports2, module2) {\n    "use strict";\n    var DEFAULTS = Object.freeze({ enabled: true, archiveFiles: true, videoPreset: "balanced", imagePreset: "balanced", archiveLevel: "5", codec: "h264", hardware: "auto", imageFormat: "webp", maxHeight: 1080, audioKbps: 96, targetMiB: 0, archiveDictionaryMiB: 64, archiveThreads: 0, archivePartPercent: 96, imageBackend: "auto" });\n    var PRESETS = Object.freeze({ fast: { cpu: "veryfast", quality: 76, edge: 1920, fps: 30 }, balanced: { cpu: "medium", quality: 84, edge: 2560, fps: 30 }, slow: { cpu: "slow", quality: 90, edge: 3840, fps: 60 } });\n    function settings(value = {}) {\n      const out = { ...DEFAULTS };\n      for (const [key, choices] of Object.entries({ videoPreset: Object.keys(PRESETS), imagePreset: Object.keys(PRESETS), archiveLevel: ["0", "1", "3", "5", "7", "9"], codec: ["h264", "hevc"], hardware: ["auto", "cpu", "nvidia", "intel", "amd"], imageFormat: ["webp", "jpg", "png", "gif", "avif"], imageBackend: ["auto", "vips", "ffmpeg"] })) if (choices.includes(value[key])) out[key] = value[key];\n      for (const [key, min, max] of [["maxHeight", 144, 2160], ["audioKbps", 32, 192], ["targetMiB", 0, 500], ["archiveDictionaryMiB", 4, 256], ["archiveThreads", 0, 32], ["archivePartPercent", 80, 98]]) if (Number.isFinite(value[key])) {\n        const bounded = Math.min(max, Math.max(min, value[key]));\n        out[key] = key === "targetMiB" ? bounded : Math.round(bounded);\n      }\n      if (typeof value.enabled === "boolean") out.enabled = value.enabled;\n      if (typeof value.archiveFiles === "boolean") out.archiveFiles = value.archiveFiles;\n      return out;\n    }\n    function archivePartBytes(limit, config) {\n      if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 2 ** 31) throw Error("Discord\'s upload limit is unavailable. Set a target in Advanced settings and try again.");\n      return Math.floor(Math.min(limit, config.targetMiB > 0 ? config.targetMiB * 1048576 : limit) * config.archivePartPercent / 100);\n    }\n    function targetBytes(limit, config) {\n      if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 2 ** 31) throw Error("Discord\'s upload limit is unavailable. Set a target in Advanced settings and try again.");\n      return Math.floor(Math.min(limit, config.targetMiB > 0 ? config.targetMiB * 1048576 : limit) * 0.96);\n    }\n    function kind(file) {\n      const ext = String(file.name).split(".").pop().toLowerCase();\n      if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "image";\n      if (/^video\\//.test(file.type || "") || ["mp4", "mov", "mkv", "webm", "avi", "m4v", "mts", "m2ts"].includes(ext)) return "video";\n      return null;\n    }\n    function bitrate(target, duration, audioKbps) {\n      if (!Number.isFinite(duration) || duration <= 0) throw Error("The video has no valid duration.");\n      const total = Math.floor(target * 8 / duration * 0.96);\n      const audio = Math.min(audioKbps * 1e3, Math.floor(total * 0.2));\n      const video = total - audio;\n      if (video < 24e3) throw Error("This video is too long for the upload limit. Trim it before attaching.");\n      return { audio: Math.max(8e3, audio), video };\n    }\n    function archiveAttachments(message) {\n      const source = message?.attachments?.toArray?.() || message?.attachments || [];\n      return Array.from(source).filter((a) => /\\.(?:7z|zip)(?:\\.\\d{3,})?$/i.test(a?.filename || "") && /^https:\\/\\/(?:cdn\\.discordapp\\.com|media\\.discordapp\\.net)\\//i.test(a?.url || "")).map((a) => ({ name: a.filename, url: a.url, size: a.size }));\n    }\n    module2.exports = { DEFAULTS, PRESETS, settings, targetBytes, archivePartBytes, kind, bitrate, archiveAttachments };\n  }\n});\n\n// src/engine.cjs\nvar require_engine = __commonJS({\n  "src/engine.cjs"(exports2, module2) {\n    "use strict";\n    var fs2 = require("node:fs/promises");\n    var path2 = require("node:path");\n    var { spawn } = require("node:child_process");\n    var { randomUUID } = require("node:crypto");\n    var { settings, PRESETS, targetBytes, archivePartBytes, kind, bitrate } = require_policy();\n    function run(exe, args, { signal, env = {}, onProgress, timeout = 30 * 60 * 1e3 } = {}) {\n      return new Promise((resolve, reject) => {\n        if (signal?.aborted) return reject(Error("Cancelled"));\n        const child = spawn(exe, args, { windowsHide: true, shell: false, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });\n        let stdout = "", stderr = "", stopped = false;\n        const stop = () => {\n          stopped = true;\n          child.kill();\n        };\n        const timer = setTimeout(stop, timeout);\n        signal?.addEventListener("abort", stop, { once: true });\n        const cleanup = () => {\n          clearTimeout(timer);\n          signal?.removeEventListener("abort", stop);\n        };\n        child.stdout.on("data", (chunk) => {\n          const s = chunk.toString();\n          stdout = (stdout + s).slice(-2 * 1024 * 1024);\n          onProgress?.(s);\n        });\n        child.stderr.on("data", (chunk) => {\n          stderr = (stderr + chunk).slice(-24e3);\n        });\n        child.on("error", (error) => {\n          cleanup();\n          reject(error);\n        });\n        child.on("close", (code) => {\n          cleanup();\n          code === 0 && !stopped ? resolve({ stdout, stderr }) : reject(Error(stopped ? "Cancelled or timed out" : `${path2.basename(exe)} failed (${code}): ${stderr.slice(-1800)}`));\n        });\n      });\n    }\n    var Engine2 = class {\n      constructor(root) {\n        this.root = path2.resolve(root);\n        this.jobs = /* @__PURE__ */ new Map();\n      }\n      async init() {\n        await fs2.mkdir(this.root, { recursive: true });\n      }\n      async paths() {\n        try {\n          return JSON.parse(await fs2.readFile(path2.join(this.root, "dependencies.json"), "utf8"));\n        } catch {\n          return {};\n        }\n      }\n      async configure(name, executable) {\n        if (!["ffmpeg", "vips", "sevenzip"].includes(name) || !path2.isAbsolute(executable)) throw Error("Select an absolute executable path.");\n        const result = await run(executable, [name === "ffmpeg" ? "-version" : name === "sevenzip" ? "i" : "--version"], { timeout: 15e3 });\n        if (!result.stdout.toLowerCase().includes(name === "sevenzip" ? "7-zip" : name)) throw Error(`This is not a working ${name === "sevenzip" ? "7-Zip" : name} executable.`);\n        const entry = { path: executable, version: result.stdout.split(/\\r?\\n/).find(Boolean) || path2.basename(executable) };\n        if (name === "vips") {\n          await this.init();\n          const probeDir = await fs2.mkdtemp(path2.join(this.root, "probe-"));\n          try {\n            const input = path2.join(probeDir, "pixel.png");\n            await fs2.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));\n            entry.formats = [];\n            for (const format of ["jpg", "png", "webp", "avif"]) {\n              try {\n                await run(executable, ["thumbnail", input, path2.join(probeDir, "pixel." + format), "1", "--height", "1", "--size", "down"], { timeout: 2e4 });\n                entry.formats.push(format);\n              } catch {\n              }\n            }\n            if (!entry.formats.length) throw Error("libvips starts, but its image encoders failed the setup check.");\n          } finally {\n            await fs2.rm(probeDir, { recursive: true, force: true });\n          }\n        }\n        if (name === "ffmpeg") {\n          const probe = path2.join(path2.dirname(executable), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");\n          try {\n            await run(probe, ["-version"], { timeout: 15e3 });\n          } catch {\n            throw Error("FFprobe must be next to FFmpeg. Import the complete FFmpeg ZIP, or select ffmpeg from its bin folder.");\n          }\n          entry.license = (await run(executable, ["-L"], { timeout: 15e3 })).stdout;\n          const build = await run(executable, ["-buildconf"], { timeout: 15e3 });\n          entry.build = build.stdout + build.stderr;\n        }\n        const existing = await this.paths();\n        existing[name] = entry;\n        await this.init();\n        const temp = path2.join(this.root, `config-${randomUUID()}.tmp`);\n        await fs2.writeFile(temp, JSON.stringify(existing, null, 2));\n        await fs2.rename(temp, path2.join(this.root, "dependencies.json"));\n        return entry;\n      }\n      async status() {\n        return { dependencies: await this.paths(), jobs: [...this.jobs].map(([id, j]) => ({ id, ...j.status })), platform: process.platform, arch: process.arch };\n      }\n      cancel(id) {\n        this.jobs.get(id)?.controller.abort();\n      }\n      cancelAll() {\n        for (const job of this.jobs.values()) job.controller.abort();\n      }\n      async compress(request) {\n        if (this.jobs.size) throw Error("A compression job is already running. Please wait for it to finish.");\n        const { bytes, name, limit } = request;\n        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 ** 3 || bytes.byteLength === 0) throw Error("Select a nonempty media file smaller than 1 GiB.");\n        const config = settings(request.settings);\n        const media = kind({ name, type: request.type });\n        if (!media) throw Error("This file type cannot be compressed by ClampDown.");\n        const target = targetBytes(limit, config);\n        const id = randomUUID(), controller = new AbortController();\n        const job = { controller, status: { name, phase: "Reading media", progress: 0, originalBytes: bytes.byteLength } };\n        this.jobs.set(id, job);\n        const options = { signal: controller.signal };\n        let dir;\n        try {\n          await this.init();\n          dir = await fs2.mkdtemp(path2.join(this.root, "job-"));\n          const input = path2.join(dir, "input" + (/\\.[a-z0-9]{1,8}$/i.exec(String(name))?.[0] || ".bin"));\n          const deps = await this.paths();\n          await fs2.writeFile(input, bytes);\n          let output;\n          if (media === "video") output = await this.video(input, dir, target, config, deps, job, options);\n          else output = await this.image(input, dir, target, config, deps, job, options);\n          if (controller.signal.aborted) throw Error("Cancelled");\n          const data = await fs2.readFile(output);\n          if (!data.length || data.length > target) throw Error("Could not reach the upload limit. Try a smaller resolution or another format.");\n          const extension = path2.extname(output);\n          const safeName = path2.basename(String(name).replaceAll("\\\\", "/")).replace(/\\.[^.]*$/, "");\n          return { bytes: new Uint8Array(data), name: safeName + extension, type: extension === ".mp4" ? "video/mp4" : `image/${extension === ".jpg" ? "jpeg" : extension.slice(1)}`, originalBytes: bytes.length, outputBytes: data.length, backend: job.status.backend };\n        } finally {\n          this.jobs.delete(id);\n          if (dir) await fs2.rm(dir, { recursive: true, force: true });\n        }\n      }\n      async archive(request) {\n        if (this.jobs.size) throw Error("A compression job is already running. Please wait for it to finish.");\n        const { bytes, name, limit } = request;\n        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 ** 3 || bytes.byteLength === 0) throw Error("Select a nonempty file smaller than 1 GiB.");\n        const config = settings(request.settings), partBytes = archivePartBytes(limit, config);\n        const deps = await this.paths(), sevenzip = deps.sevenzip?.path;\n        if (!sevenzip) throw Error("Set up 7-Zip in ClampDown \\u2192 Dependencies first.");\n        const id = randomUUID(), controller = new AbortController();\n        const job = { controller, status: { name, phase: "Creating multipart 7z archive", backend: "7-Zip", progress: 0, originalBytes: bytes.byteLength } };\n        this.jobs.set(id, job);\n        let dir;\n        try {\n          await this.init();\n          dir = await fs2.mkdtemp(path2.join(this.root, "job-"));\n          const safeName = path2.basename(String(name).replaceAll("\\\\", "/")).replace(/[<>:"|?*\\x00-\\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 140) || "attachment";\n          const input = path2.join(dir, safeName), archive = path2.join(dir, safeName + ".7z");\n          await fs2.writeFile(input, bytes);\n          const threads = config.archiveThreads || "on";\n          await run(sevenzip, ["a", archive, input, "-t7z", `-mx=${config.archiveLevel}`, "-m0=lzma2", `-md=${config.archiveDictionaryMiB}m`, `-mmt=${threads}`, "-ms=on", `-v${partBytes}b`, "-y", "-bb0"], { signal: controller.signal, timeout: 30 * 60 * 1e3 });\n          const prefix = safeName + ".7z.";\n          const names = (await fs2.readdir(dir)).filter((file) => file.startsWith(prefix) && /^\\d{3,}$/.test(file.slice(prefix.length))).sort();\n          if (!names.length || names.length > 999) throw Error("The archive produced an unsupported number of parts.");\n          const parts = [];\n          for (const part of names) {\n            const data = await fs2.readFile(path2.join(dir, part));\n            if (!data.length || data.length > partBytes) throw Error("7-Zip produced an invalid archive part.");\n            parts.push({ bytes: new Uint8Array(data), name: part, type: "application/x-7z-compressed" });\n          }\n          return { parts, baseName: safeName + ".7z", originalBytes: bytes.length, outputBytes: parts.reduce((sum, part) => sum + part.bytes.length, 0), backend: "7-Zip" };\n        } finally {\n          this.jobs.delete(id);\n          if (dir) await fs2.rm(dir, { recursive: true, force: true });\n        }\n      }\n      async probe(ffmpeg, input, options) {\n        const probe = path2.join(path2.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");\n        const { stdout } = await run(probe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", input], options);\n        return JSON.parse(stdout);\n      }\n      async video(input, dir, target, config, deps, job, options) {\n        const ffmpeg = deps.ffmpeg?.path;\n        if (!ffmpeg) throw Error("Set up FFmpeg in ClampDown \\u2192 Dependencies first.");\n        const info = await this.probe(ffmpeg, input, options);\n        const stream = info.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);\n        if (!stream) throw Error("No video stream found.");\n        const duration = Number(info.format.duration || stream.duration);\n        const hasAudio = info.streams.some((s) => s.codec_type === "audio");\n        const budget = bitrate(target, duration, hasAudio ? config.audioKbps : 0);\n        const prefix = config.codec === "hevc" ? "hevc" : "h264";\n        const cpu = config.codec === "hevc" ? "libx265" : "libx264";\n        const listing = (await run(ffmpeg, ["-hide_banner", "-encoders"], options)).stdout;\n        const hardware = { nvidia: prefix + "_nvenc", intel: prefix + "_qsv", amd: prefix + "_amf" };\n        const candidates = config.hardware === "auto" ? Object.values(hardware).filter((e) => listing.includes(e)) : config.hardware === "cpu" ? [] : [hardware[config.hardware]];\n        candidates.push(cpu);\n        let lastError;\n        const preset = PRESETS[config.videoPreset];\n        for (const encoder of candidates) {\n          for (let attempt = 0; attempt < 3; attempt++) {\n            if (options.signal.aborted) throw Error("Cancelled");\n            const rate = Math.floor(budget.video * 0.78 ** attempt);\n            const edge = Math.min(config.maxHeight, rate < 3e5 ? 480 : rate < 7e5 ? 720 : 2160);\n            const out = path2.join(dir, "compressed.mp4");\n            job.status = { ...job.status, backend: encoder, phase: `Encoding video${attempt ? ` \\xB7 fitting pass ${attempt + 1}` : ""}`, progress: 0 };\n            const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", `0:${stream.index}`, "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-vf", `scale=w=\'min(${edge * 2},iw)\':h=\'min(${edge},ih)\':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`, "-r", String(preset.fps), "-c:v", encoder, "-b:v", String(rate), "-maxrate", String(rate), "-bufsize", String(rate * 2), "-pix_fmt", "yuv420p"];\n            if (encoder === cpu) args.push("-preset", preset.cpu);\n            if (encoder.endsWith("_nvenc")) args.push("-preset", { fast: "p2", balanced: "p4", slow: "p6" }[config.videoPreset]);\n            if (encoder.endsWith("_amf")) args.push("-quality", { fast: "speed", balanced: "balanced", slow: "quality" }[config.videoPreset]);\n            if (config.codec === "hevc") args.push("-tag:v", "hvc1");\n            args.push("-c:a", "aac", "-b:a", String(budget.audio), "-ac", "2", "-movflags", "+faststart", "-progress", "pipe:1", out);\n            try {\n              await run(ffmpeg, args, { ...options, onProgress: (text) => {\n                const m = /out_time_us=(\\d+)/.exec(text);\n                if (m) job.status.progress = Math.min(99, Number(m[1]) / duration / 1e4);\n              } });\n              if ((await fs2.stat(out)).size <= target) return out;\n            } catch (error) {\n              lastError = error;\n              if (options.signal.aborted) throw error;\n              break;\n            }\n          }\n        }\n        throw lastError || Error("Video remains too large after fitting passes.");\n      }\n      async image(input, dir, target, config, deps, job, options) {\n        const preset = PRESETS[config.imagePreset];\n        const animated = /\\.(gif|webp|avif|png)$/i.test(input) && await isAnimated(await fs2.readFile(input));\n        const useVips = config.imageBackend !== "ffmpeg" && deps.vips && !animated && config.imageFormat !== "gif" && deps.vips.formats?.includes(config.imageFormat);\n        if (config.imageBackend === "vips" && !useVips) throw Error("libvips is unavailable for this operation. Set up libvips, or choose Automatic to preserve animation with FFmpeg.");\n        if (!useVips && !deps.ffmpeg) throw Error("Set up libvips or FFmpeg in ClampDown \\u2192 Dependencies first.");\n        let format = animated && !["gif", "webp"].includes(config.imageFormat) ? "gif" : config.imageFormat;\n        if (animated && /\\.webp$/i.test(input)) throw Error("Animated WebP is preserved unchanged. This build cannot resize it without losing frames; use a GIF or video source.");\n        const output = path2.join(dir, "compressed." + format);\n        let edge = preset.edge;\n        for (let attempt = 0; attempt < 12; attempt++) {\n          const quality = Math.max(30, preset.quality - attempt * 7);\n          job.status = { ...job.status, backend: useVips ? "libvips" : "FFmpeg", phase: `Fitting image \\xB7 pass ${attempt + 1}`, progress: attempt / 12 * 100 };\n          if (useVips) {\n            await run(deps.vips.path, ["thumbnail", input, `${output}[Q=${quality},strip]`, String(edge), "--height", String(edge), "--size", "down"], options);\n          } else {\n            const scale = `scale=w=\'min(${edge},iw)\':h=\'min(${edge},ih)\':force_original_aspect_ratio=decrease`;\n            const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-an", "-map_metadata", "-1"];\n            if (format === "gif") args.push("-filter_complex", `${scale},fps=15,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse`, "-loop", "0");\n            else {\n              args.push("-vf", scale);\n              if (!animated) args.push("-frames:v", "1");\n              if (format === "webp") args.push("-c:v", animated ? "libwebp_anim" : "libwebp", "-quality", String(quality), "-loop", "0");\n              if (format === "jpg") args.push("-q:v", String(Math.max(2, Math.round((100 - quality) / 4))));\n              if (format === "avif") args.push("-c:v", "libaom-av1", "-still-picture", "1", "-cpu-used", "6", "-crf", String(Math.round((100 - quality) / 2)));\n            }\n            args.push(output);\n            await run(deps.ffmpeg.path, args, options);\n          }\n          const size = (await fs2.stat(output)).size;\n          if (size <= target) return output;\n          edge = Math.max(64, Math.floor(edge * Math.min(0.85, Math.sqrt(target / size) * 0.92)));\n        }\n        throw Error("Image is still over the limit. Try WebP or a larger target.");\n      }\n    };\n    async function isAnimated(bytes) {\n      if (bytes.subarray(0, 3).toString() === "GIF") return true;\n      if (bytes.subarray(0, 4).toString() === "RIFF") return bytes.includes(Buffer.from("ANIM"));\n      if (bytes[0] === 137 && bytes.subarray(1, 4).toString() === "PNG") return bytes.includes(Buffer.from("acTL"));\n      return bytes.includes(Buffer.from("avis"));\n    }\n    module2.exports = { Engine: Engine2, run, isAnimated };\n  }\n});\n\n// src/dependencies.cjs\nvar require_dependencies = __commonJS({\n  "src/dependencies.cjs"(exports2, module2) {\n    "use strict";\n    var fs2 = require("node:fs/promises");\n    var path2 = require("node:path");\n    var { createHash } = require("node:crypto");\n    var { inflateRawSync } = require("node:zlib");\n    var https = require("node:https");\n    var { run } = require_engine();\n    var RELEASES = {\n      ffmpeg: { version: "9.0.1", url: "https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip", sha256: "fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9" },\n      sevenzip: { version: "26.03", url: "https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe", sha256: "ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d", executable: "7zr.exe" },\n      vips: { version: "8.18.2", targets: {\n        "win32-x64": ["x64", "aec9b8d5e79c06aade9fd51224570c87687675896d4da335955047c211d40e01"],\n        "win32-arm64": ["arm64", "349942b14cd401cc315b9a93bd2ab7f3c1b5f37ce30d8a90d4136875e4e63129"],\n        "win32-ia32": ["x86", "0eb5b60295cc7d3a2797848c99554b19c0b8a99f1883c4feb9c8435398bb2183"]\n      } }\n    };\n    function downloadSpec(name, platform = process.platform, arch = process.arch) {\n      if (name === "ffmpeg" && platform === "win32" && arch === "x64") return RELEASES.ffmpeg;\n      if (name === "sevenzip" && platform === "win32" && ["x64", "arm64", "ia32"].includes(arch)) return RELEASES.sevenzip;\n      if (name === "vips") {\n        const pair = RELEASES.vips.targets[`${platform}-${arch}`];\n        if (pair) return { version: RELEASES.vips.version, url: `https://github.com/libvips/build-win64-mxe/releases/download/v8.18.2/vips-dev-${pair[0]}-all-8.18.2.zip`, sha256: pair[1] };\n      }\n      throw Error(`No pinned official ${name} download for ${platform}/${arch}. Select an existing executable or import a ZIP.`);\n    }\n    function verify(bytes, expected) {\n      if (!/^[a-f0-9]{64}$/.test(expected) || createHash("sha256").update(bytes).digest("hex") !== expected) throw Error("SHA-256 verification failed. Nothing was installed.");\n    }\n    function download(url, redirects = 0) {\n      if (new URL(url).protocol !== "https:" || redirects > 5) return Promise.reject(Error("Unsafe download redirect."));\n      return new Promise((resolve, reject) => {\n        const request = https.get(url, { headers: { "User-Agent": "ClampDown/1.2" } }, (response) => {\n          if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {\n            response.resume();\n            clearTimeout(timer);\n            resolve(download(new URL(response.headers.location, url).href, redirects + 1));\n            return;\n          }\n          if (response.statusCode !== 200) {\n            response.resume();\n            clearTimeout(timer);\n            reject(Error(`Download failed: HTTP ${response.statusCode}`));\n            return;\n          }\n          const chunks = [];\n          let size = 0;\n          response.on("data", (part) => {\n            size += part.length;\n            if (size > 512 * 1024 ** 2) request.destroy(Error("Archive exceeds 512 MiB."));\n            else chunks.push(part);\n          });\n          response.on("error", reject);\n          response.on("end", () => {\n            clearTimeout(timer);\n            resolve(Buffer.concat(chunks));\n          });\n        });\n        const timer = setTimeout(() => request.destroy(Error("Download timed out.")), 5 * 60 * 1e3);\n        request.on("error", (e) => {\n          clearTimeout(timer);\n          reject(e);\n        });\n      });\n    }\n    function zipEntries(bytes) {\n      let end = -1;\n      for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 101010256 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {\n        end = i;\n        break;\n      }\n      if (end < 0) throw Error("Not a supported ZIP archive.");\n      const count = bytes.readUInt16LE(end + 10);\n      let offset = bytes.readUInt32LE(end + 16), total = 0;\n      if (count === 65535 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw Error("ZIP64/multipart archives are unsupported.");\n      const entries = [], seen = /* @__PURE__ */ new Set();\n      for (let i = 0; i < count; i++) {\n        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 33639248) throw Error("Invalid ZIP directory.");\n        const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), packed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);\n        const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);\n        const mode = bytes.readUInt32LE(offset + 38) >>> 16;\n        const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");\n        const local = bytes.readUInt32LE(offset + 42);\n        if (!name || /[\\\\:\\x00-\\x1f]/.test(name) || name.startsWith("/") || name.split("/").some((p) => p === "." || p === ".." || /[. ]$/.test(p)) || (mode & 61440) === 40960 || flags & 1 || ![0, 8].includes(method)) throw Error("ZIP contains an unsafe or unsupported entry.");\n        const folded = name.toLowerCase();\n        if (seen.has(folded)) throw Error("ZIP has duplicate paths.");\n        seen.add(folded);\n        total += size;\n        if (total > 1024 ** 3 || size > 512 * 1024 ** 2 || count > 1e4) throw Error("ZIP expands beyond the installation budget.");\n        if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 67324752) throw Error("Invalid ZIP file entry.");\n        const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);\n        if (start + packed > bytes.length) throw Error("Truncated ZIP entry.");\n        entries.push({ name, method, size, start, packed });\n        offset += 46 + length + extra + comment;\n      }\n      return entries;\n    }\n    async function extractZip(bytes, destination) {\n      const entries = zipEntries(bytes);\n      for (const e of entries) {\n        const target = path2.resolve(destination, e.name);\n        if (!target.startsWith(path2.resolve(destination) + path2.sep)) throw Error("Archive path escapes its directory.");\n        if (e.name.endsWith("/")) {\n          await fs2.mkdir(target, { recursive: true });\n          continue;\n        }\n        const source = bytes.subarray(e.start, e.start + e.packed);\n        const data = e.method === 8 ? inflateRawSync(source, { maxOutputLength: Math.max(1, e.size) }) : source;\n        if (data.length !== e.size) throw Error("Invalid ZIP entry length.");\n        await fs2.mkdir(path2.dirname(target), { recursive: true });\n        await fs2.writeFile(target, data, { flag: "wx", mode: 493 });\n      }\n    }\n    async function findExecutable(root, name) {\n      const matches = [];\n      for (const e of await fs2.readdir(root, { withFileTypes: true })) {\n        if (e.isSymbolicLink()) throw Error("Dependency archives must not contain symbolic links.");\n        const file = path2.join(root, e.name);\n        if (e.isDirectory()) matches.push(...await findExecutable(file, name));\n        else if (name === "sevenzip" ? /^(?:7z|7za|7zr)(?:\\.exe)?$/i.test(e.name) : e.name === name || e.name === name + ".exe") matches.push(file);\n      }\n      return matches;\n    }\n    async function install2(engine, name, options = {}) {\n      if (!["ffmpeg", "vips", "sevenzip"].includes(name)) throw Error("Unknown dependency.");\n      if (engine.installing) throw Error("A dependency installation is already running.");\n      engine.installing = true;\n      let folder;\n      try {\n        await engine.init();\n        const spec = options.archive ? null : downloadSpec(name);\n        const current = (await engine.paths())[name];\n        if (spec && current?.version.includes(spec.version)) {\n          try {\n            return await engine.configure(name, current.path);\n          } catch {\n          }\n        }\n        const bytes = options.archive ? await fs2.readFile(options.archive) : await download(spec.url);\n        if (bytes.length > 512 * 1024 ** 2) throw Error("Archive exceeds 512 MiB.");\n        if (spec) verify(bytes, spec.sha256);\n        const base = path2.join(engine.root, "dependencies");\n        await fs2.mkdir(base, { recursive: true });\n        folder = await fs2.mkdtemp(path2.join(base, `${name}-`));\n        let candidates;\n        if (spec?.executable) {\n          const executable = path2.join(folder, spec.executable);\n          await fs2.writeFile(executable, bytes, { mode: 493 });\n          candidates = [executable];\n        } else if (spec?.url.endsWith(".tar.gz")) {\n          const archive = path2.join(folder, "upstream.tar.gz");\n          await fs2.writeFile(archive, bytes);\n          await run("tar", ["-xzf", archive, "-C", folder], { timeout: 12e4 });\n          await fs2.unlink(archive);\n        } else await extractZip(bytes, folder);\n        candidates ||= await findExecutable(folder, name);\n        if (candidates.length !== 1) throw Error(`Expected exactly one ${name} executable in the archive.`);\n        if (process.platform !== "win32") await fs2.chmod(candidates[0], 493);\n        const result = await engine.configure(name, candidates[0]);\n        folder = null;\n        return result;\n      } finally {\n        engine.installing = false;\n        if (folder) await fs2.rm(folder, { recursive: true, force: true });\n      }\n    }\n    module2.exports = { RELEASES, downloadSpec, verify, zipEntries, extractZip, install: install2 };\n  }\n});\n\n// src/helper.cjs\nvar http = require("node:http");\nvar fs = require("node:fs/promises");\nvar path = require("node:path");\nvar { randomBytes, timingSafeEqual } = require("node:crypto");\nvar { Engine } = require_engine();\nvar { install } = require_dependencies();\nasync function startHelper(root) {\n  const engine = new Engine(root);\n  await engine.init();\n  const token = randomBytes(32).toString("hex");\n  const runtimeFile = path.join(engine.root, "helper-runtime.json");\n  let lastRequest = Date.now();\n  const json = (res, value, status = 200) => {\n    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });\n    res.end(JSON.stringify(value));\n  };\n  const server = http.createServer(async (req, res) => {\n    const auth = Buffer.from(req.headers.authorization || "");\n    const expected = Buffer.from(`Bearer ${token}`);\n    if (auth.length !== expected.length || !timingSafeEqual(auth, expected) || req.headers.origin) {\n      json(res, { error: "Unauthorized" }, 403);\n      req.resume();\n      return;\n    }\n    lastRequest = Date.now();\n    try {\n      if (req.method === "GET" && req.url === "/status") {\n        json(res, { ...await engine.status(), helper: "running", node: process.version });\n        return;\n      }\n      if (req.method !== "POST") {\n        json(res, { error: "Not found" }, 404);\n        return;\n      }\n      const chunks = [];\n      let total = 0;\n      const max = ["/compress", "/archive"].includes(req.url) ? 1024 ** 3 : 16384;\n      for await (const chunk of req) {\n        total += chunk.length;\n        if (total > max) throw Error("Request too large");\n        chunks.push(chunk);\n      }\n      const body = Buffer.concat(chunks);\n      if (["/compress", "/archive"].includes(req.url)) {\n        const metadata = JSON.parse(decodeURIComponent(req.headers["x-clampdown-meta"] || ""));\n        const result2 = await engine[req.url === "/archive" ? "archive" : "compress"]({ ...metadata, bytes: new Uint8Array(body) });\n        const chunks2 = result2.parts?.map((part) => Buffer.from(part.bytes)) || [Buffer.from(result2.bytes)];\n        const info = result2.parts ? { baseName: result2.baseName, backend: result2.backend, originalBytes: result2.originalBytes, outputBytes: result2.outputBytes, sizes: result2.parts.map((part) => part.bytes.length) } : (({ bytes, ...rest }) => rest)(result2);\n        res.writeHead(200, { "Content-Type": "application/octet-stream", "X-ClampDown-Meta": encodeURIComponent(JSON.stringify(info)), "Cache-Control": "no-store" });\n        res.end(Buffer.concat(chunks2));\n        return;\n      }\n      const args = JSON.parse(body.toString() || "{}");\n      let result;\n      switch (req.url) {\n        case "/install":\n          result = await install(engine, args.name);\n          break;\n        case "/configure":\n          result = await engine.configure(args.name, args.path);\n          break;\n        case "/import":\n          result = await install(engine, args.name, { archive: args.path });\n          break;\n        case "/cancel":\n          engine.cancel(args.id);\n          break;\n        case "/cancelAll":\n          engine.cancelAll();\n          break;\n        case "/shutdown":\n          engine.cancelAll();\n          setTimeout(() => close(), 100).unref();\n          break;\n        default:\n          json(res, { error: "Not found" }, 404);\n          return;\n      }\n      json(res, result || { ok: true });\n    } catch (e) {\n      if (!res.headersSent && !res.destroyed) json(res, { error: e.message }, 400);\n    }\n  });\n  server.requestTimeout = 35 * 60 * 1e3;\n  await new Promise((resolve, reject) => {\n    server.once("error", reject);\n    server.listen(0, "127.0.0.1", resolve);\n  });\n  const connection = { port: server.address().port, token, version: "1.2.3", pid: process.pid };\n  await fs.writeFile(runtimeFile, JSON.stringify(connection), { mode: 384 });\n  const timer = setInterval(() => {\n    if (Date.now() - lastRequest > 10 * 60 * 1e3 && !engine.jobs.size && !engine.installing) close();\n  }, 3e4);\n  timer.unref();\n  async function close() {\n    clearInterval(timer);\n    engine.cancelAll();\n    server.close();\n    server.closeAllConnections();\n    try {\n      const current = JSON.parse(await fs.readFile(runtimeFile, "utf8"));\n      if (current.token === token) await fs.unlink(runtimeFile);\n    } catch {\n    }\n  }\n  return { connection, engine, close };\n}\nif (require.main === module) {\n  startHelper(process.argv[2] || __dirname).catch((e) => {\n    console.error(e);\n    process.exitCode = 1;\n  });\n}\nmodule.exports = { startHelper };\n';
  }
});

// src/bd-native.cjs
var require_bd_native = __commonJS({
  "src/bd-native.cjs"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { createHash } = require("crypto");
    var { shell } = require("electron");
    var { downloadAll: saveAttachments } = require_downloads();
    var helperSource = require_helper();
    var HELPER_VERSION = "1.2.3";
    var NODE_RELEASES = {
      x64: { file: "node-v24.20.0-x64.msi", sha256: "28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a" },
      arm64: { file: "node-v24.20.0-arm64.msi", sha256: "15130c76b7a3a5f58233a3c383944ebd0da924d2fc80e50916769a4b7b9af6f8" }
    };
    function createNative2(api) {
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
        return [path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"), path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe")].find((p) => fs.existsSync(p));
      }
      async function request(route, data, raw, c = connection()) {
        const headers = { Authorization: `Bearer ${c.token}` };
        if (raw) headers["X-ClampDown-Meta"] = encodeURIComponent(JSON.stringify(data));
        else headers["Content-Type"] = "application/json";
        const res = await BdApi.Net.fetch(`http://127.0.0.1:${c.port}/${route}`, {
          method: route === "status" ? "GET" : "POST",
          headers,
          body: route === "status" ? void 0 : raw || JSON.stringify(data || {}),
          timeout: route === "status" ? 2e3 : 35 * 60 * 1e3,
          maxRedirects: 0
        });
        if (!res.ok) {
          let error;
          try {
            error = (await res.json()).error;
          } catch {
          }
          throw Error(error || `Local helper error ${res.status}`);
        }
        if (raw) return { ...JSON.parse(decodeURIComponent(res.headers.get("X-ClampDown-Meta"))), bytes: new Uint8Array(await res.arrayBuffer()) };
        return res.json();
      }
      async function launch() {
        helperState = "starting";
        try {
          const c = connection();
          if (c.version === HELPER_VERSION && (await request("status", null, null, c)).helper === "running") return;
          await request("shutdown", {}, null, c);
        } catch {
        }
        if (process.platform !== "win32") throw Error("Start the local helper with Node.js: node ClampDown/helper.cjs ClampDown");
        const node = nodePath();
        if (!node) throw Error("Install Node.js 22 or newer from nodejs.org, then click Start local helper again.");
        fs.mkdirSync(root, { recursive: true });
        const script = path.join(root, "helper.cjs"), launcher = path.join(root, "Start-ClampDown.vbs"), fallback = path.join(root, "Start-ClampDown.cmd");
        fs.writeFileSync(script, helperSource, "utf8");
        const command = [node, script, root].map((p) => `"${p}"`).join(" ");
        fs.writeFileSync(launcher, `Set runner = CreateObject("WScript.Shell")\r
runner.Run "${command.replaceAll('"', '""')}", 0, False\r
`, "utf8");
        fs.writeFileSync(fallback, `@echo off\r
start "" /b "%SystemRoot%\\System32\\wscript.exe" "${launcher}"\r
`, "utf8");
        const error = await shell.openPath(launcher);
        if (error) throw Error(`Could not start the local helper: ${error}`);
        for (let i = 0; i < 50; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          try {
            if ((await request("status")).helper === "running") return;
          } catch {
          }
          if (i === 9) {
            const fallbackError = await shell.openPath(fallback);
            if (fallbackError) throw Error(`Could not start the local helper: ${fallbackError}`);
          }
        }
        throw Error(`The local helper did not start. Run node "${script}" "${root}" in a terminal to see the error.`);
      }
      async function ensure() {
        try {
          const c = connection();
          if (c.version === HELPER_VERSION) {
            await request("status", null, null, c);
            return;
          }
        } catch {
        }
        if (!api.Data.load("helperEnabled")) throw Error("Set up the local helper in ClampDown \u2192 Dependencies & setup first.");
        if (!starting) starting = launch().finally(() => {
          starting = null;
        });
        await starting;
      }
      return {
        start: async () => {
          api.Data.save("helperEnabled", true);
          try {
            await ensure();
            helperState = "running";
          } catch (e) {
            helperState = "offline";
            throw e;
          }
        },
        status: async () => {
          try {
            const state = await request("status");
            helperState = "running";
            return state;
          } catch {
            return { dependencies: {}, jobs: [], platform: process.platform, helper: helperState };
          }
        },
        nodeStatus: async () => {
          const executable = nodePath();
          if (!executable) return { installed: false };
          try {
            return { installed: true, executable, version: (await request("status")).node };
          } catch {
            return { installed: true, executable };
          }
        },
        installNode: async () => {
          if (nodePath()) return { installed: true, message: "Node.js is already installed." };
          if (process.platform !== "win32" || !NODE_RELEASES[process.arch]) throw Error(`No pinned Node.js installer is available for ${process.platform}/${process.arch}.`);
          const release = NODE_RELEASES[process.arch];
          const response = await BdApi.Net.fetch(`https://nodejs.org/dist/v24.20.0/${release.file}`, { timeout: 5 * 60 * 1e3, maxRedirects: 0 });
          if (!response.ok) throw Error(`Node.js download failed: HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 64 * 1024 ** 2 || createHash("sha256").update(bytes).digest("hex") !== release.sha256) throw Error("Node.js installer verification failed. Nothing was opened.");
          fs.mkdirSync(root, { recursive: true });
          const installer = path.join(root, release.file);
          fs.writeFileSync(installer, bytes);
          const error = await shell.openPath(installer);
          if (error) throw Error(`Could not open the Node.js installer: ${error}`);
          return { installed: false, message: "The verified Node.js installer is open. Finish its setup, then click Start local helper." };
        },
        compress: async ({ bytes, ...data }) => {
          await ensure();
          return request("compress", data, bytes);
        },
        archive: async ({ bytes, ...data }) => {
          await ensure();
          const result = await request("archive", data, bytes);
          let offset = 0;
          const parts = result.sizes.map((size, index) => {
            const part = { bytes: result.bytes.slice(offset, offset + size), name: `${result.baseName}.${String(index + 1).padStart(3, "0")}`, type: "application/x-7z-compressed" };
            offset += size;
            return part;
          });
          if (offset !== result.bytes.length) throw Error("The helper returned an invalid multipart archive.");
          return { ...result, parts };
        },
        install: async (name) => {
          await ensure();
          return request("install", { name });
        },
        cancel: (id) => request("cancel", { id }).catch(() => {
        }),
        cancelAll: () => request("cancelAll").catch(() => {
        }),
        stop: () => request("shutdown").catch(() => {
        }),
        choose: async (name, kind) => {
          await ensure();
          const selected = await BdApi.UI.openDialog({ mode: "open", title: `Select ${name} ${kind}`, filters: kind === "zip" ? [{ name: "ZIP archive", extensions: ["zip"] }] : void 0, properties: ["openFile"] });
          if (selected.canceled || !selected.filePaths?.[0]) return;
          return request(kind === "zip" ? "import" : "configure", { name, path: selected.filePaths[0] });
        },
        downloadAll: async (attachments) => {
          const defaultPath = path.join(process.env.USERPROFILE || "", "Downloads", attachments[0].name);
          const selected = await BdApi.UI.openDialog({ mode: "save", title: "Download all archive parts", defaultPath, showOverwriteConfirmation: true });
          if (selected.canceled || !selected.filePath) return [];
          return saveAttachments(attachments, selected.filePath, BdApi.Net.fetch);
        }
      };
    }
    module2.exports = { createNative: createNative2 };
  }
});

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
    function archiveAttachments2(message) {
      const source = message?.attachments?.toArray?.() || message?.attachments || [];
      return Array.from(source).filter((a) => /\.(?:7z|zip)(?:\.\d{3,})?$/i.test(a?.filename || "") && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(a?.url || "")).map((a) => ({ name: a.filename, url: a.url, size: a.size }));
    }
    module2.exports = { DEFAULTS, PRESETS, settings, targetBytes, archivePartBytes, kind, bitrate, archiveAttachments: archiveAttachments2 };
  }
});

// src/controller.cjs
var require_controller = __commonJS({
  "src/controller.cjs"(exports2, module2) {
    "use strict";
    var { settings, kind } = require_policy();
    var Controller2 = class {
      constructor(host) {
        this.host = host;
        this.config = settings(host.load());
        this.ready = /* @__PURE__ */ new WeakSet();
        this.pending = /* @__PURE__ */ new WeakSet();
        this.active = true;
        this.history = [];
        this.tail = Promise.resolve();
        this.limitText = "Waiting for a channel";
        this.closePanel = null;
      }
      save(values) {
        this.config = settings({ ...this.config, ...values });
        this.host.save(this.config);
      }
      limit(channel) {
        let value;
        try {
          value = this.host.limit(channel);
        } catch {
        }
        if (Number.isSafeInteger(value) && value >= 1024 && value <= 2 ** 31) {
          this.limitText = `${(value / 1048576).toFixed(1)} MiB \xB7 Discord`;
          return value;
        }
        if (this.config.targetMiB > 0) {
          this.limitText = `${this.config.targetMiB} MiB \xB7 manual target`;
          return Math.floor(this.config.targetMiB * 1048576);
        }
        this.limitText = "Discord limit unavailable \xB7 choose a manual target";
        throw Error(this.limitText);
      }
      intercept(files, channel, resume) {
        if (!this.active || !this.config.enabled || !Array.isArray(files) || !files.length || this.ready.has(files)) {
          this.ready.delete(files);
          return false;
        }
        if (this.pending.has(files)) return true;
        if (!files.some((f) => f instanceof File && (kind(f) || this.config.archiveFiles))) return false;
        let limit;
        try {
          limit = this.limit(channel);
        } catch (e) {
          this.host.notice(e.message);
          return false;
        }
        const trigger = Math.min(limit, this.config.targetMiB > 0 ? this.config.targetMiB * 1048576 : limit);
        if (!files.some((f) => f.size > trigger && (kind(f) || this.config.archiveFiles))) return false;
        const original = files.slice();
        this.pending.add(files);
        const config = { ...this.config };
        this.host.notice("ClampDown is preparing your attachment. Open the clamp icon for progress.");
        this.tail = this.tail.catch(() => {
        }).then(async () => {
          if (!this.active) return;
          const results = [];
          try {
            for (let i = 0; i < original.length; i++) {
              const file = original[i];
              if (file.size <= trigger || !kind(file) && !config.archiveFiles) {
                results.push(file);
                continue;
              }
              if (file.size > 1024 ** 3) throw Error("Files larger than 1 GiB need to be trimmed first");
              const request = { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type, limit, settings: config };
              const out = kind(file) ? await this.host.native.compress(request) : await this.host.native.archive(request);
              if (!this.active) return;
              const prepared = out.parts || [out];
              results.push(...prepared.map((part) => new File([part.bytes], part.name, { type: part.type, lastModified: file.lastModified })));
              this.history.unshift({ name: out.baseName || out.name, before: file.size, after: prepared.reduce((sum, part) => sum + part.bytes.length, 0), backend: out.backend, parts: prepared.length });
              this.history.length = Math.min(5, this.history.length);
            }
            if (!this.active) return;
            files.splice(0, files.length, ...results);
            this.ready.add(files);
            resume();
            this.host.notice("ClampDown: ready to send.");
          } catch (e) {
            this.host.notice(`ClampDown: ${e.message}. Your original files were kept.`);
            this.retry = () => {
              this.retry = null;
              this.intercept(files, channel, resume);
            };
            if (/Set up |FFprobe must/.test(e.message)) this.host.openSettings?.();
          } finally {
            this.pending.delete(files);
          }
        });
        return true;
      }
      stop() {
        this.active = false;
        this.host.native.cancelAll();
      }
    };
    module2.exports = { Controller: Controller2 };
  }
});

// src/ui.cjs
var require_ui = __commonJS({
  "src/ui.cjs"(exports2, module2) {
    "use strict";
    var ICON_PATH = "M7 2a5 5 0 0 0-5 5v7a5 5 0 0 0 5 5h8v-3H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12V2H7Zm3 5h4l2 2h5v5H10V7Zm4 12h3v2h4v2H9v-2h5v-2Z";
    var COMPOSER_CSS2 = `
button[data-clampdown]{box-sizing:border-box;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;min-width:var(--space-32,32px);min-height:var(--space-32,32px);padding:0;margin-inline:0;border:0;border-radius:8px;background:transparent;color:var(--interactive-text-default,var(--interactive-normal,#b5bac1));cursor:pointer;transition:background-color .2s ease,color .2s ease}
button[data-clampdown]:hover{background-color:var(--interactive-background-selected,var(--background-modifier-selected,#404249));color:var(--interactive-text-hover,var(--interactive-hover,#dbdee1))}
button[data-clampdown]:active{color:var(--interactive-text-active,var(--interactive-active,#fff))}
button[data-clampdown] svg{display:block;width:20px;height:20px;color:inherit}
button[data-clampdown]:focus-visible{outline:2px solid var(--focus-primary,#00a8fc);outline-offset:2px}
@media(prefers-reduced-motion:reduce){button[data-clampdown]{transition:none}}
`;
    var CSS = `
:host{font:14px/1.5 var(--font-primary,gg sans,Inter,system-ui,sans-serif);color:var(--text-normal,#e6e6ee);color-scheme:dark}
*{box-sizing:border-box}dialog{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 64px);padding:0;border:1px solid var(--background-modifier-accent,#383841);border-radius:18px;background:var(--background-primary,#202024);color:inherit;box-shadow:0 24px 90px #0008;overflow:auto}dialog::backdrop{background:#08090db0;backdrop-filter:blur(3px)}
.panel{padding:26px}header{display:flex;align-items:center;gap:12px;margin-bottom:24px}.mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#5865f220;color:#a4acff}.mark svg{width:28px;height:28px}h1{font-size:22px;letter-spacing:-.5px;margin:0;line-height:1.15}.subtitle,.muted{font-size:12px;color:var(--text-muted,#a4a4b4)}.subtitle{margin-top:4px}.spacer{flex:1}button,input,select{font:inherit}button{cursor:pointer;border:1px solid var(--background-modifier-accent,#41414c);border-radius:8px;padding:8px 12px;background:var(--background-secondary,#2b2b32);color:inherit;transition:background .12s}button:hover{background:var(--background-modifier-hover,#3a3a45)}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #a4acff;outline-offset:3px}button:disabled{cursor:wait;opacity:.55}.close{font-size:22px;background:none;border:0;padding:2px 9px}.status{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:var(--background-secondary,#29292f);font-size:12px;margin:0 0 22px}.dot{width:7px;height:7px;border-radius:50%;background:#56c99b}.row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:16px 0}.row label{font-weight:600}.row p{margin:2px 0;font-size:12px;color:var(--text-muted,#a4a4b4)}input[type=checkbox]{accent-color:#7985ff;width:19px;height:19px}.section-label{display:block;margin:21px 0 9px;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-muted,#a4a4b4)}.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.presets button{text-align:left;padding:12px 13px}.presets strong,.presets small{display:block}.presets small{font-size:11px;color:var(--text-muted,#a4a4b4);margin-top:3px}.presets button[aria-pressed=true]{background:#5865f223;border-color:#818cf8;box-shadow:inset 0 0 0 1px #818cf8}.presets button[aria-pressed=true] strong{color:#b5bdff}details{border-top:1px solid var(--background-modifier-accent,#383841);margin-top:24px;padding-top:16px}summary{font-weight:600;cursor:pointer;list-style-position:inside}select,input[type=number]{border:1px solid var(--background-modifier-accent,#41414c);border-radius:7px;background:var(--input-background,#17171c);color:inherit;padding:8px;width:190px;max-width:50%}input[type=number]{width:110px}.dep{padding:14px 0;border-bottom:1px solid var(--background-modifier-accent,#383841)}.dep-title{display:flex;gap:10px;align-items:center}.badge{font-size:10px;letter-spacing:.5px;padding:2px 6px;background:#5865f225;color:#b5bdff;border-radius:4px}.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.actions button{font-size:12px}.dep p{font-size:12px;color:var(--text-muted,#a4a4b4)}a{color:#a4acff}.message{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#ffca8a;margin-top:12px}.job{padding:12px 0}.job-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:13px}progress{width:100%;accent-color:#8794ff;height:6px;display:block;margin:9px 0}.foot{margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted,#a4a4b4)}.history{font-size:12px;padding:8px 0}.history strong{color:#70d9b0}.hidden{display:none} @media(prefers-reduced-motion:reduce){*{transition:none!important}}`;
    function icon2(doc = document) {
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("aria-hidden", "true");
      const p = doc.createElementNS(svg.namespaceURI, "path");
      p.setAttribute("d", ICON_PATH);
      p.setAttribute("fill", "currentColor");
      svg.append(p);
      return svg;
    }
    function openPanel2(controller, embedded = false) {
      if (!embedded && controller.closePanel) controller.closePanel();
      const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      shadow.append(style);
      const root = document.createElement(embedded ? "div" : "dialog");
      root.className = "panel";
      shadow.append(root);
      if (!embedded) document.body.append(host);
      const make = (tag, text, parent = root, cls) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (cls) el.className = cls;
        parent.append(el);
        return el;
      };
      const button = (label, fn, parent = root) => {
        const el = make("button", label, parent);
        el.type = "button";
        el.addEventListener("click", fn);
        return el;
      };
      const header = make("header");
      make("div", "", header, "mark").append(icon2());
      const title = make("div", "", header);
      const heading = make("h1", "ClampDown", title);
      heading.id = "cd-title";
      root.setAttribute("aria-labelledby", heading.id);
      make("div", "A little smaller. Ready to share.", title, "subtitle");
      make("div", "", header, "spacer");
      let timer, closed = false;
      const previous = document.activeElement;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (!embedded) {
          root.close();
          host.remove();
          previous?.focus?.();
        }
        if (controller.closePanel === close) controller.closePanel = null;
      };
      if (!embedded) {
        const x = button("\xD7", close, header);
        x.className = "close";
        x.setAttribute("aria-label", "Close ClampDown");
        controller.closePanel = close;
        root.addEventListener("cancel", close);
        root.addEventListener("click", (e) => {
          if (e.target === root) {
            const r = root.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
          }
        });
      }
      const status = make("div", "", root, "status");
      make("span", "", status, "dot");
      try {
        controller.limit(controller.host.channel?.());
      } catch {
      }
      const limitLabel = make("span", controller.limitText, status);
      const toggle = make("div", "", root, "row"), tl = make("label", "Automatic compression", toggle);
      tl.htmlFor = "pd-enabled";
      const enabled = make("input", "", toggle);
      enabled.id = "pd-enabled";
      enabled.type = "checkbox";
      enabled.checked = controller.config.enabled;
      enabled.onchange = () => controller.save({ enabled: enabled.checked });
      for (const [key, label] of [["videoPreset", "Video"], ["imagePreset", "Images"]]) {
        make("span", label, root, "section-label");
        const group = make("div", "", root, "presets");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", `${label} compression preset`);
        for (const [value, label2, hint] of [["fast", "Fast", "Less waiting"], ["balanced", "Balanced", "The everyday choice"], ["slow", "Slow", "More detail per byte"]]) {
          const b = button("", () => {
            controller.save({ [key]: value });
            for (const sibling of group.children) sibling.setAttribute("aria-pressed", String(sibling === b));
          }, group);
          b.setAttribute("aria-pressed", String(controller.config[key] === value));
          make("strong", label2, b);
          make("small", hint, b);
        }
      }
      make("span", "Other files \xB7 multipart 7z", root, "section-label");
      const archiveToggle = make("div", "", root, "row"), archiveText = make("div", "", archiveToggle);
      const archiveLabel = make("label", "Archive oversized non-media files", archiveText);
      archiveLabel.htmlFor = "pd-archiveFiles";
      make("p", "Creates .7z.001, .7z.002\u2026 parts below Discord's current limit.", archiveText);
      const archiveFiles = make("input", "", archiveToggle);
      archiveFiles.id = "pd-archiveFiles";
      archiveFiles.type = "checkbox";
      archiveFiles.checked = controller.config.archiveFiles;
      archiveFiles.onchange = () => controller.save({ archiveFiles: archiveFiles.checked });
      const archiveGroup = make("div", "", root, "presets");
      archiveGroup.setAttribute("role", "group");
      archiveGroup.setAttribute("aria-label", "Archive compression preset");
      for (const [value, label, hint] of [["1", "Fast", "Lowest CPU use"], ["5", "Balanced", "Good default"], ["9", "Ultra", "Smallest output"]]) {
        const b = button("", () => {
          controller.save({ archiveLevel: value });
          for (const sibling of archiveGroup.children) sibling.setAttribute("aria-pressed", String(sibling === b));
        }, archiveGroup);
        b.setAttribute("aria-pressed", String(controller.config.archiveLevel === value));
        make("strong", label, b);
        make("small", hint, b);
      }
      const jobs = make("div");
      jobs.setAttribute("aria-live", "polite");
      const message = make("div", "", root, "message");
      message.setAttribute("role", "status");
      async function task(fn, btn) {
        if (btn) btn.disabled = true;
        message.textContent = "Working\u2026";
        try {
          await fn();
          message.textContent = "Ready. Settings are saved automatically.";
          await update();
        } catch (e) {
          message.textContent = e.message;
        } finally {
          if (btn) btn.disabled = false;
        }
      }
      const advanced = make("details");
      make("summary", "Advanced settings", advanced);
      function select(key, label, options, hint) {
        const row = make("div", "", advanced, "row"), text = make("div", "", row);
        const l = make("label", label, text);
        l.htmlFor = `pd-${key}`;
        if (hint) make("p", hint, text);
        const s = make("select", "", row);
        s.id = `pd-${key}`;
        for (const [value, title2] of options) {
          const o = make("option", title2, s);
          o.value = value;
        }
        s.value = controller.config[key];
        s.onchange = () => controller.save({ [key]: s.value });
      }
      select("codec", "Video codec", [["h264", "H.264 \xB7 most compatible"], ["hevc", "H.265 / HEVC"]]);
      select("hardware", "Video encoder", [["auto", "Auto \xB7 GPU, then CPU"], ["cpu", "CPU"], ["nvidia", "NVIDIA NVENC"], ["intel", "Intel Quick Sync"], ["amd", "AMD AMF"]], "Unavailable GPUs fall back to CPU.");
      select("imageFormat", "Image output", [["webp", "WebP"], ["jpg", "JPEG"], ["png", "PNG"], ["gif", "GIF"], ["avif", "AVIF"]], "Animation is preserved where supported.");
      select("imageBackend", "Image processor", [["auto", "Auto \xB7 libvips preferred"], ["vips", "libvips only"], ["ffmpeg", "FFmpeg"]]);
      for (const [key, title2, hint, min, max] of [["maxHeight", "Video height", "Maximum pixels; never upscaled.", 144, 2160], ["audioKbps", "Audio bitrate", "AAC \xB7 kilobits per second", 32, 192], ["targetMiB", "Target size", "MiB \xB7 0 follows Discord automatically", 0, 500], ["archiveDictionaryMiB", "7-Zip dictionary", "MiB \xB7 larger can compress better but uses more memory", 4, 256], ["archiveThreads", "7-Zip CPU threads", "0 selects threads automatically", 0, 32], ["archivePartPercent", "Archive part size", "% of the effective upload limit", 80, 98]]) {
        const row = make("div", "", advanced, "row"), text = make("div", "", row);
        const l = make("label", title2, text);
        l.htmlFor = `pd-${key}`;
        make("p", hint, text);
        const input = make("input", "", row);
        input.type = "number";
        input.min = min;
        input.max = max;
        input.step = key === "targetMiB" ? "0.1" : "1";
        input.value = controller.config[key];
        input.id = `pd-${key}`;
        input.onchange = () => {
          controller.save({ [key]: Number(input.value) });
          input.value = controller.config[key];
        };
      }
      const dependencies = make("details");
      make("summary", "Dependencies & setup", dependencies);
      let helperLabel;
      if (controller.host.native.start) {
        helperLabel = make("p", "Checking local helper\u2026", dependencies, "muted");
        make("p", "BetterDiscord needs a separate local process to run encoders. Start it here once; Node.js 22 or newer is required. It runs hidden, accepts only authenticated requests on this computer, and exits when ClampDown is disabled or after 10 idle minutes.", dependencies, "muted");
        const start = button("Start local helper", () => {
          helperLabel.textContent = "Starting local helper\u2026";
          task(() => controller.host.native.start(), start);
        }, dependencies);
        const nodeLabel = make("p", "Node.js has not been checked yet.", dependencies, "muted");
        const nodeActions = make("div", "", dependencies, "actions");
        const checkNode = button("Check Node.js", () => task(async () => {
          const state = await controller.host.native.nodeStatus();
          nodeLabel.textContent = state.installed ? `Node.js ${state.version || "installed"} \xB7 ${state.executable}` : "Node.js was not found.";
        }, checkNode), nodeActions);
        const installNode = button("Download & install Node.js", () => task(async () => {
          const result = await controller.host.native.installNode();
          nodeLabel.textContent = result.message;
        }, installNode), nodeActions);
      }
      make("p", "FFmpeg, libvips, and 7-Zip are separate third-party programs. Download buttons fetch pinned upstream builds, verify SHA-256, and install locally. Files never leave your computer during processing.", dependencies, "muted");
      const depLabels = {};
      for (const [key, title2, url, license] of [["ffmpeg", "FFmpeg", "https://ffmpeg.org/legal.html", "Build-dependent LGPL/GPL"], ["vips", "libvips", "https://github.com/libvips/libvips", "LGPL-2.1-or-later + bundled dependency notices"], ["sevenzip", "7-Zip", "https://www.7-zip.org/", "LGPL-2.1-or-later + BSD/unRAR notices"]]) {
        const section = make("div", "", dependencies, "dep"), titleRow = make("div", "", section, "dep-title");
        make("strong", title2, titleRow);
        depLabels[key] = make("span", "Checking\u2026", titleRow, "badge");
        const p = make("p", "", section), a = make("a", license, p);
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        if (key === "vips") make("p", "Official prebuilt Windows packages are available for x64, ARM64, and x86. ClampDown downloads and verifies the matching archive automatically.", section);
        if (key === "sevenzip") make("p", "Uses the official reduced standalone console binary to create true multipart 7z archives.", section);
        const actions = make("div", "", section, "actions");
        const dl = button(`Download ${title2}`, () => task(() => controller.host.native.install(key), dl), actions);
        const exe = button("Select executable", () => task(() => controller.host.native.choose(key, "executable"), exe), actions);
        const zip = button("Import ZIP", () => task(() => controller.host.native.choose(key, "zip"), zip), actions);
      }
      const history = make("details");
      make("summary", "Recent savings", history);
      const historyBody = make("div", "", history);
      const retry = button("Retry last attachment", () => {
        controller.retry?.();
        retry.className = "hidden";
      });
      retry.className = controller.retry ? "" : "hidden";
      const foot = make("div", "", root, "foot");
      make("span", "LOCAL PROCESSING \xB7 ORIGINALS KEPT", foot);
      make("span", "ClampDown 1.2.3", foot);
      let lastJobs = "", lastHistory = "";
      async function update() {
        if (closed) return;
        try {
          controller.limit(controller.host.channel?.());
        } catch {
        }
        limitLabel.textContent = controller.limitText;
        const state = await controller.host.native.status();
        if (closed) return;
        if (helperLabel) helperLabel.textContent = state.helper === "running" ? "Local helper connected" : state.helper === "starting" ? "Starting local helper\u2026" : "Local helper is stopped";
        for (const key of Object.keys(depLabels)) depLabels[key].textContent = state.dependencies[key]?.version || "Not set up";
        const signature = JSON.stringify(state.jobs);
        if (signature !== lastJobs) {
          lastJobs = signature;
          jobs.replaceChildren();
          for (const job of state.jobs) {
            const item = make("div", "", jobs, "job");
            make("div", job.name, item, "job-name");
            make("div", `${job.phase} \xB7 ${job.backend || "local"}`, item, "muted");
            const p = make("progress", "", item);
            p.max = 100;
            p.value = job.progress;
            p.setAttribute("aria-label", job.phase);
            button("Cancel", () => controller.host.native.cancel(job.id), item);
          }
        }
        const h = JSON.stringify(controller.history);
        if (h !== lastHistory) {
          lastHistory = h;
          historyBody.replaceChildren();
          if (!controller.history.length) make("p", "Savings will appear after your first compression.", historyBody, "muted");
          for (const entry of controller.history) {
            const row = make("div", "", historyBody, "history");
            make("div", entry.name, row);
            make("strong", entry.parts > 1 ? `${(entry.after / 1048576).toFixed(1)} MiB \xB7 ${entry.parts} upload-safe parts` : `${(entry.before / 1048576).toFixed(1)} \u2192 ${(entry.after / 1048576).toFixed(1)} MiB \xB7 ${Math.round((1 - entry.after / entry.before) * 100)}% smaller`, row);
            make("span", ` \xB7 ${entry.backend}`, row, "muted");
          }
        }
        retry.className = controller.retry ? "" : "hidden";
      }
      if (!embedded) root.showModal();
      update().catch((e) => {
        message.textContent = e.message;
      });
      timer = setInterval(() => {
        if (!host.isConnected) return close();
        update().catch(() => {
        });
      }, 1e3);
      return host;
    }
    module2.exports = { ICON_PATH, icon: icon2, openPanel: openPanel2, CSS, COMPOSER_CSS: COMPOSER_CSS2 };
  }
});

// src/betterdiscord.cjs
var { createNative } = require_bd_native();
var { Controller } = require_controller();
var { archiveAttachments } = require_policy();
var { icon, openPanel, COMPOSER_CSS } = require_ui();
function findExport(W, text, matches = W.Filters.byStrings(text)) {
  try {
    for (const id of Object.keys(W.modules)) {
      try {
        if (!String(W.modules[id]).includes(text)) continue;
        const raw = W.getById(id, { raw: true });
        const exports2 = raw?.exports;
        if (typeof exports2 === "function" && matches(exports2)) return { module: raw, key: "exports", value: exports2 };
        if (!exports2 || !["object", "function"].includes(typeof exports2)) continue;
        for (const key of Object.keys(exports2)) {
          try {
            const value = exports2[key];
            if (typeof value === "function" && matches(value)) return { module: exports2, key, value };
          } catch {
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return void 0;
}
function findMessageMenuChildren(root) {
  const seen = /* @__PURE__ */ new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return void 0;
    seen.add(value);
    if (value.navId === "message" && Array.isArray(value.children)) return value.children;
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = visit(child);
        if (found) return found;
      }
      return void 0;
    }
    return visit(value.props) || visit(value.children);
  };
  return visit(root);
}
module.exports = class ClampDown {
  start() {
    const api = this.api = new BdApi("ClampDown");
    const W = BdApi.Webpack;
    const currentChannel = () => W.getStore("ChannelStore")?.getChannel(W.getStore("SelectedChannelStore")?.getChannelId());
    const native = this.native = createNative(api);
    const controller = this.controller = new Controller({
      native,
      load: () => api.Data.load("settings"),
      save: (value) => api.Data.save("settings", value),
      channel: currentChannel,
      openSettings: () => openPanel(this.controller),
      notice: (text) => BdApi.UI.showToast(text, { type: "info", timeout: 6500 }),
      limit: (channel) => {
        const getLimit = findExport(W, "getUserMaxFileSize")?.value;
        const base = getLimit?.(channel?.getGuildId?.() ?? channel?.guild_id);
        const config = findExport(W, "kestrel", (value) => /getConfig/.test(String(value)) && /threshold/.test(String(value)) && /isGA/.test(String(value)))?.value;
        if (!config) throw Error("Discord's effective upload limit is unavailable");
        const state = config({ location: "web.filesExceedUploadLimits" });
        return state.enabled ? Math.max(base, state.threshold * 1048576) : base;
      }
    });
    this.menuUnpatch = api.ContextMenu?.patch?.("message", (menu, props) => {
      const attachments = archiveAttachments(props?.message);
      if (!attachments.length) return;
      const item = { id: "clampdown-download-archives", label: attachments.length === 1 ? "Download archive" : `Download all ${attachments.length} archive parts`, action: async () => {
        try {
          const saved = await native.downloadAll(attachments);
          if (saved.length) BdApi.UI.showToast(`ClampDown downloaded ${saved.length} file${saved.length === 1 ? "" : "s"}.`, { type: "success" });
        } catch (error) {
          BdApi.UI.showToast(`ClampDown: ${error.message || error}`, { type: "error" });
        }
      } };
      const children = findMessageMenuChildren(menu);
      if (!children) return;
      children.push(api.ContextMenu.buildMenuChildren([{ type: "group", items: [item] }]));
    });
    let attempts = 0;
    const attach = () => {
      const found = findExport(W, "Unexpected mismatch between files and file metadata");
      if (found) {
        api.Patcher.instead(found.module, found.key, (self, args, original) => {
          const input = args[0];
          if (!Array.isArray(input) && input && typeof input[Symbol.iterator] === "function") args[0] = Array.from(input);
          if (!controller.intercept(args[0], args[1], () => original.apply(self, args))) return original.apply(self, args);
        });
        BdApi.UI.showToast("ClampDown is active and watching oversized attachments.", { type: "success", timeout: 4e3 });
        return;
      }
      if (++attempts < 30) this.hookTimer = setTimeout(attach, 1e3);
      else BdApi.UI.showToast("ClampDown: Discord's upload hook is unavailable. Automatic compression is inactive; reload Discord or update the plugin.", { type: "error", timeout: 15e3 });
    };
    attach();
    this.buttons = /* @__PURE__ */ new Set();
    this.observer = new MutationObserver(() => this.mountButtons());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.mountButtons();
  }
  mountButtons() {
    for (const el of this.buttons) if (!el.isConnected) this.buttons.delete(el);
    for (const row of document.querySelectorAll('[class*="channelTextArea_"] [class*="buttons_"]')) {
      if (row.querySelector("[data-clampdown]")) continue;
      if (!this.buttonStyle) {
        this.buttonStyle = document.createElement("style");
        this.buttonStyle.textContent = COMPOSER_CSS;
        document.head.append(this.buttonStyle);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.clampdown = "true";
      button.title = "ClampDown \xB7 compression settings";
      button.setAttribute("aria-label", "ClampDown compression settings");
      button.append(icon());
      button.onclick = () => openPanel(this.controller);
      row.prepend(button);
      this.buttons.add(button);
    }
  }
  getSettingsPanel() {
    return openPanel(this.controller, true);
  }
  stop() {
    clearTimeout(this.hookTimer);
    this.menuUnpatch?.();
    this.observer?.disconnect();
    this.buttonStyle?.remove();
    this.buttonStyle = null;
    for (const el of this.buttons || []) el.remove();
    this.api?.Patcher.unpatchAll();
    this.controller?.closePanel?.();
    this.controller?.stop();
    this.native?.stop();
  }
};
