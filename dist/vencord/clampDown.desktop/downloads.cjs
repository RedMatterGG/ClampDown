// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const fs = require("fs");
const path = require("path");

const suffix = name => String(name).match(/\.(?:7z|zip)(?:\.\d{3,})?$/i)?.[0];
async function downloadAll(attachments, destination, fetcher = fetch) {
    if (!path.isAbsolute(destination) || !Array.isArray(attachments) || !attachments.length) throw Error("Choose a destination and at least one archive attachment.");
    const folder = path.dirname(destination);
    const names = attachments.map(attachment => path.basename(String(attachment.name || "archive-part")).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 180) || "archive-part");
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) throw Error("The message contains duplicate archive filenames.");
    const firstSuffix = suffix(names[0]), sourceStem = firstSuffix && names[0].slice(0, -firstSuffix.length);
    const selected = path.basename(destination).replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 180) || names[0];
    const selectedSuffix = suffix(selected), selectedStem = selectedSuffix ? selected.slice(0, -selectedSuffix.length) : selected;
    if (firstSuffix && names.every(name => suffix(name) && name.slice(0, -suffix(name).length).toLowerCase() === sourceStem.toLowerCase())) {
        for (let index = 0; index < names.length; index++) names[index] = `${selectedStem}${suffix(names[index])}`;
    } else names[0] = selected;
    let targets;
    for (let attempt = 0; attempt < 1000; attempt++) {
        const candidates = names.map(name => attempt ? name.replace(/^(.*?)(\.(?:7z|zip))(\.\d{3,})?$/i, `$1 (${attempt})$2$3`) : name).map(name => path.join(folder, name));
        const occupied = candidates.map(target => fs.existsSync(target));
        if (!occupied.some(Boolean)) { targets = candidates; break; }
    }
    if (!targets) throw Error("Could not find unused archive filenames in that folder.");
    const saved = [];
    for (let index = 0; index < attachments.length; index++) {
        const attachment = attachments[index];
        const url = new URL(attachment.url);
        if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) throw Error("Refusing a non-Discord attachment URL.");
        const filename = path.basename(targets[index]);
        const response = await fetcher(url.href, { timeout: 5 * 60 * 1000, maxRedirects: 0, redirect: "error" });
        if (!response.ok) throw Error(`Could not download ${filename}: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 1024 ** 3) throw Error(`Invalid attachment size for ${filename}.`);
        await new Promise((resolve, reject) => fs.writeFile(targets[index], bytes, { flag: "wx" }, error => error ? reject(error) : resolve())); saved.push(targets[index]);
    }
    return saved;
}
module.exports = { downloadAll };
