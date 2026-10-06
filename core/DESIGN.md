# CORE tasarım sözleşmesi

CORE mekanizma, sunum ve opt-in tarif katmanlarından oluşur. Mekanizma
oyun kuralı bilmez; sunum durum çizer ve niyet bildirir. Bir kural başka
oyunda farklı olabilir ise tarifte ya da tüketicide yaşar. Sunum bileşeni
kendi oyun durumunu tutmaz.

## Sınırlar

Public yüzey `package.json` içindeki `exports` haritasıdır. Oyun ve devtool
importları CORE'a girmez. Phaser importları kayıtlı köprülerle sınırlıdır;
[Phaser sınırı](docs/phaser-boundary.md) kayıtların ve kapının sözleşmesidir.
Public tip değişikliği yüzey kilidi ve yönetişim testiyle bilinçli yapılır.

## Yaşam döngüsü ve durum

Listener, timer ve abonelikler kapanışta kaldırılır. Birden çok bağımsız
kaynak `DisposableScope` altında toplanır. Simülasyon saati ile RNG durumu
alınabilir; deterministik çıktı yerel ayara bağlı sıralama kullanmaz.
Depolama `IStorageAdapter` arkasındadır. `AutosaveCoordinator` ile
`PersistedObservableState` yazma sırası ve hata durumunu koordine eder;
ilerleme `synced`, cihaz tercihi `device` kapsamındadır.

`LatestValueWriter.whenIdle()` yalnız kuyruk koordinasyonudur; `flush()` son
telafisiz yazım reddini taşır. Yeni başarılı son yazım önceki hatayı temizler.
State değişimi dinleyiciye bildirilmeden kuyruğa girer; dinleyicinin başlattığı
`flushAndDispose()` aynı son değeri ve hata sonucunu bekler.

## Sunum ve erişilebilirlik

DOM UI durumu tüketiciden alır. Listeler kimlikle güncellenir, kaydırma dış
panelde tanımlanır ve animasyona bağlı temizlik azaltılmış hareket kipinde de
biter. Tüketicisiz bileşenler katalogda, vitrin ve adıyla test altında kalır.
Dokunma hedefi politikası [vol-showcase](../devtools/vol-showcase/README.md) içindedir.
Görünen metin i18n anahtarıdır; dil değişimi modül yüklenirken kilitlenmez.

## Ses ve assetler

Ses üretimi devtool'da, çalma CORE'dadır. Çalma kodu mevcut Web Audio
bağlamını ve hedef düğümü tüketiciden alır. Bağlamın ömrü ve kilit açma
sahibi tüketicidir. Rig metadata sözleşmesi CORE'da doğrulanır; oyun
üretici aracı çalışma zamanında import etmez.

Detaylı API sözleşmeleri [primitifler](docs/primitives.md),
[i18n](docs/i18n.md), [müzik](docs/music-engine.md) ve
[tek atışlar](docs/sfx.md) belgelerindedir. Kaynak ve test bu belgelerin
anlattığı davranışın doğrulanabilir karşılığıdır.
