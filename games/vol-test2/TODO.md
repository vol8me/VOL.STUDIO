# İş listesi

- [ ] İstemci dilimi: statik sanat chunk dokusuna pişer, PropField yalnız hareketli katmanları çizer; tank
      görünümü, `FollowCamera` ile sabit px/tile, birim hareket yumuşatıcısı, örümcek LOD'u.
      Kapanır: gerçek yakınlıkta (≈0,5 px/birim) ekran görüntüsü vol-test tankıyla yan yana değerlendirildi;
      yürüyüş ölçümü (adım/sn/bacak, acil oranı, kayma) oyun içi hareket kaynağıyla yeniden koşuldu.
- [ ] Açık dünya: 512² biyomlu arazi (tam sayı gürültü, tohumdan), geçilemez su ve kayalık, yuvadan çekirdeğe
      arazi yolu garantisi, yuvalar, inşa menzili, arazi hız çarpanları. Yol alanı 512²'de ölçülür; pencereli
      alan yapılmaz. Kapanır: her yuvadan arazi yolu testi, geçilemez arazide duvarlanma yok, Android'de
      `FlowSolver.compute` süresi ölçülmüş.
- [ ] İklim: ayrık hava türü ve mevsim tick'ten saf fonksiyon olarak türer; yalnız ayrık tür oyun
      çarpanına girer (tam sayı yüzde). CORE'a terfi ayrı değişikliktir ve vol-test bit özdeş kalır.
      Kapanır: iki motorda aynı tür dizisi, vol-test piksel temelleri değişmedi.
- [ ] Etki, ses ve arayüz: toz, namlu ışığı, kıvılcım, patlama, inşa halkası, sarsıntı, titreşim; CORE sfx
      ile ses; CORE hud/touch ile HUD, sanal çubuk, mini harita, hava parçacıkları, mevsim tonu.
      Kapanır: etkileşimli kare bütçesi `quality.json`'a göre, e2e Chromium ve WebKit.
- [ ] Android tam destek: dokunmatik denetim, güvenli alan, geri tuşu, titreşim, grafik katmanı, chunk doku
      bütçesi katman başına, manifest kayması testi, `ws://` açık metin politikası. Kapanır: bağlı cihaza
      kurulum ve kabul kaydı (`data-fps`, `data-step-p99`, `data-hash-checks`); ölçülmeyen madde yazılmaz.
- [ ] Laboratuvar: iş yükü testleri (sahte Phaser sahnesi, kapsam eşiği düşmeden), kayıt defteri ↔ belge
      eşitliği, lab belgesi, oyunun ajan sözleşmesi, lab komut satırı, e2e duman testi.
      Kapanır: `pnpm high` yeşil, `pnpm signoff` arka planda koştu ve sonucu kayıtlı.
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
- [ ] `FactorySession`, kilit adımlı istemci ve ikili protokolü ikinci bir oyun istediğinde
      `@volstudio/network`a taşı. Kapanır: ikinci tüketici ve paylaşılan testler.

## Kapatılanlar

- [x] Gömülü oyuncu (sim): sunucunun verdiği JOIN/LEAVE ile yuva, MOVE niyeti (süre sonunda söner), bina
      çarpışması, otomatik ateş, ölüm ve doğuş, inşa menzili; SIM_VERSION 2, anlık görüntü v2, yeni altın
      karma, günlük tekrarında özdeş durum, iki istemcide aynı `stateHash` testle kanıtlı.

- [x] Kanıt oyunu: başsız simülasyon, kalıcı Colyseus dünya odası (günlük, çökme kurtarma, yeniden
      eşitleme), kilit adımlı Phaser istemcisi, yük testi, motor/cihaz determinizmi ve ölçüm
      sonuçları [araştırma belgesinde](../../docs/backend-research.md).
