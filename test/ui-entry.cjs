const { Controller } = require("../src/controller.cjs");
const { openPanel, icon, COMPOSER_CSS } = require("../src/ui.cjs");
const state = { dependencies: {}, jobs: [], platform: "win32", arch: "x64", helper: "offline" };
const controller = new Controller({
    load: () => ({}), save: config => { window.saved = config; }, notice() {}, channel: () => ({ guild_id: "test" }), limit: () => 20 * 1048576,
    native: { start: async () => { state.helper = "running"; }, status: async () => state, nodeStatus: async () => ({ installed: true, version: "v24.20.0", executable: "C:\\Program Files\\nodejs\\node.exe" }), installNode: async () => ({ message: "Node.js is already installed." }), cancel: id => { state.jobs = state.jobs.filter(j => j.id !== id); }, cancelAll() {},
        install: async name => { state.dependencies[name] = { version: name === "ffmpeg" ? "FFmpeg 9.0.1" : name === "vips" ? "vips-8.18.2" : "7-Zip 26.03" }; }, choose: async () => {} }
});
const style = document.createElement("style"); style.textContent = COMPOSER_CSS; document.head.append(style);
const button = document.querySelector("#open"); button.dataset.clampdown = "true"; button.append(icon()); button.onclick = () => openPanel(controller);
window.showJobs = () => { state.jobs = [{ id: "1", name: "holiday-film.mp4", phase: "Encoding video", backend: "h264_nvenc", progress: 42 }]; };
window.openClampDown = () => openPanel(controller);
