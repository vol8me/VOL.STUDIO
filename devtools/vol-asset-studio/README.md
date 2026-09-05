# @volstudio/vol-asset-studio

VOL.STUDIO reposundaki görsel, ses, font ve üretim belgelerini tek bir web
yüzeyinde keşfeden repo-varlık çalışma ortamı. Bir oyun veya metinden görsel
üreteci değildir; diskte gerçekten bulunan varlıkları indeksler, canlı
değişiklikleri izler ve türüne uygun önizleme sunar.

[English](README.en.md)

## Geçerli kapsam

- repo köklerinden canlı katalog, arama, tür/sorun/Git durumu filtreleri;
- dosya boyutu, medya imzası, JSON yapısı ve görsel çözümleme sorunları;
- PNG/JPEG/WebP/GIF/AVIF önizlemeleri ve sunucu tarafı thumbnail;
- OGG/MP3/WAV/FLAC oynatma ile FFmpeg/ffprobe metadata'sı;
- WOFF/WOFF2/TTF/OTF font örneği;
- kaynak, türetilmiş çıktı ve reçete ilişki metadata'sı;
- SSE ile kimlik bazlı artımlı güncelleme ve sıra boşluğunda tam eşitleme;
- Quick Look ayrıntıları ve repo göreli yol kopyalama;
- `.volsprite.json` belgeleri için salt-okunur VisualSynth inspector:
  kaynak graph, kanal önizlemesi, QA, gerçek render profili, tampon maliyeti
  ve region/halo kararı;
- tile tabanlı PNG piksel yüzeyi, katman/palet, undo/redo ve
  revizyon kontrollü atomik PNG kaydı;
- peak piramitli ses dalga formu, seçim, yakınlaştırma, transport, gain, trim,
  fade, peak normalize ve reverse zinciriyle atomik OGG/WAV kaydı;
- salt okunur referans arama, rename önizleme ve kurtarılabilir çöp.

PNG kaydı görünür katmanları birleştirir; katman ayrımı ve geçmiş yalnız
belge açıkken korunur. Kayıt sırasında yapılan sonraki düzenlemeler kirli
kalmaya devam eder. Katman silme ve birleştirme geri alındığında fırça geçmişi
aynı piksel yüzeyine bağlı kalır; geçmiş bütçesi tutulan tile tamponlarını sayar.

Animasyon oluşturma ve native sprite proje kaydı kapsamda değildir. Dosyaya
bağlanmamış kare şeridi, sprite proje modeli, sheet/metadata export taslağı ve
kullanıcısı olmayan `.volpost.json` delta modeli kaldırılmıştır. VisualSynth
`.volsprite.json` inspector'ı salt okunur sentez incelemesi olarak korunur.
Ses zinciri açık kaydet eylemiyle mevcut OGG/WAV'a uygulanır; MP3/FLAC
incelenebilir, düzenleme için OGG/WAV dönüşümü gerekir.

## Çalıştırma

Repo kökünden:

```bash
pnpm --filter @volstudio/vol-asset-studio dev
```

Repo hostu ve Vite aynı `http://127.0.0.1:5175` adresinde çalışır. Kök
`pnpm dev` komutu VOL.HELL ve VOL.UI ile birlikte Asset Studio'yu da açar.

Üretim paketi:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio start
```

Yerel ağda yayın yalnız üretim frontend'iyle kabul edilir:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio exec node dist-server/server/cli.js --production --host 0.0.0.0
```

Repo hostu başlangıçta geçici erişim anahtarını terminale yazar. Anahtar web
yüzeyindeki doğrulama alanına bir kez girilir; devam eden görsel, ses, font ve
SSE istekleri `HttpOnly` oturum çereziyle çalışır. Anahtar URL'ye yazılmaz ve
tarayıcı depolamasında tutulmaz.

## Proje yapılandırması

Kök [`asset-studio.json`](../../asset-studio.json) hangi klasörlerin katalogda
yer alacağını tanımlar. Her kökün sabit bir kimliği, repo göreli yolu, rolü ve
izin verilen varlık türleri vardır.

| Rol        | Anlamı                                       |
| ---------- | -------------------------------------------- |
| `source`   | Üretimin düzenlenebilir kaynak belgesi       |
| `derived`  | Bir kaynaktan yeniden üretilebilen çıktı     |
| `shipped`  | Oyunla dağıtılan runtime varlığı             |
| `readonly` | Keşfedilen fakat yazma hedefi olmayan varlık |

Eksik opsiyonel kökler proje yanıtında görünür ancak servisi çökertmez.
Bilinmeyen alan, yinelenen kök kimliği, mutlak/kaçak yol ve geçersiz limit
başlangıçta tek bir yapılandırma hatasıyla reddedilir.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-asset-studio typecheck
pnpm --filter @volstudio/vol-asset-studio test
pnpm --filter @volstudio/vol-asset-studio test:coverage
pnpm --filter @volstudio/vol-asset-studio build
```

Repo geneli kapanış kapısı `pnpm high`dır. Ses metadata'sı için sistemde
`ffprobe` bulunmalıdır; `pnpm run doctor:env` bunu denetler.

## Devamı

- [DESIGN.md](DESIGN.md) — sunucu sözleşmesi ve güvenlik sınırı

## Lisans

[Apache License 2.0](../../LICENSE)
