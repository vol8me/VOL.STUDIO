#!/usr/bin/env bash
# steamrt4 kap İÇİNDE koşar (bkz. build-linux-steamrt4.mjs):
#   1) <workspace>/src-tauri'de `tauri build` → release ikili + AppDir
#   2) build-linux-appimage.mjs → GStreamer paketleme, AppRun, AppImage
# İkisi de kap içindedir; host glibc'si sonucu etkilemez.
set -euo pipefail

WORKSPACE="$1"
cd "/work/${WORKSPACE}/src-tauri"

echo "[steamrt4] kap: $(ldd --version | head -1)"
echo "[steamrt4] rustc: $(rustc --version)"
echo "[steamrt4] webkit: $(dpkg-query -W -f='${Version}\n' libwebkit2gtk-4.1-0 2>/dev/null || echo '?')"

tauri build --bundles appimage

node /work/scripts/build-linux-appimage.mjs "$WORKSPACE"
