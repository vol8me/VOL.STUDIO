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

# Uygulamanın isteğe bağlı cargo feature'ları dışarıdan verilir —
# örn. `VOL_CARGO_FEATURES=steamworks` istemci SDK'sını devreye sokar.
FEATURES_ARGS=()
if [ -n "${VOL_CARGO_FEATURES:-}" ]; then
  FEATURES_ARGS=(--features "$VOL_CARGO_FEATURES")
  # Önce yalnız derle: steamworks-sys dağıtılabilir `libsteam_api.so`'yu
  # OUT_DIR'e kopyalar; linuxdeploy'nun ldd çözümlemesi onu oradan bulur
  # ve AppDir'e taşır. Depoya SDK binary girmez; pakete girer (lisansın
  # amaçladığı da budur — redistributable_bin).
  cargo build --release "${FEATURES_ARGS[@]}"
  api_lib="$(find "$PWD/target/release/build" -name 'libsteam_api.so' -print -quit)"
  if [ -n "$api_lib" ]; then
    # Mutlak yol şart: ikinci linuxdeploy AppDir dizininden koşar, göreli
    # yol orada ölür.
    export LD_LIBRARY_PATH="$(dirname "$api_lib")${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    echo "[steamrt4] steamworks kütüphanesi bulundu: $api_lib"
  fi
fi
tauri build --bundles appimage "${FEATURES_ARGS[@]}"

node /work/scripts/build-linux-appimage.mjs "$WORKSPACE"
