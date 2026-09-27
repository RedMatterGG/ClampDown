import { build } from "esbuild";
import { mkdir, copyFile, readdir, readFile, writeFile } from "node:fs/promises";
const out = "dist/vencord/clampDown.desktop";
await mkdir(out, { recursive: true });
for (const name of ["controller.cjs", "engine.cjs", "policy.cjs", "dependencies.cjs", "downloads.cjs", "ui.cjs"]) await copyFile(`src/${name}`, `${out}/${name}`);
for (const name of await readdir("src/vencord")) await copyFile(`src/vencord/${name}`, `${out}/${name}`);
const banner = `/**\n * @name ClampDown\n * @author RedMatterGG\n * @version 1.2.3\n * @description Locally fit media and multipart 7z archives to Discord's upload limit.\n * @license GPL-3.0-or-later\n */`;
const helper = await build({ entryPoints: ["src/helper.cjs"], bundle: true, platform: "node", target: "node22", format: "cjs", write: false });
await writeFile("dist/ClampDown-helper.cjs", helper.outputFiles[0].text);
await build({ entryPoints: ["src/betterdiscord.cjs"], outfile: "dist/ClampDown.plugin.js", bundle: true, platform: "node", target: "node20", format: "cjs", banner: { js: banner }, legalComments: "inline", external: ["electron"],
    plugins: [{ name: "embed-helper", setup(b) {
        b.onResolve({ filter: /^clampdown-helper-source$/ }, () => ({ path: "helper", namespace: "helper-text" }));
        b.onLoad({ filter: /.*/, namespace: "helper-text" }, () => ({ contents: helper.outputFiles[0].text, loader: "text" }));
    } }]
});
for (const name of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "TESTING.md"]) {
    try { await copyFile(name, `dist/${name}`); } catch (e) { if (e.code !== "ENOENT") throw e; }
}
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await copyFile(name, `${out}/${name}`);
console.log("Built dist/ClampDown.plugin.js and dist/vencord/clampDown.desktop");
