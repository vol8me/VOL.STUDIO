# CORE ↔ Phaser sınırı

CORE generic mekanizma ve sunum yetenekleri sağlar; renderer ve sahne grafiği
Phaser'a aittir. Bu bağımlılık kaynak ağacında tek bir fiziksel sınıra
toplanır:

```text
core/src/phaser/**
```

Doğrudan `phaser` importu bu dizinin dışında yasaktır. Public export adları
değişmez; dizin paket içi sahipliği gösterir.

## Bridge envanteri

Exact envanter `scripts/quality/phaserBoundary.mjs` içindeki
`PHASER_BRIDGES` kaydıdır. Her bridge gerçekten Phaser import etmek, her
doğrudan Phaser importu da bu kayıtta bulunmak zorundadır. Böylece hem gizli
bağımlılık hem bayat kayıt kapıyı düşürür.

Bridge rolleri:

- `createVolGame.ts`: oyun boot ve renderer seçimi
- `ViewportManager.ts`: Phaser Scale/kamera adaptasyonu
- `entities/`: Phaser GameObject tabanlı entity adaptörleri
- `input/`: Phaser keyboard/pointer sağlayıcıları
- `rig/assembleRig.ts`: saf rig tanımını Phaser container/image ağacına kurma

Rig layout hesabı `core/src/rig/partLayout.ts` içinde saf TypeScript'tir.
Derece-radyan dönüşümü ve ebeveyn-yerel koordinat hesabı Phaser.Math
kullanmaz. Yalnızca scene, texture ve GameObject montajı bridge tarafındadır.

## AST tabanlı kapı

Workspace contract, repo tarafından zaten kullanılan TypeScript parser'ıyla
şu biçimlerin tamamını tarar:

- normal ve type-only `import`
- `export ... from`
- sabit `import()`
- `require()`

Tarama tracked dosyaların yanında henüz `git add` yapılmamış, ignore
edilmeyen yeni TypeScript dosyalarını da görür. Root kaynak dosyası, yasak
klasör importu, ledger dışı yeni bridge, bayat bridge ve geçerli bridge
fixture testleriyle ayrı ayrı sınanır.

## Bilinçli replacement yetenekleri

Bazı CORE mekanizmaları Phaser'da benzer bir yüzey olmasına rağmen kendi
uygulamasını taşır. Bunlar bridge değildir ve Phaser import etmez. Exact
gerekçe kaydı `PHASER_REPLACEMENTS` içindedir:

| Alan   | Gerekçe                                                     |
| ------ | ----------------------------------------------------------- |
| audio  | Adaptive stem, sidechain ve tek AudioContext yaşam döngüsü  |
| events | Tipli olay/yük sözleşmesi ve abone hata izolasyonu          |
| math   | Phaser kurulmadan headless çalışma ve sonlu sayı sözleşmesi |
| pool   | GameObject olmayan değerler için generic havuz              |
| random | Tohumlanabilir, state aktarılabilir deterministik akış      |
| time   | Sahne döngüsünden bağımsız sabit adım ve catch-up sınırı    |

Yeni replacement eklemek public bir mimari karardır; gizli bir Phaser importu
eklemek değildir.

## Renderer

`createVolGame({ renderer })` renderer isteğini açıkça Phaser config'ine
yazar. Varsayılan `auto`, WebGL kurulamadığında Canvas'a düşebilir; bu durum
diagnostics snapshot, overlay, konsol ve device benchmark tarafında
`fellBack` olarak görünür. `webgl` isteği fallback kabul etmez.
