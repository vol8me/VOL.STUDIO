# @volstudio/audio-synth — iş listesi

Açık ses üretimi işlerinin sahibidir. Kullanım [README](README.md),
mekanizmalar ve teknik yayın kabulü [DESIGN](DESIGN.md), repo geneli işler
[kök TODO](../../TODO.md) içindedir. Dinleme değerlendirmesi teknik yayın
kapısı değildir; güncel sınırlar [denetimde](../../docs/monorepo-audit.md#audio-teknik-kabul) açıklanır.

## Açık

Bu pakette açık iş yoktur. VOL.TEST yetenek sesleri ve kullanıcı
değerlendirmeleri kök TODO F09.6/F09.10 sahibindedir.

## Kapatılanlar

Teknik teslimlerin özeti aşağıdadır; ayrıntılı kapanış tarihçesi Git içindedir.

- [x] AS20 — Manifest doğrulayıcısı ortak alt şemalara ayrıldı; yanlış PCM metadata kabulü kapandı.
- [x] Deterministik sentez, örnek/karma kaynak, graf, preset ve parametre sınırları ortak üretim yoluna bağlandı.
- [x] MusicProgram, tema kitabı, orkestrasyon, stem ve geçiş sözleşmeleri kaynak ve teslim biçimleriyle ayrıldı.
- [x] SoundFamily, aday arama, benchmark ve canary korpusları yeniden üretilebilir kalite ölçümü sağlar.
- [x] AudioJob, brief/program/asset manifesti ve özet zinciri tek kanonik publish kapısında birleşti.
- [x] Render iş/bellek bütçesi, ara tampon ve döngü maliyeti sınırlanır; aynı Timeline ardışık render sırasında aynı çıktıyı verir.
- [x] WAV/extensible metadata, yeniden örnekleme, kanal hizası ve kodek sonrası gerçek tepe/ses yüksekliği teknik QA ile doğrulanır.
- [x] RT60, gain, yinelenen efekt, döngü sürekliliği, alias ve filtre birleşimleri anlamlı regresyonlarla korunur.
