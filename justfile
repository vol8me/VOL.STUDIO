# VOL.STUDIO — Local-first kalite kapıları
# Fedora / pnpm / Tauri v2
# Kullanım: just fast | just high | just signoff | just --list
#
# `just` ikilisi exact pinli `rust-just` devDependency'siyle `node_modules/.bin` altına
# kurulur. Global PATH'te `just` yoksa kapılar `pnpm fast` / `pnpm high` /
# `pnpm signoff` ya da `pnpm exec just <tarif>` ile çağrılır.

set shell := ["bash", "-euo", "pipefail", "-c"]

# Varsayılan: tarif listesi
default:
    @just --list

# === TEKİL KAPILAR ===
# Birleşik kapılar bunlardan kurulur. Bir kapı düştüğünde agent ya da
# geliştirici tüm zinciri değil yalnızca düşen kapıyı tekrar koşabilsin diye
# ayrı tarifler hâlinde durur.

typecheck:
    node scripts/quality/runActive.mjs typecheck

lint:
    pnpm lint

lint-css:
    pnpm lint:css

format-check:
    pnpm format:check

# Tüm paketlerde test (kapsam eşiği UYGULANMAZ).
test:
    node scripts/quality/runActive.mjs test --if-present

# Tek paket testi. Örn: just test-pkg core | just test-pkg vol-ui
test-pkg pkg:
    pnpm --filter @volstudio/{{ pkg }} test

# Test + kapsam eşikleri. Eşikler kök `quality.json`da (tek kaynak); paketlerin
# vitest.config.ts dosyaları onu okur, `contract` ikisinin ayrışmadığını doğrular.
#
# Koşunun ölçtüğü paketler `quality.json` → `coverageRuns` içinde yazılıdır ve
# koşu neyi ne zaman ölçtüğünü kaydeder; `coverage-shape` yalnız o kaydı okur.
#
# `audio-synth` coverage'i (ağır spektrum/fiziksel model testleri) pre-push
# yerine release/signoff kapısında koşulur; ~4 dakikalik yük push'a takılmalar
# yapıyordu ve spektrum testleri zaten release anına yakışan bir doğrulama.
coverage:
    node scripts/quality/coverageRun.mjs coverage

# Ağır ses/spektrum kapsamı ve şekli; yalnızca release (signoff) kapısında koşulur.
coverage-audio:
    node scripts/quality/coverageRun.mjs coverage-audio
    node scripts/coverage-shape-report.mjs coverage-audio

# Kapsamın şekli: büyük ve düşük kapsamlı dosya test ya da kanıtlı gerekçe ister.
# `coverage`den SONRA koşar; yalnız o koşuda yazılmış lcov'u değerlendirir.
coverage-shape:
    node scripts/coverage-shape-report.mjs coverage

