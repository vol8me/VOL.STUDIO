# Yeni oyun paketi eklemek

Bu liste tahmin değil: her madde onu ZORLAYAN kapıdan türetildi. Sırayla
uygulanırsa `pnpm signoff` ilk denemede yeşil olur; atlanan bir madde ya kapıyı
kırar ya da — daha kötüsü — testlerinizin sessizce hiç koşmamasına yol açar.

## Zorunlu

| Ne                                                      | Neden / hangi kapı                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `package.json` → `typecheck`, `test`, `test:coverage`   | `scripts/workspace-contract.mjs` üçünü de arar (`REQUIRED_SCRIPTS`) |
| `vitest.config.ts`                                      | `test:coverage` varsa workspace-contract config dosyasını da ister  |
| `quality.json` → paket adı altında kapsam eşikleri      | Eşikler `floor`un altına inemez; muafiyetin gerekçesi yazılı olmalı |
| `tsconfig.json`, `vite.config.ts`, `index.html`         | Build ve typecheck kapıları                                         |
| `vite.config.ts` + `vitest.config.ts` → `coreAliases()` | CORE alt yolları elle yazılmaz; alias sızıntı testi bunu sınar      |
| `src/i18n/tr.json` + `en.json` ve bir `keyParity` testi | AGENTS.md Kural 1 — kullanıcıya görünen metin hard-code edilmez     |

## Sınırlar

Oyunun **çalışma zamanı** (`src/`) yalnız `core`'u, `tauri-v2`yi ve dış
bağımlılıkları import eder — hiçbir devtool'u, hiçbir başka oyunu.
`scripts/quality/layers.mjs` bunu zorlar. `scripts/` ve `tests/` bu sınırın
dışındadır (build/doğrulama zamanı).

## Otomatik olan ve OLMAYAN

**Otomatik:** Rust kapısı `src-tauri/Cargo.toml` taşıyan her paketi manifestleri
tarayarak bulur; yeni oyun eklendiğinde `check`/`fmt`/`clippy` kendiliğinden
kapsar.

**Otomatik DEĞİL:** `justfile`daki `e2e` tarifi paket listesini ELLE tutar.
`test:e2e` tanımlayıp tarife eklemezseniz tarayıcı testleriniz `high` ve
`signoff` dahil hiçbir kapıda koşmaz. Aynı şey bundle bütçesi için de geçerli:
`quality.json` → `bundles` altına paket girdisi eklenmezse boyut ölçülmez.

İkisinden ilki artık kapılıdır — `scripts/quality/tests/justfileWiring.test.mjs`
`test:e2e` tanımlayıp tarifte görünmeyen paketi reddeder.

## Sıra

1. Paketi kur, `pnpm install`.
2. `pnpm --filter <paket> typecheck` — alias ve tsconfig doğru mu?
3. `quality.json`a eşikleri ve (build varsa) bundle bütçesini yaz.
4. `pnpm quick` — sözleşme, format, typecheck, lint.
5. E2E yazdıysanız `justfile`ın `e2e` tarifine ekleyin.
6. `pnpm signoff`.
