# ClampDown

Local attachment preparation for **Vencord desktop** and **BetterDiscord**. ClampDown checks Discord's current upload limit, compresses oversized media, and splits other oversized files into multipart 7z archives before returning everything to the attachment composer for you to review and send.


## Install on Windows


### BetterDiscord

Copy `dist/ClampDown.plugin.js` into your BetterDiscord plugins folder and enable **ClampDown** (Recommended). Alternatively, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-betterdiscord.ps1
```
Disclaimer:
BetterDiscord provides a limited module interface rather than full Node.js. ClampDown therefore embeds its local helper inside the single plugin file and writes it automatically when started.
Use **Dependencies & setup → Check Node.js**, or download the pinned official Node.js LTS installer from the adjacent button. Then click **Start local helper**. After setup, compression restarts the helper as needed; disabling ClampDown stops it, and it exits after ten idle minutes.

The helper listens only on `127.0.0.1`, uses a random per-run authentication token, and rejects requests with an Origin header. 
Requests use BetterDiscord's native networking API.
If Windows Script Host is disabled, the panel gives a command to start the helper manually.

### Vencord (Not properly tested as i do not use Vencord that much)

Run this from an extracted ClampDown project/release:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-vencord.ps1
```

The script needs Git and Node.js 22 or later. It creates a dedicated Vencord source checkout under `%LOCALAPPDATA%\ClampDown\Vencord`, copies the plugin, installs Vencord's locked dependencies, builds the desktop client, and runs Vencord's official installer. The official installer may need you to select your Discord installation. Restart Discord and enable **ClampDown** under Settings → Vencord → Plugins.

Use `-VencordPath F:\your\Vencord` for an existing checkout, or `-BuildOnly` to build without injecting. Existing ClampDown files are backed up before replacement. Vencord updates can replace custom builds; rerun this script to rebuild with ClampDown.

Manual installation: copy `dist/vencord/clampDown.desktop` into your Vencord checkout's `src/userplugins/`, then follow Vencord's normal build and injection steps. Browser Vencord cannot run local encoders and is intentionally excluded.

## First use

1. Open the clamp icon beside the message-box actions, or open ClampDown's plugin settings.
2. Expand **Dependencies & setup**. In BetterDiscord, first click **Start local helper**. Download FFmpeg/libvips for media and the pinned standalone 7-Zip binary for arbitrary files, or select existing executables. Keep `ffprobe` beside `ffmpeg`; the complete FFmpeg archive includes both.
3. Leave Automatic compression enabled. Attach an oversized file. ClampDown prepares it and returns the result to Discord's attachment composer. You choose when to send.
4. When a received message contains `.7z`, `.zip`, or multipart archive attachments, right-click that message and choose **Download archive** or **Download all … archive parts**. ClampDown asks for a folder and never overwrites an existing file.

Dependencies are optional and separately obtained. Download buttons explicitly identify the third-party program, use pinned versions, verify SHA-256, and preserve archive notices. Existing executables and separate ZIP archives are supported for each dependency. Imported executables are run to validate them.

**Windows image backend:** ClampDown uses libvips 8.18.2 instead of oximg. Official prebuilt Windows ZIPs are pinned for x64, ARM64, and x86, checksum-verified, and installed locally from the setup panel. Automatic mode prefers libvips for still images and uses FFmpeg for animation or as a fallback.

## Compression behavior

