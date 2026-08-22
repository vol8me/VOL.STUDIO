# VOL.FORGE

`core/visual` üstünde çalışan tek ekran tarif tabanlı görsel üretici. Niyet,
başlangıç kataloğu ve temel çıktı kararlarından deterministik bir PNG ile onu
yeniden üreten JSON `SpriteDoc` oluşturur.

Forge elle piksel çizme uygulaması, katman ağacı editörü veya üretken YZ
servisi değildir. Gelişmiş düzenleme kipi ve teknik panel/Tabs yüzeyi Tur 5
ürün denetiminde tamamen kaldırıldı.

```bash
pnpm --filter @volstudio/vol-forge dev       # http://localhost:5175
pnpm --filter @volstudio/vol-forge test
pnpm --filter @volstudio/vol-forge typecheck
pnpm --filter @volstudio/vol-forge build
```

## Tek ekran akışı

1. Görsel tarifini yaz; 320 ms duraklayınca sonuç canlı uygulanır. Katalog
   kartları tıklandığı anda çalışır.
2. Ortadaki artboard'u tutup kamerayı kaydır, tekerlek/pinch ile yakınlaştır
   veya **Sığdır** kullan.
3. 8..2048 genişlik ve yükseklik, keskin/pürüzsüz bitiş, ana renk ve varyasyon
   tohumunu belirle.
4. Kategori ile güvenli varlık adını seçip PNG + JSON tarifini kaydet.
5. **Kayıtlı çıktılar** akordeonundan eski tarifi aynı ekrana geri aç.

Başlıkta geri al, yinele ve tam ekran bulunur. F11 aynı Fullscreen API
kontrolüne bağlıdır; tarayıcı F11'i işletim sistemi düzeyinde ayırırsa görünür
tam ekran düğmesi yedektir.

## Prompt ne yapar?

Karar sırası açıktır: tıklanan katalog kartı → nesne sözlüğü → katalog araması
→ boyut/renk/bitiş değiştiricileri. Eşleşmeyen metin seçili tarife düşmez;
görsel değiştirilmeden “sözlükte yok” diye bildirilir.

| Girdi                 | Gerçek davranış                                             |
| --------------------- | ----------------------------------------------------------- |
| `mor kristal 256×128` | Mineral tarifini kurar, boyutu ve ana rengi uygular         |
| `pembe solucan`       | Kapsüller, baş ve gözden oluşan ayrı solucan tarifini kurar |
| `pürüzsüz yeşil`      | Açık belgenin evrensel renk/bitiş kararlarını değiştirir    |
| bilinmeyen nesne      | Belgeyi korur; uydurma eşleşme yapmaz                       |

Bugünkü nesne sözlüğü `solucan / worm / kurtçuk / larva` tarifini içerir.
Yeni bir nesne yalnız anahtar kelime eklenerek desteklenmiş sayılmaz; geçerli,
render edilen ve piksel regresyon testi olan gerçek bir `SpriteDoc` kurucusu
ister. Yedi katalog ailesi kristal, organik küme, zemin, sıvı, yapı, yüzey ve
parıltı gibi genel başlangıçları kapsar.

## Kamera ve büyük çıktı

Dama deseni görüntünün arkasındaki artboard'un parçasıdır; görüntüyle birlikte
pan eder. Sabit dünya ızgarası sahnede kaldığı için hareketin nesne taşıma
değil kamera hareketi olduğu görünür. Tekerlek zoomu imlecin altındaki noktayı
sabit tutar ve iki parmak merkezi de izler.

Motorun boyut sınırı 128 değil **2048**dir. Canlı önizleme 24 ms bütçeye göre
adaptif çözünürlük kullanır. 512 üstü çıktılar tarayıcıyı her duraklamada tam
çözünürlükle dondurmaz; kaydedilirken gerçek boyutta üretilir. Durum satırı
önizleme ve çıktı boyunu ayrı gösterir.

## Forge ile CLI gerçekten nasıl bağlı?

Tarayıcı PNG kodlamaz; belgeyi geliştirme sunucusuna gönderir. Sunucu,
`forge.ts render` ve `forge.ts qa` aynı Node-only fonksiyonu çağırır:

```text
createForgeArtifact
  → doğrulama
  → renderSprite
  → measureSprite
  → encodePng
```

Çıktı:

```text
output/<kategori>/<ad>.png
output/<kategori>/<ad>.json
```

CLI ile piksel özdeşliği ve kalite ölçümü:

```bash
pnpm exec tsx core/scripts/forge.ts render belge.json çıktı.png
pnpm exec tsx core/scripts/forge.ts qa çıktı.png --doc belge.json
pnpm exec tsx core/scripts/forge.ts qa çıktı.png --doc belge.json --json
```

Kaydetme yanıtı gerçek QA sonucunu taşır; başarısız bir metrik arayüzde
“geçti” diye gösterilmez.

## Ürün denetiminde kapanan kusurlar

- `UIRoot` olay engeli nedeniyle gerçek tarayıcıda tıklanmayan kontroller,
- kaymayan sol/sağ dış panel,
- 32/64/128'e kilitli boyut listesi,
- bilinmeyen promptta sahte geri dönüş,
- tohumu pikselde kullanmayan dört katalog varyasyonu,
- kamera dışında kalan dama zemini,
- Vite çıktısına girmeyen Jura / Exo 2 fontları,
- koda bağlı olmayan F11,
- ayrı ayrı kurulmuş sunucu ve CLI çıktı adımları,
- gelişmiş editörün pasif/yarım panel ve i18n kalıntıları.

Ayrıntılı motor ve ürün sözleşmesi
[`core/docs/visual-synthesis.md`](../../core/docs/visual-synthesis.md) §8 ve
§10'dadır.

## Phaser yok

`core/src/ui` DOM tabanlıdır. Forge oyun olmadığı için `createVolGame`
kurmaz; `vol-ui` ile kardeşliği barındırma kabuğunda değil CORE bileşen seti,
fontlar, i18n ve yaşam döngüsü kurallarındadır.
