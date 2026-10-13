# VOL.FORGE

Kalıcı, çok oyunculu fabrika ve savunma dünyasının kanıt oyunu. Amaç bir ürün değil, şu soruyu
ölçmektir: binlerce konveyör ve yüzlerce birimle, oyuncu yokken de işleyen, 8-12 oyunculu resmi
dünyalar bu monorepodaki Colyseus katmanıyla taşınabilir mi? Ölçümler ve karar
[backend araştırmasındadır](../../docs/backend-research.md); tasarım gerekçesi
[DESIGN.md](DESIGN.md) içindedir.

## Çalıştırma

İki süreç gerekir: dünya sunucusu ve istemci.

```sh
pnpm --filter @volstudio/vol-forge server:dev      # 127.0.0.1:2567, dünya world-1 (lockstep)
pnpm --filter @volstudio/vol-forge dev             # tarayıcı geliştirme
```

İstemci adresi ve dünya bağlantı formundan ya da `?server=http://127.0.0.1:2567&world=world-1`
ile verilir. Yoğun ölçüm dünyası için sunucuyu `VOL_FORGE_BELTS=8000 VOL_FORGE_UNITS=400`
ile başlat; öteki ayarlar `server/index.ts` içindeki `runtimeSettings` işlevindedir. Veri
dizini `VOL_FORGE_DATA` (varsayılan `records/forge-data`, git dışı).

## Komutlar

- `pnpm --filter @volstudio/vol-forge build`: istemci ve sunucu paketi.
- `pnpm --filter @volstudio/vol-forge test:coverage`: birim testi ve kapsam.
- `pnpm --filter @volstudio/vol-forge test:e2e`: Chromium ve WebKit, iki oyunculu gerçek sunucu.
- `pnpm --filter @volstudio/vol-forge capacity -- --belts 8000 --units 400`: başsız adım maliyeti.
- `pnpm --filter @volstudio/vol-forge loadtest -- --worlds 20 --processes 4 --belts 8000 --units 400`:
  ayrı süreçlerde sunucu, gerçek WebSocket botları; `--sample 60` pencere örnekleri (kararlılık koşusu).
- `pnpm --filter @volstudio/vol-forge exec tsx scripts/schema-control.ts`: Colyseus Schema kontrol ölçümü.
- `pnpm --filter @volstudio/vol-forge exec tsx scripts/engines.ts`: Node, Chromium ve WebKit determinizmi.
- `pnpm --filter @volstudio/vol-forge exec tsx scripts/device-bench.ts --cdp <adres> --label <ad>`:
  uzak Chromium'da (Android Chrome, Deck) determinizm ve adım süresi; sonuç `records` altındaki `devices` dizinine yazılır.
- `scripts/device-app.ts`: gerçek istemciyi uzak Chromium'da açıp HUD ölçümlerini ve dokunmatik yerleştirmeyi
  örnekler (ortam değişkenleri dosyanın başında).
- `node --expose-gc --import tsx scripts/soak.ts --hours 10`: hızlandırılmış zamanda sızıntı denetimi.

Ölçüm çıktıları `records` dizinine yazılır ve git dışıdır.

## Cihaz ve paketleme

İstemci kabuğu `src-tauri/` içindedir. Android için `pnpm --filter @volstudio/vol-forge tauri android init`
çalıştırılır; üretilen başlatıcı ikonları `src-tauri/icons/icon.png` kaynağından `tauri icon` ile
yenilenir. Cihaz kabulü [yeni oyun rehberindedir](../../docs/new-game.md). Paketli uygulama
henüz cihazda ölçülmedi; cihaz sayıları tarayıcı motorundandır.

Başlangıç ikonu ürün kimliğinden deterministik üretilir; yayın öncesi ürün çizimiyle değiştirilir.