# Workspace sözleşmesi: her paketin kapılara dahil olduğunu doğrular.
# `pnpm -r --if-present` script'i olmayan paketi sessizce atladığı için,
# test/eşik yazılmamış yeni bir paket bu bekçi olmadan kapılardan görünmez geçer.
contract:
    node --test scripts/quality/tests/*.test.mjs
    pnpm run contract

# build script'i olan HER paketi build eder — yeni paket elle eklenmeyi beklemez.
build:
    node scripts/quality/runActive.mjs build --if-present

# Gönderilen bundle bütçesi. `build`den SONRA koşmak ZORUNDA: ölçtüğü şey
# diskteki `dist`tir, kaynak değil. Ölçü gzip'lenmiş bayttır ve `app`/`vendor`
# ayrı bütçelenir (bkz. scripts/quality/bundleSize.mjs).
bundle:
    node scripts/bundle-report.mjs

# ALGORİTMİK ölçekleme kapısı. Mutlak süre kapı olamaz (donanıma bağlı) ama
# "girdi dört katına çıkınca süre kaç katına çıkıyor" oranı makineden
# bağımsızdır: O(n^2) sızması oradan görünür (bkz. scripts/quality/scalingBudget.mjs).
scaling:
    node scripts/scaling-report.mjs

# Gerçek tarayıcı kritik akışları (Chromium). jsdom testleri font yüklemesini,
# gerçek yerleşimi ve bundle içeriğini göremez; bu kapı o boşluğu kapatır.
#
# vol-ui CORE'un GÖRSEL sözleşmesini taşır: geometri iddiaları (taşma, dokunma
# hedefi) artı sekme başına piksel temeli. `build`den SONRA koşar; kalan ürün
# ve katalog yüzeylerini production host/preview ile derlenmiş çıktıda sınar.
e2e:
    node scripts/quality/runActive.mjs test:e2e --if-present

build-ui:
    pnpm --filter @volstudio/vol-ui build

# Git görünürlüğündeki bütün Cargo manifestleri: check + fmt + clippy.
rust:
    node scripts/quality/rust.mjs

# Bütün JS lockfile'ı için advisory kapısıdır. Frozen importer otomatik
# muaf tutulmaz; install/lockfile yüzeyinde kaldığı sürece aynı audit'e tabidir.
security-js:
    pnpm audit --audit-level moderate

# Aktif workspace'lerin Cargo.lock dosyalarını cargo-audit ile doğrular.
security-rust:
    node scripts/quality/rustAudit.mjs

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
# `audio-synth` coverage `signoff`'ta; kapsam eşikleri burada product paketleri
# ve araçlar için koşulur.
#
# Rust push kapısındadır: paylaşılan native runtime ve aktif eklenti crate'i
# ürünün parçasıdır (frozen oyun kabukları kapıya girmez — kilitleri
# değiştirilemez); aktif crate'lerin check + fmt + clippy'si sıcak önbellekle
# saniyeler sürer.
# Push öncesi kapısı: quick + Rust + css lint + kapsam eşikleri + build + Chromium smoke
high: quick rust lint-css coverage coverage-shape build bundle scaling e2e

# AKTİF ses üreticisinde reçete↔asset tazeliğini, BÜTÜN ağaçlarda asset
# bütünlüğünü doğrular.
#
# Ses üretimi deterministiktir (ölçüldü: ardışık iki koşu birebir aynı bayt,
# `-bitexact` sayesinde). Aktif pakette "yeniden üret ve farka bak" geçerli bir
# doğrulamadır: fark varsa ya reçete değişip dosya yenilenmemiştir ya da dosya
# elle düzenlenmiştir. Frozen ağaçta üretim tetiklenmez — o sesin üretim kanıtı
# freezeTag'indedir; burada yalnız asset'lerin diff'siz kaldığı doğrulanır.
#
# Gerçek bir bayatlama bu şekilde bulundu: `first-light.ogg` eski bir reçeteyle
# üretilmişti ve kimse fark etmemişti.
#
# `high`da DEĞİL, `signoff`ta: üretim maliyeti yüksektir ve ffmpeg gerektirir
# — her push'a bu maliyeti yüklemek kapıyı atlanır hâle getirirdi.
audio-verify:
    node scripts/quality/audioVerify.mjs

# Release/milestone kapısı: high + ağır ses kapsamı + ses tazeliği
signoff: high coverage-audio audio-verify security-js security-rust

# Kapıyı koşar ve sonucu MAKİNE-OKUNUR raporlar (agent döngüleri için).
# Kapıları yeniden tanımlamaz, yukarıdaki tarifleri çağırır; aşama haritasının
# bu dosyayla ayrışmadığını da doğrular.
# Örn: just report high | just report quick --json
report gate='high' *flags:
    node scripts/quality/report.mjs {{ gate }} {{ flags }}

# === GELİŞTİRME ===

dev:
    pnpm dev

dev-ui:
    pnpm --filter @volstudio/vol-ui dev

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
    rm -rf node_modules/.cache/vol-quality

# Rust target'ı da siler. Sonraki `cargo check` sıfırdan derler; ayrı tutuldu.
clean-all: clean
    rm -rf tauri-v2/src-tauri/target games/*/src-tauri/target

# === SES / ASSET HATTI ===

download-fonts:
    pnpm --filter @volstudio/core download-fonts

benchmark-core:
    pnpm benchmark:core

# === ORTAM KONTROLÜ ===

doctor:
    node scripts/doctor.mjs
