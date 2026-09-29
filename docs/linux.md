# Linux

## Paketleme

```bash
pnpm build:linux-appimage <workspace-yolu>    # host'ta AppImage
pnpm build:linux-steamrt4 <workspace-yolu>    # steamrt4 SDK kabında (Steam, Deck)
```

`scripts/build-linux-appimage.mjs`, Tauri'nin AppImage sonlandırması
`linuxdeploy`/ELF strip adımında kırıldığında (`.relr.dyn`) AppDir'i elle
yeniden paketler: `productName`/`version` hedefin `tauri.conf.json`undan gelir,
WebKit medya çalışma zamanı (GStreamer elementleri, plugin scanner) AppDir'e
bağlanır ve zincir paketteki bir OGG ile sınanır. Başlatıcı paketin
`<paket>/src-tauri/linux.AppRun` dosyasıdır. Frozen workspace reddedilir; frozen ürün
etiketinin worktree'sinde paketlenir.

Host'ta üretilen paket host'un glibc'sine bağlanır; daha yeni glibc'li bir
host'ta üretilen AppImage SteamOS'ta açılmaz. Steam ve Deck için derleme
steamrt4 SDK kabında yapılır ve paketteki ELF'lerin glibc tavanı denetlenir
([steam-deck.md](steam-deck.md#dağıtım-yolu)).

## WebView çizim yolu

Kabuk (`configure_linux_webview`, kural tablosu `linux_webview_plan`)
WebView yaratılmadan önce çizim yolunu seçer; dışarıdan verilen değişkeni
ezmez, elle verilen değişken kuralı devre dışı bırakır.

| Oturum                                    | Karar                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Varsayılan                                | DMA-BUF çizicisi kapalı (bazı sürücülerde boş WebView), CPU kopyası                                    |
| Yerel Wayland, ekranı yalnız NVIDIA sürer | çizici açık + `__NV_DISABLE_EXPLICIT_SYNC=1`                                                           |
| gamescope                                 | çizici açık + `WEBKIT_FORCE_VBLANK_TIMER=1` ([steam-deck.md](steam-deck.md#çizim-ve-kare-zamanlaması)) |

Ölçüm (RTX 3050, KDE Plasma 6, WebKitGTK 2.52, 1920×1080, boş sahne):

| Yol                                          | Sonuç                        |
| -------------------------------------------- | ---------------------------- |
| Çizici kapalı                                | 18 FPS, web işlemi %89       |
| Çizici açık, yerel Wayland                   | açılışta Gdk Error 71, çöküş |
| Çizici açık, XWayland (`GDK_BACKEND=x11`)    | boş pencere                  |
| Çizici açık + explicit sync kapalı (Wayland) | 60 FPS, web işlemi %12       |

Boş pencere görülen sürücüde `WEBKIT_DISABLE_DMABUF_RENDERER=1` verilir.
AppImage başlatıcısı bu değişkeni dayatmaz ve linuxdeploy GTK kancasının
`GDK_BACKEND=x11` dayatmasını oturum türüne ve kullanıcı tercihine göre
Wayland'e çevirir; `GDK_BACKEND=x11` verilerek XWayland yolu seçilebilir.
