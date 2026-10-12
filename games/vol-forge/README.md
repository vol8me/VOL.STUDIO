# VOL.FORGE

Kalıcı, çok oyunculu fabrika ve savunma dünyasının kanıt oyunu. Amaç bir ürün değil,
şu soruyu ölçmektir: binlerce konveyör ve yüzlerce birimle, oyuncu yokken de işleyen,
8-12 oyunculu resmi dünyalar bu monorepodaki Colyseus katmanıyla taşınabilir mi? Ölçümler ve
karar [backend araştırmasındadır](../../docs/backend-research.md); tasarım gerekçesi
[DESIGN.md](DESIGN.md) içindedir.

- `pnpm --filter @volstudio/vol-forge dev`: web geliştirme.
- `pnpm --filter @volstudio/vol-forge tauri dev`: native geliştirme.
- `pnpm --filter @volstudio/vol-forge build`: gönderilen web çıktısı.
- `pnpm --filter @volstudio/vol-forge test:coverage`: birim testi ve kapsam.
- `pnpm --filter @volstudio/vol-forge test:e2e`: Chromium ve WebKit kabulü.
- `pnpm --filter @volstudio/vol-forge capacity -- --belts 8000 --units 400`: başsız adım maliyeti.
- `node --expose-gc --import tsx scripts/soak.ts --hours 10`: hızlandırılmış zamanda sızıntı denetimi.

Android için `pnpm --filter @volstudio/vol-forge tauri android init` çalıştırılır;
üretilen başlatıcı ikonları ürünün `src-tauri/icons/icon.png` kaynağından
`tauri icon` ile yenilenir. Cihaz kabulü [yeni oyun rehberindedir](../../docs/new-game.md).

Başlangıç ikonu ürün kimliğinden deterministik üretilir; yayın öncesi ürün
çizimiyle değiştirilir.
