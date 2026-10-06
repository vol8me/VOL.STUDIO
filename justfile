# VOL.STUDIO kalite kapıları. `just` exact pinli `rust-just` devDependency'sidir;
# global değilse `pnpm exec just <tarif>` ya da `pnpm quick|fast|high|signoff`.
# Ne sınadıkları: docs/gates.md.

# Windows'ta PATH'teki `bash` WSL launcher'ına çözülürse tarifler Linux node
# altında koşar ve kapılar koddan bağımsız kırılır; kabuk Git kurulumundan
# türetilir. Tek kaynak ve teşhis: `scripts/quality/gitBash.mjs`.
set shell := ["node", "scripts/quality/bashShell.mjs", "-euo", "pipefail", "-c"]

default:
    @just --list

# === TEKİL KAPILAR ===

# Aktif paketler ve kök betikler (JSDoc ile checkJs).
typecheck:
    node scripts/quality/runActive.mjs typecheck
    pnpm exec tsc -p scripts/tsconfig.json

lint:
    pnpm lint

lint-css:
    pnpm lint:css

format-check:
    pnpm format:check

# Kapsam eşiği uygulamaz.
test:
    node scripts/quality/runActive.mjs test --if-present

# Örn: just test-pkg core
test-pkg pkg:
    pnpm --filter @volstudio/{{ pkg }} test

# audio-synth'in push'ta koşan alt kümesi; tam takım ve kapsamı signoff'tadır.
audio-test:
    node scripts/quality/audioTests.mjs

# `quality.json` → `coverageRuns` paketlerini eşikleriyle koşar; eşikten muaf paketin testini düz koşar.
coverage:
    node scripts/quality/coverageRun.mjs coverage

coverage-audio:
    node scripts/quality/coverageRun.mjs coverage-audio
    node scripts/quality/cli/coverage-shape-report.mjs coverage-audio

# `coverage`den sonra; yalnız o koşunun lcov'unu okur.
coverage-shape:
    node scripts/quality/cli/coverage-shape-report.mjs coverage

# Bekçilerin kendi testleri ve workspace sözleşmesi. Testler geçici depolarda
# git koşar; hook'un GIT_* ortamı onları gerçek depoya yönlendirmesin diye silinir.
contract:
    env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_PREFIX node --test scripts/quality/tests/*.test.mjs scripts/linux/tests/*.test.mjs scripts/android/tests/*.test.mjs devtools/deck/tests/*.test.mjs
    pnpm run contract

build:
    node scripts/quality/runActive.mjs build --if-present

# `build`den sonra; diskteki `dist`in gzip baytını ölçer.
bundle:
    node scripts/quality/cli/bundle-report.mjs

# Girdi dört katına çıkınca sürenin kaç katına çıktığı; süre değil karmaşıklık.
scaling:
    node scripts/quality/cli/scaling-report.mjs

# `build`den sonra; Chromium ve WebKit.
e2e:
    node scripts/quality/runActive.mjs test:e2e --if-present

build-ui:
    pnpm --filter @volstudio/vol-showcase build

# Aktif Cargo manifestleri: fmt, clippy (all-targets, feature'lı), test.
rust:
    node scripts/quality/rust.mjs

security-js:
    pnpm audit --audit-level moderate

security-rust:
    node scripts/quality/rustAudit.mjs

# Yayınlanmış her sesi manifestinden yeniden render edip PCM kimliğini karşılaştırır.
audio-verify:
    node scripts/quality/audioVerify.mjs

# UI kanıtı: yüzey kaydı ve kanıt verisi, ardından vitrinin iki motorlu tam E2E'si
# (axe, durum fixture'ları, yerleşim, piksel). `high` bu bileşimi zaten içerir;
# tarif UI işinde bu kısa yolu tek komutta verir. Gerçek cihaz/insan kabulü değildir.
# UI ilk referans kaydı (git dışı): just ui-baseline <etiket>; karşılaştırma için
# node scripts/quality/cli/ui-baseline.mjs compare <önceki> <sonraki> --strict
ui-baseline label:
    node scripts/quality/cli/ui-baseline.mjs record {{label}}

ui-check:
    node scripts/quality/cli/ui-registry.mjs --check
    pnpm --filter @volstudio/vol-showcase build
    pnpm --filter @volstudio/vol-showcase test:e2e

# === BİRLEŞİK KAPILAR ===

quick: contract format-check typecheck lint

fast: quick test

# `coverage` aynı testleri eşikleriyle koştuğu için düz `test` tekrarlanmaz.
# Tauri generate_context! frontendDist'i derleme sırasında okur; temiz klonda
# frontend çıktısı Rust'tan önce üretilir.
high: quick build rust lint-css coverage coverage-shape audio-test bundle scaling e2e

signoff: high coverage-audio audio-verify security-js security-rust

# Örn: just report high --json
report gate='high' *flags:
    node scripts/quality/report.mjs {{ gate }} {{ flags }}

# === GELİŞTİRME ===

dev:
    pnpm dev

dev-ui:
    pnpm --filter @volstudio/vol-showcase dev

fix:
    pnpm format
    pnpm lint:fix

gen-theme:
    pnpm gen:theme

# UI ikon/çerçeve/doku/imleç varlıkları (core/public/assets/ui); --check sapmayı bildirir.
gen-ui-assets:
    pnpm gen:ui-assets

# JS/TS çıktıları, raporlar ve kapı önbelleği.
clean:
    node scripts/quality/cleanWorkspace.mjs

# Rust hedefleri de silinir; sonraki derleme sıfırdan başlar.
clean-all:
    node scripts/quality/cleanWorkspace.mjs --all

download-fonts:
    pnpm --filter @volstudio/core download-fonts

benchmark-core:
    pnpm benchmark:core

doctor:
    node scripts/doctor.mjs
