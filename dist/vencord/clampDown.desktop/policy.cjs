// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const DEFAULTS = Object.freeze({ enabled: true, archiveFiles: true, videoPreset: "balanced", imagePreset: "balanced", archiveLevel: "5", codec: "h264", hardware: "auto", imageFormat: "webp", maxHeight: 1080, audioKbps: 96, targetMiB: 0, archiveDictionaryMiB: 64, archiveThreads: 0, archivePartPercent: 96, imageBackend: "auto" });
const PRESETS = Object.freeze({ fast: { cpu: "veryfast", quality: 76, edge: 1920, fps: 30 }, balanced: { cpu: "medium", quality: 84, edge: 2560, fps: 30 }, slow: { cpu: "slow", quality: 90, edge: 3840, fps: 60 } });
function settings(value = {}) {
    const out = { ...DEFAULTS };
    for (const [key, choices] of Object.entries({ videoPreset: Object.keys(PRESETS), imagePreset: Object.keys(PRESETS), archiveLevel: ["0", "1", "3", "5", "7", "9"], codec: ["h264", "hevc"], hardware: ["auto", "cpu", "nvidia", "intel", "amd"], imageFormat: ["webp", "jpg", "png", "gif", "avif"], imageBackend: ["auto", "vips", "ffmpeg"] })) if (choices.includes(value[key])) out[key] = value[key];
    for (const [key, min, max] of [["maxHeight", 144, 2160], ["audioKbps", 32, 192], ["targetMiB", 0, 500], ["archiveDictionaryMiB", 4, 256], ["archiveThreads", 0, 32], ["archivePartPercent", 80, 98]]) if (Number.isFinite(value[key])) { const bounded = Math.min(max, Math.max(min, value[key])); out[key] = key === "targetMiB" ? bounded : Math.round(bounded); }
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
    const audio = Math.min(audioKbps * 1000, Math.floor(total * 0.2));
    const video = total - audio;
    if (video < 24000) throw Error("This video is too long for the upload limit. Trim it before attaching.");
    return { audio: Math.max(8000, audio), video };
}
function archiveAttachments(message) {
    const source = message?.attachments?.toArray?.() || message?.attachments || [];
    return Array.from(source).filter(a => /\.(?:7z|zip)(?:\.\d{3,})?$/i.test(a?.filename || "") && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(a?.url || "")).map(a => ({ name: a.filename, url: a.url, size: a.size }));
}
module.exports = { DEFAULTS, PRESETS, settings, targetBytes, archivePartBytes, kind, bitrate, archiveAttachments };
