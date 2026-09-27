const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Engine, run } = require("../src/engine.cjs");
const { install } = require("../src/dependencies.cjs");
const engine = new Engine(path.resolve(".test-work/native"));
const enabled = require("node:fs").existsSync(path.join(engine.root, "dependencies.json"));
test("real FFmpeg: H.264/H.265, images, animated GIF, size fitting, cleanup", { skip: !enabled, timeout: 180000 }, async () => {
    const ffmpeg = (await engine.paths()).ffmpeg.path;
    const dir = await fs.mkdtemp(path.join(engine.root, "fixture-"));
    try {
        const video = path.join(dir, "clip.mp4");
        await run(ffmpeg, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3", "-c:v", "libx264", "-crf", "8", "-c:a", "aac", video]);
        const bytes = new Uint8Array(await fs.readFile(video));
        for (const codec of ["h264", "hevc"]) {
            const result = await engine.compress({ bytes, name: "SPOILER_clip.mp4", type: "video/mp4", limit: 90000, settings: { codec, hardware: "cpu", videoPreset: "fast" } });
            assert.ok(result.bytes.length < 90000 * .96); assert.match(result.name, /^SPOILER_/);
            const out = path.join(dir, codec + ".mp4"); await fs.writeFile(out, result.bytes);
            const probe = await engine.probe(ffmpeg, out, {});
            assert.equal(probe.streams.find(s => s.codec_type === "video").codec_name, codec);
            assert.ok(Number(probe.format.duration) >= 2.9);
            console.log(`${codec}: ${bytes.length} → ${result.bytes.length} bytes`);
        }
        const png = path.join(dir, "still.png");
        await run(ffmpeg, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=1600x900", "-frames:v", "1", png]);
        const pixels = new Uint8Array(await fs.readFile(png));
        for (const imageFormat of ["webp", "jpg", "png", "gif", "avif"]) {
            const result = await engine.compress({ bytes: pixels, name: "still.png", type: "image/png", limit: 20000, settings: { imageFormat, imageBackend: "ffmpeg", imagePreset: "fast" } });
            assert.ok(result.bytes.length <= 19200); assert.match(result.name, new RegExp(`\\.${imageFormat}$`));
            console.log(`${imageFormat}: ${pixels.length} → ${result.bytes.length} bytes`);
        }
        const gif = path.join(dir, "animated.gif");
        await run(ffmpeg, ["-hide_banner", "-y", "-i", video, "-vf", "fps=8,scale=320:-1", gif]);
        const animation = new Uint8Array(await fs.readFile(gif));
        const result = await engine.compress({ bytes: animation, name: "animated.gif", limit: 90000, settings: { imageFormat: "gif", imageBackend: "ffmpeg", imagePreset: "fast" } });
        const out = path.join(dir, "out.gif"); await fs.writeFile(out, result.bytes); const probe = await engine.probe(ffmpeg, out, {});
        assert.ok(Number(probe.streams[0].nb_frames) > 1, "must preserve animation");
        assert.equal((await engine.status()).jobs.length, 0);
        assert.equal((await fs.readdir(engine.root)).filter(s => s.startsWith("job-")).length, 0);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

const vipsRoot = path.resolve(".test-work/vips-native");
test("real libvips: official Windows build fits still-image formats", { skip: !enabled || !require("node:fs").existsSync(path.join(vipsRoot, "dependencies.json")), timeout: 60000 }, async () => {
    const ffmpeg = (await engine.paths()).ffmpeg.path;
    const vips = (await new Engine(vipsRoot).paths()).vips.path;
    const root = await fs.mkdtemp(path.join(require("node:os").tmpdir(), "pd-vips-"));
    const local = new Engine(root); await local.configure("vips", vips);
    try {
        const inputPath = path.join(root, "source.png");
        await run(ffmpeg, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=1600x900", "-frames:v", "1", inputPath]);
        const bytes = new Uint8Array(await fs.readFile(inputPath));
        for (const imageFormat of ["jpg", "png", "webp", "avif"]) {
            const result = await local.compress({ bytes, name: "source.png", type: "image/png", limit: 20000, settings: { imageFormat, imageBackend: "vips", imagePreset: "fast" } });
            assert.ok(result.bytes.length <= 19200); assert.equal(result.backend, "libvips");
        }
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

const sevenZip = path.resolve(".test-work/7zip/7zr.exe");
test("real 7-Zip: arbitrary files become valid upload-sized multipart archives", { skip: !require("node:fs").existsSync(sevenZip), timeout: 60000 }, async () => {
    const root = await fs.mkdtemp(path.join(require("node:os").tmpdir(), "clampdown-7zip-")); const local = new Engine(root);
    try {
        await local.configure("sevenzip", sevenZip);
        const source = require("node:crypto").randomBytes(350000);
        const result = await local.archive({ bytes: new Uint8Array(source), name: "SPOILER_project.blend", limit: 100000, settings: { archiveLevel: "5", archivePartPercent: 90, archiveDictionaryMiB: 16 } });
        assert.ok(result.parts.length >= 4); assert.ok(result.parts.every(part => part.bytes.length <= 90000));
        const output = path.join(root, "parts"); await fs.mkdir(output);
        for (const part of result.parts) await fs.writeFile(path.join(output, part.name), part.bytes);
        const extracted = path.join(root, "extracted"); await fs.mkdir(extracted);
        await run(sevenZip, ["x", path.join(output, result.parts[0].name), `-o${extracted}`, "-y"]);
        assert.deepEqual(await fs.readFile(path.join(extracted, "SPOILER_project.blend")), source);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("official 7-Zip download is checksum-verified, installed, and executable", { skip: !process.env.CLAMPDOWN_TEST_7ZIP_DOWNLOAD, timeout: 60000 }, async () => {
    await fs.mkdir(path.resolve(".test-work"), { recursive: true }); const root = await fs.mkdtemp(path.resolve(".test-work/sevenzip-download-"));
    try { const result = await install(new Engine(root), "sevenzip"); assert.match(result.version, /7-Zip.*26\.03/); assert.equal(await fs.stat(result.path).then(stat => stat.isFile()), true); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
});
