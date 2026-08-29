# VOL.STUDIO — Local-first kalite kapıları
# Fedora / pnpm / Tauri v2
# Kullanım: just fast | just high | just signoff | just --list
#
# `just` ikilisi `just-install` devDependency'siyle `node_modules/.bin` altına
# kurulur. Global PATH'te `just` yoksa kapılar `pnpm fast` / `pnpm high` /
# `pnpm signoff` ya da `pnpm exec just <tarif>` ile çağrılır.

set shell := ["bash", "-euo", "pipefail", "-c"]

cargo_dir := "tauri-v2/src-tauri"

# Varsayılan: tarif listesi
default:
    @just --list

# === TEKİL KAPILAR ===
# Birleşik kapılar bunlardan kurulur. Bir kapı düştüğünde agent ya da
# geliştirici tüm zinciri değil yalnızca düşen kapıyı tekrar koşabilsin diye
# ayrı tarifler hâlinde durur.

typecheck:
    pnpm -r typecheck

lint:
    pnpm lint

lint-css:
    pnpm lint:css

format-check:
    pnpm format:check

# Tüm paketlerde test (kapsam eşiği UYGULANMAZ).
test:
    pnpm -r --if-present test

# Tek paket testi. Örn: just test-pkg core | just test-pkg vol-ui
test-pkg pkg:
    pnpm --filter @volstudio/{{ pkg }} test

# Test + kapsam eşikleri. Eşikler kök `quality.json`da (tek kaynak); paketlerin
# vitest.config.ts dosyaları onu okur, `contract` ikisinin ayrışmadığını doğrular.
coverage:
    pnpm -r --if-present test:coverage

# Workspace sözleşmesi: her paketin kapılara dahil olduğunu doğrular.
# `pnpm -r --if-present` script'i olmayan paketi sessizce atladığı için,
# test/eşik yazılmamış yeni bir paket bu bekçi olmadan kapılardan görünmez geçer.
contract:
    pnpm run contract

# build script'i olan HER paketi build eder — yeni paket elle eklenmeyi beklemez.
build:
    pnpm build:all

# Gerçek tarayıcı kritik akışları (Chromium). jsdom testleri font yüklemesini,
# gerçek yerleşimi ve bundle içeriğini göremez; bu kapı o boşluğu kapatır.
e2e:
    pnpm --filter @volstudio/vol-asset-studio test:e2e

# Chromium + Firefox tam matris — yalnız signoff'ta koşar.
e2e-full:
    pnpm --filter @volstudio/vol-asset-studio test:e2e:full

build-game:
    pnpm build:game

build-ui:
    pnpm --filter @volstudio/vol-ui build

# Her satır kendi kabuğunda koştuğu için `cd` her satırda tekrarlanır.
# Rust kapıları: cargo check + fmt + clippy
rust:
    cd {{ cargo_dir }} && cargo check --locked
    cd {{ cargo_dir }} && cargo fmt --check
    cd {{ cargo_dir }} && cargo clippy --locked -- -D warnings

# === BİRLEŞİK KAPILAR ===

# Test koşmaz: pre-commit'in her commit'te ~1.5 dk beklemesi kabul edilmedi,
# test yükü `pre-push` → `high`'a bırakıldı. `contract` en başta koşar ki
# kapsam ihlali 45 sn beklemeden anında düşsün.
# Pre-commit kapısı: sözleşme + format + tip + lint (~45 sn)
quick: contract format-check typecheck lint

# Tam hızlı kapı: quick + test
fast: quick test

# `coverage` aynı testleri eşikleriyle koştuğu için düz `test` burada bilerek
# tekrarlanmaz; `high` yine de `fast`'in her kapısını kapsar.
# Push öncesi kapısı: quick + css lint + kapsam eşikleri + build + Chromium smoke
high: quick lint-css coverage build e2e

# Release/milestone kapısı: high + iki motorlu E2E + Rust
signoff: high e2e-full rust

# Kapıyı koşar ve sonucu MAKİNE-OKUNUR raporlar (agent döngüleri için).
# Kapıları yeniden tanımlamaz, yukarıdaki tarifleri çağırır; aşama haritasının
# bu dosyayla ayrışmadığını da doğrular.
# Örn: just report high | just report quick --json
report gate='high' *flags:
    node scripts/quality/report.mjs {{ gate }} {{ flags }}

