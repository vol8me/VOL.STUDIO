# @volstudio/audio-synth

VOL.STUDIO deterministik ses asset compiler'ı.

Bu paket prosedürel ses sentezi, efekt zinciri, WAV/OGG yazma ve ses QA altyapısını taşır. Çıktı WAV/OGG'dir; tarayıcı veya oyun yalnızca üretilmiş asset'i tüketir.

Kardeş paket: `@volstudio/visual-synth`.
Runtime tüketici: `games/vol-hell` (`public/assets/audio`), `core/src/audio/music/` (stem çalar).

## Komutlar

| Komut                | Açıklama                                 |
| -------------------- | ---------------------------------------- |
| `pnpm typecheck`     | Tür denetimi                             |
| `pnpm test`          | Testleri çalıştır                        |
| `pnpm test:coverage` | Test + kapsam                            |
| `pnpm qa`            | `audio-qa.ts` ölçüm aracı                |
| `pnpm convert:ios`   | `convert-audio.ts` OGG→MP3 dönüştürücüsü |

## Yapı

- `src/` — sentez motoru
- `src/writer.ts` — WAV/OGG yazma (Node-only, FFmpeg gerekir)
- `tests/` — motor, writer ve preset testleri
- `scripts/` — QA ve dönüştürücü CLI'ları
- `presets/` — hazır ses tarifleri
- `recipes/` — proje özel ses tarifleri
- `export/` — üretilmiş WAV/OGG/MP3 çıktıları (`.gitkeep` ile korunur, içerik geçici/generated olabilir)

## Doktrin

- `writeOgg` FFmpeg ister.
- Aynı parametreler + aynı `seed` aynı örnekleri verir.
- Runtime playback bu pakette değil, `@volstudio/core/audio/music`'te yapılır.

Detaylı doktrin ve sözleşme için `DESIGN.md`.