| Setting | Behavior |
| --- | --- |
| Upload limit | Reads Discord's current account/server size function for every batch; never guesses based on Nitro tier |
| Target size | `0` follows Discord; a manual MiB value can only lower a known limit, or supply a target if Discord's function is unavailable |
| Video | MP4 with H.264 or H.265, AAC audio, browser-compatible pixel format, fast-start metadata |
| GPU | NVIDIA NVENC, Intel Quick Sync, AMD AMF; attempts supported encoders and falls back to CPU on initialization/encode failure |
| CPU | FFmpeg libx264/libx265; preset controls encoding effort |
| Images | JPEG, PNG, WebP, GIF, AVIF; repeated quality/resolution fitting to a byte budget |
| Animated GIF/APNG | FFmpeg preserves animation; GIF or animated WebP output. Incompatible selected still formats become GIF |
| Animated WebP | Oversized animated WebP is refused with an explanation when it cannot be resized without losing animation |
| Transparency | Use WebP, PNG, GIF, or AVIF when transparency matters; JPEG cannot retain it |
| Other files | 7-Zip LZMA2 archive split into `.7z.001`, `.7z.002`, … volumes, each sized from the effective Discord allowance |
| Archive controls | Fast/Balanced/Ultra level, 4–256 MiB dictionary, automatic or fixed CPU threads, and 80–98% per-part limit |

ClampDown leaves a 4% default margin beneath the selected size limit; archive headroom is configurable. It verifies every result before replacing attachments. Batches are sequential to control CPU and memory use; a failed batch does not partially replace your files. Filename prefixes such as `SPOILER_` survive conversion. The source files on disk are never overwritten.

Jobs are limited to nonempty media of at most 1 GiB. Very long videos may not fit at a usable bitrate; ClampDown reports that rather than cutting off the end. Cancel stops the active encoder. A failed/cancelled attachment can be retried from the panel. Disabling the plugin stops its active jobs and prevents queued attachments from being replayed.

Output media is intended for Discord's documented inline-preview formats. Receiver devices can still differ in H.265/AVIF playback support; H.264 and JPEG/PNG/WebP are the conservative choices. Multipart archives require all numbered parts and a compatible extractor such as 7-Zip. Discord also has per-message total-size and attachment-count limits; ClampDown does not automatically send messages, so extremely large sets may need to be attached across multiple messages manually.

## Local files and privacy

- BetterDiscord: `<plugins folder>/ClampDown/` contains dependency configuration, separately downloaded/imported dependencies, and temporary job folders.
- Vencord: `<Discord userData>/ClampDown/` is its plugin-owned data folder. Vencord compiles plugins into bundles, so it has no separate installed source directory suitable for writable dependencies.
- Temporary input/output copies are removed after success, error, or cancellation. An operating-system crash can leave a `job-*` directory; remove it only after Discord is closed.
- Compression is local. Only dependency installation contacts download servers. The helper uses its own local authentication token; it does not access Discord account tokens. There is no telemetry, external compression service, or automatic message sending.

## Build and verify

```powershell
npm ci
npm run build
npm test
```

Runtime code uses Node's standard library and each client's existing UI APIs. The only npm development dependency is the pinned bundler. The BetterDiscord artifact is one JS file; Vencord gets its source adapter and shared modules.

`npm test` always runs policy, archive, queue, cancellation, and adapter checks. Real media tests run when `.test-work/native/dependencies.json` contains a configured FFmpeg installation; public-client hook checks run when `.test-work/discord` has been populated by `node scripts/inspect-discord.mjs`. Optional tests report skips when these fixtures are absent. See [TESTING.md](TESTING.md) for the actual verification performed and remaining live-client checks.

## Licensing and references

ClampDown is GPL-3.0-or-later, matching its Vencord integration. FFmpeg, libvips, and 7-Zip are downloaded separately and are not bundled in the plugin release. Their separate licenses and notices remain applicable; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).

Implementation references checked September 9–10, 2026:

- [Vencord custom plugins](https://docs.vencord.dev/installing/custom-plugins/)
- [Vencord ChatButtons API](https://github.com/Vendicated/Vencord/blob/main/src/api/ChatButtons.tsx)
- [BetterDiscord Webpack API](https://docs.betterdiscord.app/api/webpack)
- [Discord file attachments and supported video codecs](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ)
- [Discord WebP and AVIF support](https://discord.com/blog/modern-image-formats-at-discord-supporting-webp-and-avif)
- [libvips project and Windows builds](https://github.com/libvips/libvips)
- [FFmpeg licensing](https://ffmpeg.org/legal.html)
- [7-Zip project and downloads](https://www.7-zip.org/)
