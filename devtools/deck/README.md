# @volstudio/deck

Steam Deck ölçüm sondası ve devkit otomasyonu. Ayrı sonda uygulaması,
WebView ortamını ve oyun bileşenlerini cihaz üzerinde ölçer; cihaz kaydı
ürün kabulünün yerine geçmez.

## Komutlar

Repo kökünden:

```bash
pnpm deck
pnpm --filter @volstudio/deck typecheck
pnpm --filter @volstudio/deck test
```

Cihaz seçimi, dağıtım, ölçüm ve paketleme akışı
[Steam Deck rehberinde](../../docs/steam-deck.md) tanımlıdır.
Cihaz adresleri ve ham kişisel veriler repoya yazılmaz. Yerel ölçüm
kayıtları records/ altında git dışıdır.

[Tasarım sözleşmesi](DESIGN.md)
