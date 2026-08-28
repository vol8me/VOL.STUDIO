# @volstudio/visual-synth

VOL.STUDIO deterministik görsel asset compiler'ı.

Bu paket prosedürel raster sentezi, palet yönetimi, PNG kodlama ve belge doğrulama/QA altyapısını taşır. Çıktı PNG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Kardeş paket: `@volstudio/audio-synth`.
Runtime tüketici: `games/vol-hell`, `devtools/vol-asset-studio`.

## Komutlar

| Komut                | Açıklama                         |
| -------------------- | -------------------------------- |
| `pnpm typecheck`     | Tür denetimi                     |
| `pnpm test`          | Testleri çalıştır                |
| `pnpm test:coverage` | Test + kapsam                    |
| `pnpm asset`         | `visual-synth-asset.ts` CLI'ı    |
| `pnpm qa`            | `visual-synth-qa.ts` ölçüm aracı |

## Yapı

- `src/` — sentez motoru
- `src/encode/` — PNG yazma (Node-only)
- `tests/` — motor ve CLI testleri
- `scripts/` — asset ve QA CLI'ları
- `presets/` — hazır görsel tarifler
- `recipes/` — proje özel belgeler
- `export/` — üretilmiş PNG/SVG çıktıları (`.gitkeep` ile korunur, içerik geçici/generated olabilir)

## Doktrin

- DOM bilinmez.
- `node:fs` / `node:zlib` yalnızca `encode/` alt yolunda bulunur.
- Aynı recipe + aynı tohum aynı pikselleri verir.

Detaylı doktrin ve sözleşme için `DESIGN.md`.
