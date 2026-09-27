// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const { settings, kind } = require("./policy.cjs");
class Controller {
    constructor(host) { this.host = host; this.config = settings(host.load()); this.ready = new WeakSet(); this.pending = new WeakSet(); this.active = true; this.history = []; this.tail = Promise.resolve(); this.limitText = "Waiting for a channel"; this.closePanel = null; }
    save(values) { this.config = settings({ ...this.config, ...values }); this.host.save(this.config); }
    limit(channel) {
        let value;
        try { value = this.host.limit(channel); } catch {}
        if (Number.isSafeInteger(value) && value >= 1024 && value <= 2 ** 31) { this.limitText = `${(value / 1048576).toFixed(1)} MiB · Discord`; return value; }
        if (this.config.targetMiB > 0) { this.limitText = `${this.config.targetMiB} MiB · manual target`; return Math.floor(this.config.targetMiB * 1048576); }
        this.limitText = "Discord limit unavailable · choose a manual target";
        throw Error(this.limitText);
    }
    intercept(files, channel, resume) {
        if (!this.active || !this.config.enabled || !Array.isArray(files) || !files.length || this.ready.has(files)) { this.ready.delete(files); return false; }
        if (this.pending.has(files)) return true;
        if (!files.some(f => f instanceof File && (kind(f) || this.config.archiveFiles))) return false;
        let limit;
        try { limit = this.limit(channel); } catch (e) { this.host.notice(e.message); return false; }
        const trigger = Math.min(limit, this.config.targetMiB > 0 ? this.config.targetMiB * 1048576 : limit);
        if (!files.some(f => f.size > trigger && (kind(f) || this.config.archiveFiles))) return false;
        const original = files.slice();
        this.pending.add(files);
        const config = { ...this.config };
        this.host.notice("ClampDown is preparing your attachment. Open the clamp icon for progress.");
        this.tail = this.tail.catch(() => {}).then(async () => {
            if (!this.active) return;
            const results = [];
            try {
                for (let i = 0; i < original.length; i++) {
                    const file = original[i];
                    if (file.size <= trigger || (!kind(file) && !config.archiveFiles)) { results.push(file); continue; }
                    if (file.size > 1024 ** 3) throw Error("Files larger than 1 GiB need to be trimmed first");
                    const request = { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type, limit, settings: config };
                    const out = kind(file) ? await this.host.native.compress(request) : await this.host.native.archive(request);
                    if (!this.active) return;
                    const prepared = out.parts || [out];
                    results.push(...prepared.map(part => new File([part.bytes], part.name, { type: part.type, lastModified: file.lastModified })));
                    this.history.unshift({ name: out.baseName || out.name, before: file.size, after: prepared.reduce((sum, part) => sum + part.bytes.length, 0), backend: out.backend, parts: prepared.length }); this.history.length = Math.min(5, this.history.length);
                }
                if (!this.active) return;
                files.splice(0, files.length, ...results);
                this.ready.add(files); resume();
                this.host.notice("ClampDown: ready to send.");
            } catch (e) {
                this.host.notice(`ClampDown: ${e.message}. Your original files were kept.`);
                this.retry = () => { this.retry = null; this.intercept(files, channel, resume); };
                if (/Set up |FFprobe must/.test(e.message)) this.host.openSettings?.();
            } finally { this.pending.delete(files); }
        });
        return true;
    }
    stop() { this.active = false; this.host.native.cancelAll(); }
}
module.exports = { Controller };
