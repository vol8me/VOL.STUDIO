# @volstudio/audio-synth

Deterministik ses ve müzik asset üreticisi. Akustik program, ses ailesi ve
müzik score'u çevrimdışı render edilir; oyun yalnız yayımlanmış OGG ve
çalma sözleşmesini tüketir. Sentez, ölçüm ve yayın ayrı sorumluluklardır.

## Başlangıç

Komutlar, registry, parametreler, bütçeler ve teslim profilleri çalışan
koddan üretilen bağlamda bulunur:

```bash
pnpm --filter @volstudio/audio-synth audio:job context --json
pnpm --filter @volstudio/audio-synth audio:job status <jobId> --json
```

Tek ses akışı `context → brief → program → render → analyze → select →
publish`tir. Bir sonraki geçerli adım kayıtların durumundan hesaplanır;
seçilmemiş, bayat ya da taslak render yayımlanmaz.

## Üretim yolları

| Yol         | Sonuç                                                          |
| ----------- | -------------------------------------------------------------- |
| Akustik job | Brief, program, render, analiz ve asset manifesti              |
| `search`    | Deterministik aday araması ve job'a terfi                      |
| `family`    | Rol aralıklarıyla üretilmiş, QA'dan geçen varyant bankası      |
| `derive`    | Yayımlanmış kaynaktan mesafe, engel, ortam veya cihaz varyantı |
| `music`     | Score, stem ve cue'lar, çalma sözleşmesi taşıyan bundle        |
| `samples`   | Kaynağı ve PCM kimliği doğrulanan sample kütüphanesi           |

Kesin alt komut sözdizimi context çıktısındadır. Render yinelemesinde
`--draft` kullanılabilir; yayın yalnız nihai kaliteyi kabul eder.

## Doğrulama ve dinleme

```bash
pnpm --filter @volstudio/audio-synth typecheck
pnpm --filter @volstudio/audio-synth test
pnpm --filter @volstudio/audio-synth audio:production-check
pnpm --filter @volstudio/audio-synth audio:reference-check
pnpm --filter @volstudio/audio-synth audio:listen
pnpm exec just audio-verify
```

Gönderilen dosya kodek sonrası ölçülür. PCM kimliği, render yüzeyi, dosya
özetleri, sınıf politikası, loop dikişi ve bank/bundle bağları doğrulanır.
Dinleme paketi `export/` altında git dışıdır. Mekanik QA sesin beğenildiği
anlamına gelmez; canary kabulü insanın kayıtlı dinleme kararıdır.

## Yapı

| Dizin        | Sahiplik                                              |
| ------------ | ----------------------------------------------------- |
| `src/`       | Sentez, program, müzik, analiz ve protokol uygulaması |
| `scripts/`   | CLI, QA, ölçüm ve yerel araştırma araçları            |
| `tests/`     | Modül, özellik ve yönetişim testleri                  |
| `records/`   | Job, arama, aile ve müzik üretim kaynakları           |
| `corpus/`    | Canary, benchmark, sample ve theme book kayıtları     |
| `reference/` | Kanonik yayımlanmış referans asset ve manifestler     |
| `locks/`     | Render yüzeyi ve kodlama profilinin sürüm kilitleri   |
| `export/`    | Git dışı yerel render ve dinleme çıktısı              |

## Doktrin

Kaynak programlar ve protokol kayıtları `records/`, referanslar ve
örneklemeler `corpus/`, sürüm kilitleri `locks/` altında yaşar. Yerel render
ve dinleme çıktısı `export/` altındadır. Oyuna gönderilmiş asset ve manifest
oyunun paketindedir. WAV/OGG yazımı Node ortamında, OGG kodlaması FFmpeg ile
çalışır. Çalma CORE'un ses yüzeylerindedir.

[Tasarım ve güvenlik sözleşmesi](DESIGN.md)
