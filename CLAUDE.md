# CLAUDE.md

Claude Code bu dosyayı her oturumda kendiliğinden okur. Deponun çalışma
sözleşmesi `AGENTS.md`dedir. Burada yalnız Claude Code'a özgü, oturumlardan
damıtılmış pratikler vardır. Çelişki çıkarsa `AGENTS.md` geçerlidir.

## Oturum başlangıcı

- Önce `AGENTS.md`, sonra açık işler için `TODO.md` ve ilgili paketin
  `TODO.md`si okunur.
- Dal, çalışma ağacı ve son commit'ler kontrol edilir. Önceki oturumdan
  yarım kalmış bir iş varsa önce o raporlanır.
- Mimari ve bağımlılık sorularında `graphify-out/` varsa önce ona sorulur.
- Kalıcı bellek bir önceki oturumun kararlarını taşır. Bellekteki dosya,
  işlev ya da bayrak kullanılmadan önce hâlâ var olduğu doğrulanır.

## İletişim

- **Kullanıcıyla her zaman Türkçe konuşulur:** yanıt, soru, özet ve rapor dahil.
- **Rapor kısa ve kanıtlıdır:** çalıştırılan komut, sonuç, kalan risk. Koşulmayan kapı yazılmaz.
- **Commit teklif etmek de bir tekliftir.** İş bitince "commit edeyim mi?" diye sorulmaz; kullanıcının açık talebi beklenir.
  - Bir plan için toplu izin verilmişse izin kapsamının dışına çıkılmaz.
  - Push, merge ve etiket için ayrıca açık talep gerekir.
- **Belirsizlikte:** kararı kullanıcıya ait olan yerde sorulur. Makul bir varsayımla ilerlenebiliyorsa varsayım raporda söylenir.

## Uzun işler

- **Çok adımlı iş fazlara bölünür.** Her faz kendi kapısı ve commit'iyle kapanır; bağlam penceresi dolsa da iş kaldığı yerden sürer.
  - Plan ve faz durumu kalıcı belleğe yazılır.
  - "Plana devam et" talimatı o kayıttan eksiksiz sürdürülür.
- **Toplu TODO kapatma:** önce madde madde doğrulanmış, dürüst bir analiz sunulur ve onay alınır. Onaydan sonra yarım iş bırakılmaz.
- **Uzun koşular arka planda başlatılır:** tam audio kapsamı, kap içi derleme, cihaz ölçümü. Tamamlanma bildirimi beklenir; `sleep` zinciri kurulmaz. Bu sırada bağımsız işe devam edilir.
- **Düşen tek kapı** zincirin tamamı yerine tek başına yeniden koşulur.

## Doğrulama pratikleri

- **Servis ya da sunucu düzeltmesi:** kullanıcının açık portu ya da oturumu yenilenir ve ekran görüntüsüyle doğrulanır.
- **Android:** native proje, ikon ya da Tauri kabuğu değişince uygulama bağlı her cihaza kurulur, açılır ve ekran görüntüsü alınır.
- **Steam Deck:**
  - Ölçüm devkit üzerinden yapılır (`docs/steam-deck.md`).
  - İnsan eli gereken ölçüm için kullanıcının cihaz başında olması istenir. Değilse sonuç "ölçülmedi" olarak kalır.
  - Cihazda deneme için bırakılan her şey raporda söylenir: kısayol, geçici dosya.
- **İnsan yargısı uydurulmaz.** Ses kalitesi ve görsel beğeni kullanıcınındır. Kapının geçmesi iyi ses ya da iyi görünüm demek değildir.

## Araçlar ve dosyalar

- **Pencil:** `.pen` dosyaları yalnız Pencil MCP araçlarıyla okunur ve yazılır.
- **Geçici dosyalar** oturumun scratchpad dizinine yazılır.
- **Kalıcı yerel çıktı:** oturumdan uzun yaşaması gereken yerel araştırma çıktısı (ölçüm sondası, ham kayıt) git dışı `.claude/` altına konur. Repodaki belge o yola işaret etmez; kalıcı bilgi belgeye özet olarak girer.
- **Graphify:** kod değiştikten sonra `graphify update .` ile tazelenir.

## Gizlilik

- **Kişisel veriler repoya girmez:** kullanıcının e-postası, platform kullanıcı adları, cihaz adresleri ve oturum belirteçleri koda, belgeye, commit'e ve paylaşılan ölçüm kaydına yazılmaz.
- **Ham ölçüm çıktısı** saklanmadan önce ayıklanır.
- **Kardeş projeler:** başka projelerin adları ve iç sınıf adları bu depoya yazılmaz.
