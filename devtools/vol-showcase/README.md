# @volstudio/vol-showcase

CORE UI'ın canlı vitrini ve ölçüm laboratuvarı. Bileşen uygulamaları
CORE'da, örnek düzen ve etkileşimler bu pakettedir. Tarayıcı yolu Phaser
ve native kabuk gerektirmez; yerel pencere ortak Tauri kabuğunu tüketir.

## Başlangıç

```bash
pnpm --filter @volstudio/vol-showcase dev
pnpm --filter @volstudio/vol-showcase tauri dev
```

BUTTONS, TEXT, FORMS, PANELS/YÜKLEME, HUD, KARTLAR, WORKBENCH, PALETTE,
ADVANCED, SCROLL ve TOUCH bileşen örneklerini; SES ses laboratuvarını,
KİMLİK tema, malzeme, ikon ve imleç kimliğini gösterir. Shift+B veya
?bench sekmeler boyunca kare ölçümünü açar. Canlı yüzey envanteri
[CATALOG](../../docs/ui/CATALOG.md), kalan işler [UI TODO](../../docs/ui/TODO.md)'dur.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-showcase build
pnpm --filter @volstudio/vol-showcase test:e2e
```

E2E gönderilen build'i Chromium ve WebKit'te sınar; piksel temeli yalnız
Chromium'dadır. Temel yalnız bilinçli görsel değişiklikte yenilenir.
Browser sonucu native ses, fiziksel girdi veya insan beğenisi yerine yazılmaz.
Tüketicisiz CORE bileşeni burada örnek ve CORE'da kendi testiyle yaşar.

[DESIGN](DESIGN.md) native build ve cihaz komutlarını;
[UI sözleşmesi](../../docs/ui/CONTRACT.md) davranış kurallarını;
[VERIFICATION](../../docs/ui/VERIFICATION.md) ölçüm yöntemini ve kabul sınırlarını;
[Windows](../../docs/windows.md) piksel/platform ortamını açıklar.
