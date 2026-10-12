# VOL.FORGE tasarımı

## Neden var

VOL.TEST tek odalı bir savaş prototipidir. Hedef ürün ise kalıcı bir otomasyon ve savunma
dünyasıdır: binlerce konveyör, yüzlerce birim, oyuncu yokken işleyen dünya. Bu yükü taşıyıp
taşıyamayacağımızı bir tahminle değil, ölçümle söylemek için ayrı bir oyun paketi gerekti.
Oynanış bilinçli olarak küçük tutulur; her kural bir ölçüm sorusuna hizmet eder.

## Simülasyon

- Durum tile başına düz tiplenmiş dizilerdedir (`ForgeState`). Nesne tahsisi ve `Map` yoktur;
  adım başına ayırma yalnız taret atışı kayıtlarındadır.
- Konveyör eşyası sabit noktalıdır (`0..1023`, kare başına 4 yuva, 256 aralık). Kayan nokta
  yalnız birimlerin konumundadır; birim hareketi `Math.sqrt` ve dört işlem kullanır
  (`Math.hypot` ve trigonometri durum değiştiren kodda yoktur).
- Adım sırası sabittir: yol alanı, makineler, bantlar, dalga, uzamsal indeks, taretler, birimler.
  Komutlar adımlar arasında uygulanır ve `state.tick` ile damgalanır.
- Yol alanı çekirdekten genişlik öncelikli taramadır (`FlowSolver`). CORE `FlowField` hücre
  başına nesne ayırdığı için 65 bin hücrede seçilmedi; katı bina değişince en çok 15 adımda
  bir yeniden hesaplanır. `flowDir` bu yüzden anlık görüntüye girer: geçmişe bağlıdır.
- Taret hedefi eşit uzaklıkta düşük yuvayı seçer; hücre içi sıra geri yüklemede değişse de
  sonuç aynıdır. Çekirdek, yarıçapındaki taretleri levha harcayarak besler (lojistik
  sadeleştirmesi); bantla beslemek de çalışır.
- `Ledger` oyuncu başına son komut sırasını tutar. Yeniden gönderilen komut ikinci kez
  uygulanmaz, önbellekteki sonuç döner. Defter anlık görüntüye girer.

## Kalıcılık biçimi

`snapshot.ts` kalıcı durumun kanonik ikili biçimidir ve sonunda FNV-1a sağlaması taşır.
Okuyucu önce bütün alanları ayrıştırır, sonra uygular: bozuk dosya canlı durumu kirletmez.
Türetilmiş listeler ve chunk sürümleri kaydedilmez, geri yüklemede kurulur.

## Ölçüm araçları

`scripts/capacity.ts` adım süresini aşama aşama ve tek iş parçacığında çok dünya olarak
ölçer. `scripts/soak.ts` hızlandırılmış zamanda saatlerce işletip GC sonrası yığın eğimini
yazar. `scripts/scaling.ts` kapıdaki algoritmik ölçekleme oranını verir. Sayılar ve
çıkarımlar `docs/backend-research.md` içindedir.
