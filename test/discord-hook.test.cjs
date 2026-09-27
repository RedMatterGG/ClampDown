const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const folder = ".test-work/discord";
test("Vencord patch selects the actual public Discord upload function, not the error helper", { skip: !fs.existsSync(folder) }, () => {
    const source = fs.readFileSync("src/vencord/index.tsx", "utf8");
    const expression = /match: \/(.+)\/,/.exec(source)[1].replaceAll("\\i", "[A-Za-z_$][\\w$]*");
    const regex = new RegExp(expression, "g");
    let found = 0;
    for (const file of fs.readdirSync(folder)) {
        const data = fs.readFileSync(path.join(folder, file), "utf8");
        if (!data.includes("Unexpected mismatch between files and file metadata")) continue;
        const matches = [...data.matchAll(regex)];
        for (const m of matches) {
            assert.ok(data.slice(m.index, m.index + 600).includes("Unexpected mismatch between files and file metadata"));
            found++;
        }
    }
    assert.equal(found, 1, "exactly one upload prompt must be patched");
});
