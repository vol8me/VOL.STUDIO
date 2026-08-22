# VOL.FORGE

`core/visual` için parametre editörü. Belgeyi kurar, canlı önizler ve çıktıyı
depoya yazar. Sözleşmesi [`core/docs/visual-synthesis.md`](../../core/docs/visual-synthesis.md)
§8'dedir.

Editör bir TÜKETİCİdir: çekirdeği çağırır, sonucu gösterir. Aynı belge CLI'dan
da render edilir ve **birebir aynı PNG'yi** verir (§8.15).

```bash
pnpm --filter @volstudio/vol-forge dev        # http://localhost:5175
pnpm --filter @volstudio/vol-forge test
pnpm --filter @volstudio/vol-forge gen:params # şemadan i18n anahtarları
```

## Phaser yok

`core/src/ui` tamamen DOM'dur ve Phaser'a bağlı değildir; editör de oyun
olmadığı için oyun kabuğunu kurmaz. `vol-ui` ile kardeşlik BİLEŞEN setinde ve
depo kurallarındadır, barındırma kabuğunda değil (§8.1).

## Düzen

| Bölge | İçerik                                                      |
| ----- | ----------------------------------------------------------- |
| Sol   | Katman listesi (sürükle-sırala, göz/kilit) + şekil ağacı    |
| Orta  | Önizleme: 1:1 zoom, 3×3 döşeme, yedi kanal, ölçüm rozetleri |
| Sağ   | Seçili düğümün parametreleri (şemadan) + belge ayarları     |
| Alt   | Palet şeridi · canlı sorunlar · kaydetme                    |

## Şekil ağacı üç işlemdir

Şemadaki her `field` parametresi zorunlu olduğu için "boş yuva" yoktur;
**değiştir · sar · çıkar** birlikte her ağacı her ağaca dönüştürür (§8.5).

## Göz simgesi belgeye yazılmaz

Görünürlük ve kilit editör durumudur. Gizlenen bir katman render'ı etkileseydi
editör ile CLI ayrışır ve turun kanıtı çökerdi; kapatma niyeti belgede zaten
`opacity: 0` ile ifade edilebiliyor (§8.4).

## Çıktı

```
output/<kategori>/<ad>.png   +   <ad>.json
```

PNG ve onu üreten belge yan yana durur; ajan aynı klasörü okur. Kategoriler
`PRESET_CATEGORIES` ile sabittir. Yazma işini geliştirme sunucusu yapar
(`/api/forge/save`) ve **PNG'yi sunucu üretir** — tarayıcıda ikinci bir
kodlayıcı olsaydı dosya CLI'ınkiyle aynı olmazdı (§8.11).
