# Third-party software

ClampDown copyright © 2026 RedMatterGG and contributors. Licensed under GNU GPL version 3 or, at your option, any later version. See LICENSE for the full terms. ClampDown is an independent project, not affiliated with Discord, Vencord, BetterDiscord, FFmpeg, libvips, 7-Zip, or Node.js.

## Vencord and BetterDiscord

The Vencord adapter integrates with Vencord's GPL-3.0-or-later APIs and is provided under the same license. Vencord itself is obtained from its upstream repository by the installation script. The BetterDiscord adapter uses the host-provided BdApi; BetterDiscord is not bundled here.

- https://github.com/Vendicated/Vencord
- https://github.com/BetterDiscord/BetterDiscord

## FFmpeg

Media processing uses FFmpeg, an independent open-source multimedia project. It is downloaded or selected separately and is not included in ClampDown's release artifacts. FFmpeg is invoked as a separate process, not linked into the plugin.

The pinned Windows x64 default is Gyan's **FFmpeg 9.0.1 essentials build**. The downloaded executable's `-L` output was checked: it identifies the build as **GPL version 3 or later**. Its configuration includes `--enable-gpl` and `--enable-version3`. This description applies to that exact build, not to all FFmpeg binaries. FFmpeg builds can have different LGPL/GPL or nonredistributable configurations.

The installer verifies the archive's pinned SHA-256 and retains its upstream LICENSE, README, and other files. Selected/imported builds have `-version`, `-L`, and `-buildconf` recorded in the local dependency configuration. They are not rejected solely for being GPL. When redistributing an FFmpeg build yourself, comply with its exact source, license, and notice obligations.

- Project: https://ffmpeg.org/
- Licensing: https://ffmpeg.org/legal.html
- Default binary distributor: https://www.gyan.dev/ffmpeg/builds/
- Pinned release: https://github.com/GyanD/codexffmpeg/releases/tag/9.0.1

## libvips

Still-image compression can use libvips, an independent LGPL-2.1-or-later project. libvips is downloaded separately from its official Windows build project or supplied by the user; it is not included in ClampDown's plugin file. The complete upstream archive remains in its local installation directory so bundled dependency notices remain available.

Pinned version: **8.18.2**. Automatic downloads use the official x64, ARM64, or x86 Windows ZIP and verify the release SHA-256 before extraction.

- Project: https://github.com/libvips/libvips
- License: https://github.com/libvips/libvips/blob/master/COPYING
- Pinned Windows builds: https://github.com/libvips/build-win64-mxe/releases/tag/v8.18.2

## User-supplied dependencies

Users may select existing executables or separate ZIP archives. Those copies are independently obtained by the user, not distributed by ClampDown. Importing validates the archive and runs the selected tools locally. Users should obtain binaries from sources they trust and observe the licenses applicable to them.

## 7-Zip

Arbitrary-file compression uses the official reduced standalone 7-Zip console executable, downloaded separately on demand and invoked as a separate process. ClampDown pins version **26.03**, verifies SHA-256, and does not modify or bundle the executable. Most 7-Zip code is LGPL-licensed, with BSD-licensed portions and an unRAR restriction; the reduced `7zr.exe` is also described by the upstream LZMA SDK documentation.

- Project, binaries, source, and license information: https://www.7-zip.org/
- Pinned release: https://github.com/ip7z/7zip/releases/tag/26.03

## Development tooling

esbuild is a build-time dependency licensed under MIT. It is not a runtime dependency and is not bundled as an executable in ClampDown. Source: https://github.com/evanw/esbuild

The icon is original SVG artwork drawn for this plugin, inspired by the clamp-and-folder concept in the supplied brief. No raster reference image is redistributed.
