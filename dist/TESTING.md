# Verification record

Checked on Windows x64, September 9–10, 2026.

## Completed checks

Version 1.2.3 adds arbitrary-file multipart 7z creation using the checksum-pinned official 7-Zip 26.03 reduced console binary, fixes BetterDiscord's nested message-menu insertion, and uses a filename-prefilled Save dialog with BetterDiscord-compatible file writes for archive downloads. A real randomized 350,000-byte fixture is split below a 90,000-byte volume budget, extracted from `.7z.001`, and compared byte-for-byte with its source. The separate `CLAMPDOWN_TEST_7ZIP_DOWNLOAD=1` check exercises the real pinned download, checksum verification, installation, version probe, and cleanup. Unit coverage checks batch expansion, archive settings, live-limit sizing, dependency selection, context-menu detection, authenticated helper transport, safe Discord-CDN downloads, and collision-free filenames. The UI check covers archive presets, part sizing, and 7-Zip setup.

Version 1.0.5 matches the public Discord shared chat-button hover rules: 200 ms ease transition, 8 px radius, 32 px button, 20 px icon, and interactive-text/background theme variables. Source: https://discord.com/assets/61531.8798f70cc3acf885.css and https://discord.com/assets/962953.c502957d2815eba7.css. The browser check compares resting/hover colors and background, then verifies the background returns when the pointer leaves. Reduced-motion users receive the same states without transitions.

Version 1.0.4 normalizes iterable FileList attachment batches in the BetterDiscord hook before queueing/replay. It applies Discord's active Kestrel configuration to the base guild/user limit and refreshes the panel's limit. Adapter coverage checks that a 23 MiB FileList waits for compression with a 20 MiB limit, then replays once with channel, draft type, and options preserved; a 15 MiB FileList bypasses compression. Live picker/drop behavior still requires manual Discord verification.

Version 1.0.3 uses BetterDiscord's module-source index before accessing the exact upload module, adds visible helper startup state and a Windows launcher fallback, and adds Node.js detection plus a checksum-pinned official LTS installer action. oximg was replaced by libvips 8.18.2; its official Windows x64 archive was downloaded, SHA-256 verified, extracted, and probed successfully for JPEG, PNG, WebP, and AVIF on this machine.

Version 1.0.2 replaces eager BetterDiscord export enumeration with guarded per-export lookup for both uploads and file-size limits. The packaged-plugin regression fixture throws the reported `Cannot access 'IP' before initialization` error from an enumerable `Ay` getter. Checks cover successful sibling discovery, delayed initialization, host lookup errors, stopping retries on disable, and bounded unavailable-hook warnings. This is simulated runtime coverage, not verification in a signed-in Discord session.

Version 1.0.1 adds an explicit BetterDiscord-runtime regression test: the built plugin is loaded and started using only `fs`, `path`, and `electron` from a restricted `require` implementation matching BetterDiscord's exposed module names. The former 1.0.0 build fails this test at `node:path`. Native engine code now runs in a separate helper. Tests verify helper authentication, rejection of unauthenticated/cross-origin requests, status, cancellation, and actual image compression through the packaged BetterDiscord adapter and helper.

The bundled helper was also launched through its generated Windows Script Host launcher in an isolated test directory and verified over its local authenticated connection. This test requires `CLAMPDOWN_TEST_LAUNCH=1` and Windows Script Host; the default test run skips it. It passed separately outside the workspace sandbox. UI checks include the new Start local helper button and connected status. The live BetterDiscord installation has not been overwritten; the updated plugin is supplied for manual replacement.

- Built the BetterDiscord single-file plugin using esbuild.
- Built Vencord's complete desktop bundles with ClampDown included, against Vencord commit `0e40e433d7aa9168f656aba733d01e761b7ca8ca` (version 1.15.4).
- Ran Vencord's TypeScript check with the plugin installed in the reference checkout.
- Checked the upload-function patch against the public Discord client asset `web.831e884588cb7b8b.js`. The patch selects the asynchronous upload prompt with `filesMetadata`, not the nearby error-reporting function.
- Verified Discord's guild-aware maximum-size function takes a guild ID and derives the account limit from the current user internally.
- Downloaded Gyan's FFmpeg 9.0.1 essentials ZIP through the dependency installer, verified its pinned SHA-256, extracted it, and checked its executable version, license, and build configuration.
- Ran actual H.264 and H.265 encodes with audio and validated codec, duration, and final size with FFprobe.
- Encoded actual JPEG, PNG, WebP, GIF, and AVIF outputs beneath a 20,000-byte test allowance.
- Compressed an animated GIF and verified that the result still has multiple frames.
- Verified temporary job directories disappear after completion.
- Tested invalid settings, unknown upload limits, ZIP traversal/symlink rejection, checksum failure, queue replay, spoiler names, atomic failure behavior, cancellation, and literal shell-sensitive arguments.
- Tested the actual shared settings UI in headless Chromium: preset persistence, codec/target changes, dependency actions, Escape, cancellation, and a 390px viewport. Visually inspected wide and narrow screenshots.

## Scope of the result

The adapters compile and their integration points were checked against current upstream source/public Discord code. No message was sent from a signed-in Discord account. End-to-end validation inside running Vencord and BetterDiscord remains to be done; browser UI mocks and public-client source checks are not a substitute for that.

CPU H.264/H.265 and FFmpeg image outputs were executed. Hardware choices include NVIDIA, Intel, and AMD with runtime CPU fallback; actual successful acceleration on each vendor's hardware needs that hardware. The libvips Windows x64 automatic installation and encoder probes were executed locally.

## Live-client acceptance checklist

For each client, use an appropriate test channel and confirm:

1. Enable ClampDown, restart when requested, and find the icon next to the composer actions.
2. Open the same settings through the icon and the plugin's settings page.
3. Select/import/download dependencies; confirm notices and a working status.
4. Attach oversized media using the picker, drag-and-drop, and paste. The resulting attachment must remain in the intended channel and preserve spoiler status.
5. Repeat in a DM and a boosted server/account with different limits; the shown limit should follow Discord.
6. Cancel a job, retry it, switch channels during another job, and disable the plugin during a job. Nothing should send automatically, and original source files must remain unchanged.
7. Check H.264 and H.265 playback on recipient devices and test each available GPU vendor.
8. Attach an oversized non-media file, confirm every numbered part is below the displayed limit, send it manually, then right-click the received message and use **Download all … archive parts**. Extract `.7z.001` and compare the restored file.

Run optional real-media tests after configuring `.test-work/native/dependencies.json`. UI tests use `scripts/check-ui.cjs` with `CLAMPDOWN_PLAYWRIGHT` pointing at a Playwright installation and `CLAMPDOWN_CHROME` at its browser executable. Public-client source checks can be refreshed with `node scripts/inspect-discord.mjs`.