# === TAURİ ===

# Tauri prod build: uzun, ağır, manuel.
tauri-build:
    pnpm build:game
    pnpm --filter @volstudio/tauri-v2 tauri build

# Fedora/Linux teslimi — AppImage bundler'ı Fedora'nın güncel `.relr.dyn`
# ELF bölümleriyle uyumlu değildir; NO_STRIP=1 yalnızca harici strip adımını
# kapatır. Tauri AppDir'i hazırladıktan sonra `build:linux-appimage` AppDir'i
# VOL launcher'ı ile yeniden paketler; böylece Tauri CLI'nin Fedora multilib/
# AppImage sonlandırma kusuru teslim paketini geçersiz sayamaz.
# `bundleMediaFramework` ses/video bağımlılıklarını taşır.
tauri-build-linux:
    pnpm build:game
    pnpm --filter @volstudio/tauri-v2 exec tauri build --bundles deb,rpm --ci
    NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1 pnpm --filter @volstudio/tauri-v2 exec tauri build --bundles appimage --ci || test -d tauri-v2/src-tauri/target/release/bundle/appimage/VOL.HELL.AppDir
    pnpm build:linux-appimage

tauri-dev:
    pnpm tauri:dev

tauri-android:
    pnpm tauri:android:dev

tauri-ios:
    pnpm tauri:ios:dev

# === GELİŞTİRME ===

dev:
    pnpm dev

dev-ui:
    pnpm --filter @volstudio/vol-ui dev

dev-asset-studio:
    pnpm --filter @volstudio/vol-asset-studio dev

fix:
    pnpm format
    pnpm lint:fix

gen-theme:
    pnpm gen:theme

# Artefaktlar paket köklerinde yaşar, repo kökünde değil; kök seviyesinde
# silmek hiçbir şeye dokunmaz.
# JS/TS çıktılarını siler: dist, coverage, *.tsbuildinfo
clean:
    rm -rf core/dist devtools/*/dist devtools/*/dist-server games/*/dist tauri-v2/dist
    rm -rf core/coverage devtools/*/coverage games/*/coverage tauri-v2/coverage
    rm -rf devtools/*/test-results devtools/*/playwright-report
    find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete

# Rust target'ı da siler. Sonraki `cargo check` sıfırdan derler; ayrı tutuldu.
clean-all: clean
    rm -rf {{ cargo_dir }}/target

# === SES / ASSET HATTI ===

download-fonts:
    pnpm --filter @volstudio/core download-fonts

generate-audio:
    pnpm --filter @volstudio/vol-hell generate:audio

audio-qa:
    pnpm audio:qa

visual-synth-asset *args:
    pnpm --filter @volstudio/visual-synth asset {{args}}

visual-synth-qa *args:
    pnpm --filter @volstudio/visual-synth qa {{args}}

benchmark-core:
    pnpm benchmark:core

benchmark-vol-hell:
    pnpm benchmark:vol-hell

convert-ios:
    pnpm convert:ios

# === ORTAM KONTROLÜ ===

doctor:
    echo "Node:   $(node -v)"
    echo "pnpm:   $(pnpm -v)"
    echo "Rust:   $(rustc --version 2>/dev/null || echo 'rustc yok')"
    echo "Cargo:  $(cargo -V 2>/dev/null || echo 'cargo yok')"
    echo "just:   $(just --version 2>/dev/null || echo 'PATH içinde yok')"
    echo "FFmpeg: $(ffmpeg -version 2>/dev/null | head -n1 || echo 'FFmpeg yok — ses hattı çalışmaz')"
    if command -v just >/dev/null 2>&1; then echo "just PATH: global ($(command -v just))"; else echo "just PATH: global değil — kapıları 'pnpm fast/high/signoff' ile çağır."; fi
    # Fedora paket adları; Debian/Ubuntu'da libgtk-3-dev / libwebkit2gtk-4.1-dev.
    if pkg-config --exists gtk+-3.0 webkit2gtk-4.1; then echo "Tauri sistem deps: OK"; else echo "UYARI: gtk3-devel / webkit2gtk4.1-devel eksik olabilir (Fedora)."; fi
