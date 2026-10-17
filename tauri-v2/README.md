# @volstudio/tauri-v2

Tauri v2 uygulamalarının paylaşılan native kabuğu ve JavaScript platform
adaptörleri. Kendi ürün kimliği ya da uygulama bağlamı yoktur; her oyun
kendi native crate'inde bağlam üretir ve kabuğu çağırır.

Adaptörler kalıcılık, ekran kipi, oturum türü, sistem uyku/uyanışı, kapanış,
titreşim ve Steamworks yüzeylerini sağlar. Kabuk türü, oturum ve işaretçi
türü ayrı sorulardır; bir platform adı diğerlerinin yerine kullanılmaz.

## Doğrulama

```bash
pnpm --filter @volstudio/tauri-v2 typecheck
pnpm --filter @volstudio/tauri-v2 test
pnpm exec just rust
```

Native uygulama kurmak için [yeni oyun rehberi](../docs/new-game.md),
platform ayrıntıları için [Linux](../docs/linux.md),
[Steam Deck](../docs/steam-deck.md) ve [Android](../docs/android.md).
Mimari sözleşme [DESIGN.md](DESIGN.md) içindedir.
