# VOL.STUDIO kalite kapıları. `just` exact pinli `rust-just` devDependency'sidir;
# global değilse `pnpm exec just <tarif>` ya da `pnpm quick|fast|high|signoff`.
# Ne sınadıkları: docs/gates.md.

set shell := ["bash", "-euo", "pipefail", "-c"]

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
    pnpm --filter @volstudio/audio-synth exec vitest run tests/dspCorrectness.test.ts tests/retro.test.ts tests/program/instrument.test.ts tests/music/delivery.test.ts tests/governance/publishPath.test.ts tests/protocol/context.test.ts tests/protocol/character.test.ts tests/governance/dirLayers.test.ts

# `quality.json` → `coverageRuns` paketlerini eşikleriyle koşar; eşikten muaf paketin testini düz koşar.
coverage:
    node scripts/quality/coverageRun.mjs coverage

coverage-audio:
    node scripts/quality/coverageRun.mjs coverage-audio
    node scripts/coverage-shape-report.mjs coverage-audio

# `coverage`den sonra; yalnız o koşunun lcov'unu okur.
coverage-shape:
    node scripts/coverage-shape-report.mjs coverage

# Bekçilerin kendi testleri ve workspace sözleşmesi. Testler geçici depolarda
# git koşar; hook'un GIT_* ortamı onları gerçek depoya yönlendirmesin diye silinir.
contract:
    env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_PREFIX node --test scripts/quality/tests/*.test.mjs
    pnpm run contract

build:
    node scripts/quality/runActive.mjs build --if-present

# `build`den sonra; diskteki `dist`in gzip baytını ölçer.
bundle:
    node scripts/bundle-report.mjs

# Girdi dört katına çıkınca sürenin kaç katına çıktığı; süre değil karmaşıklık.
scaling:
    node scripts/scaling-report.mjs

# `build`den sonra; Chromium ve WebKit.
e2e:
    node scripts/quality/runActive.mjs test:e2e --if-present

build-ui:
    pnpm --filter @volstudio/vol-ui build

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

# === BİRLEŞİK KAPILAR ===

quick: contract format-check typecheck lint

fast: quick test

# `coverage` aynı testleri eşikleriyle koştuğu için düz `test` tekrarlanmaz.
high: quick rust lint-css coverage coverage-shape audio-test build bundle scaling e2e

signoff: high coverage-audio audio-verify security-js security-rust

# Örn: just report high --json
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

# JS/TS çıktıları, raporlar ve kapı önbelleği.
clean:
    rm -rf core/dist devtools/*/dist devtools/*/dist-server games/*/dist tauri-v2/dist
    rm -rf core/coverage devtools/*/coverage games/*/coverage tauri-v2/coverage
    rm -rf devtools/*/test-results devtools/*/playwright-report devtools/deck-probe/web/vendor
    find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete
    rm -rf node_modules/.cache/vol-quality

# Rust hedefleri de silinir; sonraki derleme sıfırdan başlar.
clean-all: clean
    rm -rf target tauri-v2/src-tauri/target tauri-v2/plugins/*/target devtools/*/src-tauri/target games/*/src-tauri/target

download-fonts:
    pnpm --filter @volstudio/core download-fonts

benchmark-core:
    pnpm benchmark:core

doctor:
    node scripts/doctor.mjs
