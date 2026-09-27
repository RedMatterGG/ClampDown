// Fetch public client code for upload-hook compatibility checks; no account/session access.
import { mkdir, writeFile } from "node:fs/promises";
const root = new URL("../.test-work/discord/", import.meta.url);
await mkdir(root, { recursive: true });
const response = await fetch("https://discord.com/app");
if (!response.ok) throw Error(`Discord HTTP ${response.status}`);
const html = await response.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => new URL(m[1], "https://discord.com").href);
console.log(`Public app references ${scripts.length} scripts`);
for (const url of scripts) {
    const data = await (await fetch(url)).text();
    await writeFile(new URL(url.split("/").pop(), root), data);
    for (const marker of ["Unexpected mismatch between files and file metadata", "getUserMaxFileSize"]) {
        const index = data.indexOf(marker); if (index >= 0) console.log(url, marker, data.slice(Math.max(0, index - 1500), index + 800));
    }
}
