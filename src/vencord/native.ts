// SPDX-License-Identifier: GPL-3.0-or-later
import { app, dialog } from "electron";
import { join } from "path";
import { Engine } from "./engine.cjs";
import { install as installDependency } from "./dependencies.cjs";
import { downloadAll as saveAttachments } from "./downloads.cjs";

const engine = new Engine(join(app.getPath("userData"), "ClampDown"));
export async function compress(_: unknown, request: any) { return engine.compress(request); }
export async function archive(_: unknown, request: any) { return engine.archive(request); }
export async function status(_: unknown) { return engine.status(); }
export async function cancel(_: unknown, id: string) { engine.cancel(id); }
export async function cancelAll(_: unknown) { engine.cancelAll(); }
export async function install(_: unknown, name: string) { return installDependency(engine, name); }
export async function choose(_: unknown, name: string, kind: string) {
    if (!["ffmpeg", "vips", "sevenzip"].includes(name) || !["zip", "executable"].includes(kind)) throw Error("Invalid dependency selection.");
    const result = await dialog.showOpenDialog({ title: `Select ${name} ${kind}`, filters: kind === "zip" ? [{ name: "ZIP archive", extensions: ["zip"] }] : undefined, properties: ["openFile"] });
    if (result.canceled || !result.filePaths[0]) return;
    return kind === "zip" ? installDependency(engine, name, { archive: result.filePaths[0] }) : engine.configure(name, result.filePaths[0]);
}
export async function downloadAll(_: unknown, attachments: any[]) {
    const result = await dialog.showSaveDialog({ title: "Download all archive parts", defaultPath: join(app.getPath("downloads"), attachments[0].name), showOverwriteConfirmation: true });
    if (result.canceled || !result.filePath) return [];
    return saveAttachments(attachments, result.filePath);
}
