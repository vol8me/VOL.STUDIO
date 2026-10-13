# İş listesi

- [ ] Oynanış ve ürün görsellerini ekle. Kapanır: ürünün kendi kabul senaryoları geçer.
- [ ] Paketli uygulamayı cihazda ölç: Windows WebView2, Android WebView ve Steam Deck (WebKitGTK).
      Cihaz sayıları bugün yalnız Chromium motorundandır; WebKitGTK ve paketli kabuk ölçülmedi.
      Kapanır: her platformda `data-fps`, `data-step-p99` ve `data-hash-checks` ile en az 5 dakikalık
      yoğun dünya oturumu kaydı, `resyncs` 0.
- [ ] 24–72 saat gerçek zamanlı kararlılık koşusu ve üretim sunucusu donanımında yük testi. Linux yük
      testi yalnız Steam Deck'te kısa süreli koştu (40 sn); en uzun gerçek zamanlı koşu 45 dakikadır ve
      yalnız Windows'tadır. Kapanır: `loadtest --sample 60` ile hedef Linux sunucusunda ve Windows'ta
      24 saat, RSS ve veri dizini eğimi sıfıra yakın, `faults` 0; `crash.test.ts` Linux'ta geçer.
- [ ] Ağ koşullarında ölçüm: %1–3 paket kaybı ve 50–200 ms gecikme altında kilit adımlı gecikme,
      yeniden bağlanma ve yeniden eşitleme oranı. Bugünkü koşular döngü içi (loopback) ağdadır.
      Kapanır: bozulmuş ağda ack p99, `lagTicks` dağılımı ve `resyncs` raporu.
- [ ] Kimlik ve taşıma güvenliği: oyuncu anahtarı yerine hesap/Steam kimliği ve belirteç, WSS/TLS,
      sunucu adresi politikası. Kapanır: sahte kimlikle katılım ve anahtar çalma negatif testleri.
- [ ] Süreç keşfi ve eşleştirme: dünya-süreç eşlemesi, oyuncuyu doğru sürece yönlendirme, süreç
      düşünce dünyayı başka sürecin açması (kilit ve epoch korunarak). Kapanır: iki süreçli yönlendirme
      ve süreç öldürme kabulü.
- [ ] Savaş sisi ve gizli bilgi: `aoi` biçiminin istemci desteği ve PvP için kilit adım dışı yol.
      Kapanır: sis dışındaki yapıyı istemci belleğinde göstermeyen e2e.
- [ ] Güç kesintisi dayanıklılığı: `kill -9` değil, işletim sistemi düzeyinde yazma kaybı altında
      günlük/anlık görüntü semantiği (disk önbelleği). Kapanır: fsync davranışının hedef disk ve
      dosya sisteminde ölçülmüş kaydı.
- [ ] `ForgeSession`, kilit adımlı istemci ve ikili protokolü ikinci bir oyun istediğinde
      `@volstudio/network`a taşı. Kapanır: ikinci tüketici ve paylaşılan testler.

## Kapatılanlar

- [x] Kanıt oyunu: başsız simülasyon, kalıcı Colyseus dünya odası (günlük, çökme kurtarma, yeniden
      eşitleme), kilit adımlı Phaser istemcisi, yük testi, motor/cihaz determinizmi ve ölçüm
      sonuçları [araştırma belgesinde](../../docs/backend-research.md).
