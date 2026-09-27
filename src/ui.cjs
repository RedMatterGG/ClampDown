// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const ICON_PATH = "M7 2a5 5 0 0 0-5 5v7a5 5 0 0 0 5 5h8v-3H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12V2H7Zm3 5h4l2 2h5v5H10V7Zm4 12h3v2h4v2H9v-2h5v-2Z";
// Matches Discord's shared chat-button and composer CSS (September 2026).
const COMPOSER_CSS = `
button[data-clampdown]{box-sizing:border-box;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;min-width:var(--space-32,32px);min-height:var(--space-32,32px);padding:0;margin-inline:0;border:0;border-radius:8px;background:transparent;color:var(--interactive-text-default,var(--interactive-normal,#b5bac1));cursor:pointer;transition:background-color .2s ease,color .2s ease}
button[data-clampdown]:hover{background-color:var(--interactive-background-selected,var(--background-modifier-selected,#404249));color:var(--interactive-text-hover,var(--interactive-hover,#dbdee1))}
button[data-clampdown]:active{color:var(--interactive-text-active,var(--interactive-active,#fff))}
button[data-clampdown] svg{display:block;width:20px;height:20px;color:inherit}
button[data-clampdown]:focus-visible{outline:2px solid var(--focus-primary,#00a8fc);outline-offset:2px}
@media(prefers-reduced-motion:reduce){button[data-clampdown]{transition:none}}
`;
const CSS = `
:host{font:14px/1.5 var(--font-primary,gg sans,Inter,system-ui,sans-serif);color:var(--text-normal,#e6e6ee);color-scheme:dark}
*{box-sizing:border-box}dialog{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 64px);padding:0;border:1px solid var(--background-modifier-accent,#383841);border-radius:18px;background:var(--background-primary,#202024);color:inherit;box-shadow:0 24px 90px #0008;overflow:auto}dialog::backdrop{background:#08090db0;backdrop-filter:blur(3px)}
.panel{padding:26px}header{display:flex;align-items:center;gap:12px;margin-bottom:24px}.mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#5865f220;color:#a4acff}.mark svg{width:28px;height:28px}h1{font-size:22px;letter-spacing:-.5px;margin:0;line-height:1.15}.subtitle,.muted{font-size:12px;color:var(--text-muted,#a4a4b4)}.subtitle{margin-top:4px}.spacer{flex:1}button,input,select{font:inherit}button{cursor:pointer;border:1px solid var(--background-modifier-accent,#41414c);border-radius:8px;padding:8px 12px;background:var(--background-secondary,#2b2b32);color:inherit;transition:background .12s}button:hover{background:var(--background-modifier-hover,#3a3a45)}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #a4acff;outline-offset:3px}button:disabled{cursor:wait;opacity:.55}.close{font-size:22px;background:none;border:0;padding:2px 9px}.status{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:var(--background-secondary,#29292f);font-size:12px;margin:0 0 22px}.dot{width:7px;height:7px;border-radius:50%;background:#56c99b}.row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:16px 0}.row label{font-weight:600}.row p{margin:2px 0;font-size:12px;color:var(--text-muted,#a4a4b4)}input[type=checkbox]{accent-color:#7985ff;width:19px;height:19px}.section-label{display:block;margin:21px 0 9px;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-muted,#a4a4b4)}.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.presets button{text-align:left;padding:12px 13px}.presets strong,.presets small{display:block}.presets small{font-size:11px;color:var(--text-muted,#a4a4b4);margin-top:3px}.presets button[aria-pressed=true]{background:#5865f223;border-color:#818cf8;box-shadow:inset 0 0 0 1px #818cf8}.presets button[aria-pressed=true] strong{color:#b5bdff}details{border-top:1px solid var(--background-modifier-accent,#383841);margin-top:24px;padding-top:16px}summary{font-weight:600;cursor:pointer;list-style-position:inside}select,input[type=number]{border:1px solid var(--background-modifier-accent,#41414c);border-radius:7px;background:var(--input-background,#17171c);color:inherit;padding:8px;width:190px;max-width:50%}input[type=number]{width:110px}.dep{padding:14px 0;border-bottom:1px solid var(--background-modifier-accent,#383841)}.dep-title{display:flex;gap:10px;align-items:center}.badge{font-size:10px;letter-spacing:.5px;padding:2px 6px;background:#5865f225;color:#b5bdff;border-radius:4px}.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.actions button{font-size:12px}.dep p{font-size:12px;color:var(--text-muted,#a4a4b4)}a{color:#a4acff}.message{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#ffca8a;margin-top:12px}.job{padding:12px 0}.job-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:13px}progress{width:100%;accent-color:#8794ff;height:6px;display:block;margin:9px 0}.foot{margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted,#a4a4b4)}.history{font-size:12px;padding:8px 0}.history strong{color:#70d9b0}.hidden{display:none} @media(prefers-reduced-motion:reduce){*{transition:none!important}}`;
function icon(doc = document) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "24"); svg.setAttribute("height", "24"); svg.setAttribute("aria-hidden", "true");
    const p = doc.createElementNS(svg.namespaceURI, "path"); p.setAttribute("d", ICON_PATH); p.setAttribute("fill", "currentColor"); svg.append(p); return svg;
}
function openPanel(controller, embedded = false) {
    if (!embedded && controller.closePanel) controller.closePanel();
    const host = document.createElement("div"), shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style"); style.textContent = CSS; shadow.append(style);
    const root = document.createElement(embedded ? "div" : "dialog"); root.className = "panel"; shadow.append(root);
    if (!embedded) document.body.append(host);
    const make = (tag, text, parent = root, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; parent.append(el); return el; };
    const button = (label, fn, parent = root) => { const el = make("button", label, parent); el.type = "button"; el.addEventListener("click", fn); return el; };
    const header = make("header"); make("div", "", header, "mark").append(icon());
    const title = make("div", "", header); const heading = make("h1", "ClampDown", title); heading.id = "cd-title"; root.setAttribute("aria-labelledby", heading.id);
    make("div", "A little smaller. Ready to share.", title, "subtitle"); make("div", "", header, "spacer");
    let timer, closed = false;
    const previous = document.activeElement;
    const close = () => { if (closed) return; closed = true; clearInterval(timer); if (!embedded) { root.close(); host.remove(); previous?.focus?.(); } if (controller.closePanel === close) controller.closePanel = null; };
    if (!embedded) { const x = button("×", close, header); x.className = "close"; x.setAttribute("aria-label", "Close ClampDown"); controller.closePanel = close; root.addEventListener("cancel", close); root.addEventListener("click", e => { if (e.target === root) { const r = root.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }); }
    const status = make("div", "", root, "status"); make("span", "", status, "dot");
    try { controller.limit(controller.host.channel?.()); } catch {}
    const limitLabel = make("span", controller.limitText, status);
    const toggle = make("div", "", root, "row"), tl = make("label", "Automatic compression", toggle); tl.htmlFor = "pd-enabled";
    const enabled = make("input", "", toggle); enabled.id = "pd-enabled"; enabled.type = "checkbox"; enabled.checked = controller.config.enabled; enabled.onchange = () => controller.save({ enabled: enabled.checked });
    for (const [key, label] of [["videoPreset", "Video"], ["imagePreset", "Images"]]) {
        make("span", label, root, "section-label"); const group = make("div", "", root, "presets"); group.setAttribute("role", "group"); group.setAttribute("aria-label", `${label} compression preset`);
        for (const [value, label, hint] of [["fast", "Fast", "Less waiting"], ["balanced", "Balanced", "The everyday choice"], ["slow", "Slow", "More detail per byte"]]) {
            const b = button("", () => { controller.save({ [key]: value }); for (const sibling of group.children) sibling.setAttribute("aria-pressed", String(sibling === b)); }, group); b.setAttribute("aria-pressed", String(controller.config[key] === value)); make("strong", label, b); make("small", hint, b);
        }
    }
    make("span", "Other files · multipart 7z", root, "section-label");
    const archiveToggle = make("div", "", root, "row"), archiveText = make("div", "", archiveToggle); const archiveLabel = make("label", "Archive oversized non-media files", archiveText); archiveLabel.htmlFor = "pd-archiveFiles"; make("p", "Creates .7z.001, .7z.002… parts below Discord's current limit.", archiveText);
    const archiveFiles = make("input", "", archiveToggle); archiveFiles.id = "pd-archiveFiles"; archiveFiles.type = "checkbox"; archiveFiles.checked = controller.config.archiveFiles; archiveFiles.onchange = () => controller.save({ archiveFiles: archiveFiles.checked });
    const archiveGroup = make("div", "", root, "presets"); archiveGroup.setAttribute("role", "group"); archiveGroup.setAttribute("aria-label", "Archive compression preset");
    for (const [value, label, hint] of [["1", "Fast", "Lowest CPU use"], ["5", "Balanced", "Good default"], ["9", "Ultra", "Smallest output"]]) {
        const b = button("", () => { controller.save({ archiveLevel: value }); for (const sibling of archiveGroup.children) sibling.setAttribute("aria-pressed", String(sibling === b)); }, archiveGroup); b.setAttribute("aria-pressed", String(controller.config.archiveLevel === value)); make("strong", label, b); make("small", hint, b);
    }
    const jobs = make("div"); jobs.setAttribute("aria-live", "polite");
    const message = make("div", "", root, "message"); message.setAttribute("role", "status");
    async function task(fn, btn) { if (btn) btn.disabled = true; message.textContent = "Working…"; try { await fn(); message.textContent = "Ready. Settings are saved automatically."; await update(); } catch (e) { message.textContent = e.message; } finally { if (btn) btn.disabled = false; } }
    const advanced = make("details"); make("summary", "Advanced settings", advanced);
    function select(key, label, options, hint) {
        const row = make("div", "", advanced, "row"), text = make("div", "", row); const l = make("label", label, text); l.htmlFor = `pd-${key}`; if (hint) make("p", hint, text);
        const s = make("select", "", row); s.id = `pd-${key}`; for (const [value, title] of options) { const o = make("option", title, s); o.value = value; } s.value = controller.config[key]; s.onchange = () => controller.save({ [key]: s.value });
    }
    select("codec", "Video codec", [["h264", "H.264 · most compatible"], ["hevc", "H.265 / HEVC"]]);
    select("hardware", "Video encoder", [["auto", "Auto · GPU, then CPU"], ["cpu", "CPU"], ["nvidia", "NVIDIA NVENC"], ["intel", "Intel Quick Sync"], ["amd", "AMD AMF"]], "Unavailable GPUs fall back to CPU.");
    select("imageFormat", "Image output", [["webp", "WebP"], ["jpg", "JPEG"], ["png", "PNG"], ["gif", "GIF"], ["avif", "AVIF"]], "Animation is preserved where supported.");
    select("imageBackend", "Image processor", [["auto", "Auto · libvips preferred"], ["vips", "libvips only"], ["ffmpeg", "FFmpeg"]]);
    for (const [key, title, hint, min, max] of [["maxHeight", "Video height", "Maximum pixels; never upscaled.", 144, 2160], ["audioKbps", "Audio bitrate", "AAC · kilobits per second", 32, 192], ["targetMiB", "Target size", "MiB · 0 follows Discord automatically", 0, 500], ["archiveDictionaryMiB", "7-Zip dictionary", "MiB · larger can compress better but uses more memory", 4, 256], ["archiveThreads", "7-Zip CPU threads", "0 selects threads automatically", 0, 32], ["archivePartPercent", "Archive part size", "% of the effective upload limit", 80, 98]]) {
        const row = make("div", "", advanced, "row"), text = make("div", "", row); const l = make("label", title, text); l.htmlFor = `pd-${key}`; make("p", hint, text);
        const input = make("input", "", row); input.type = "number"; input.min = min; input.max = max; input.step = key === "targetMiB" ? "0.1" : "1"; input.value = controller.config[key]; input.id = `pd-${key}`; input.onchange = () => { controller.save({ [key]: Number(input.value) }); input.value = controller.config[key]; };
    }
    const dependencies = make("details"); make("summary", "Dependencies & setup", dependencies);
    let helperLabel;
    if (controller.host.native.start) {
        helperLabel = make("p", "Checking local helper…", dependencies, "muted");
        make("p", "BetterDiscord needs a separate local process to run encoders. Start it here once; Node.js 22 or newer is required. It runs hidden, accepts only authenticated requests on this computer, and exits when ClampDown is disabled or after 10 idle minutes.", dependencies, "muted");
        const start = button("Start local helper", () => { helperLabel.textContent = "Starting local helper…"; task(() => controller.host.native.start(), start); }, dependencies);
        const nodeLabel = make("p", "Node.js has not been checked yet.", dependencies, "muted");
        const nodeActions = make("div", "", dependencies, "actions");
        const checkNode = button("Check Node.js", () => task(async () => { const state = await controller.host.native.nodeStatus(); nodeLabel.textContent = state.installed ? `Node.js ${state.version || "installed"} · ${state.executable}` : "Node.js was not found."; }, checkNode), nodeActions);
        const installNode = button("Download & install Node.js", () => task(async () => { const result = await controller.host.native.installNode(); nodeLabel.textContent = result.message; }, installNode), nodeActions);
    }
    make("p", "FFmpeg, libvips, and 7-Zip are separate third-party programs. Download buttons fetch pinned upstream builds, verify SHA-256, and install locally. Files never leave your computer during processing.", dependencies, "muted");
    const depLabels = {};
    for (const [key, title, url, license] of [["ffmpeg", "FFmpeg", "https://ffmpeg.org/legal.html", "Build-dependent LGPL/GPL"], ["vips", "libvips", "https://github.com/libvips/libvips", "LGPL-2.1-or-later + bundled dependency notices"], ["sevenzip", "7-Zip", "https://www.7-zip.org/", "LGPL-2.1-or-later + BSD/unRAR notices"]]) {
        const section = make("div", "", dependencies, "dep"), titleRow = make("div", "", section, "dep-title"); make("strong", title, titleRow); depLabels[key] = make("span", "Checking…", titleRow, "badge");
        const p = make("p", "", section), a = make("a", license, p); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
        if (key === "vips") make("p", "Official prebuilt Windows packages are available for x64, ARM64, and x86. ClampDown downloads and verifies the matching archive automatically.", section);
        if (key === "sevenzip") make("p", "Uses the official reduced standalone console binary to create true multipart 7z archives.", section);
        const actions = make("div", "", section, "actions");
        const dl = button(`Download ${title}`, () => task(() => controller.host.native.install(key), dl), actions);
        const exe = button("Select executable", () => task(() => controller.host.native.choose(key, "executable"), exe), actions);
        const zip = button("Import ZIP", () => task(() => controller.host.native.choose(key, "zip"), zip), actions);
    }
    const history = make("details"); make("summary", "Recent savings", history); const historyBody = make("div", "", history);
    const retry = button("Retry last attachment", () => { controller.retry?.(); retry.className = "hidden"; }); retry.className = controller.retry ? "" : "hidden";
    const foot = make("div", "", root, "foot"); make("span", "LOCAL PROCESSING · ORIGINALS KEPT", foot); make("span", "ClampDown 1.2.3", foot);
    let lastJobs = "", lastHistory = "";
    async function update() {
        if (closed) return;
        try { controller.limit(controller.host.channel?.()); } catch {}
        limitLabel.textContent = controller.limitText;
        const state = await controller.host.native.status(); if (closed) return;
        if (helperLabel) helperLabel.textContent = state.helper === "running" ? "Local helper connected" : state.helper === "starting" ? "Starting local helper…" : "Local helper is stopped";
        for (const key of Object.keys(depLabels)) depLabels[key].textContent = state.dependencies[key]?.version || "Not set up";
        const signature = JSON.stringify(state.jobs); if (signature !== lastJobs) {
            lastJobs = signature; jobs.replaceChildren();
            for (const job of state.jobs) {
                const item = make("div", "", jobs, "job"); make("div", job.name, item, "job-name"); make("div", `${job.phase} · ${job.backend || "local"}`, item, "muted");
                const p = make("progress", "", item); p.max = 100; p.value = job.progress; p.setAttribute("aria-label", job.phase);
                button("Cancel", () => controller.host.native.cancel(job.id), item);
            }
        }
        const h = JSON.stringify(controller.history); if (h !== lastHistory) { lastHistory = h; historyBody.replaceChildren();
            if (!controller.history.length) make("p", "Savings will appear after your first compression.", historyBody, "muted");
            for (const entry of controller.history) { const row = make("div", "", historyBody, "history"); make("div", entry.name, row); make("strong", entry.parts > 1 ? `${(entry.after / 1048576).toFixed(1)} MiB · ${entry.parts} upload-safe parts` : `${(entry.before / 1048576).toFixed(1)} → ${(entry.after / 1048576).toFixed(1)} MiB · ${Math.round((1 - entry.after / entry.before) * 100)}% smaller`, row); make("span", ` · ${entry.backend}`, row, "muted"); }
        }
        retry.className = controller.retry ? "" : "hidden";
    }
    if (!embedded) root.showModal();
    update().catch(e => { message.textContent = e.message; });
    timer = setInterval(() => { if (!host.isConnected) return close(); update().catch(() => {}); }, 1000);
    return host;
}
module.exports = { ICON_PATH, icon, openPanel, CSS, COMPOSER_CSS };
