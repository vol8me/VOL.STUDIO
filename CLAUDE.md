# Claude Code çalışma notları

Depo sözleşmesi [AGENTS.md](AGENTS.md) içindedir. Bu dosya Claude Code'un
araç kullanımını tarif eder; depo kurallarını gevşetmez.

## Başlangıç ve kapsam

Çalışmaya AGENTS.md, açık iş listesi ve ilgili paketin belgeleriyle başlanır.
Dal, çalışma ağacı ve son commitler okunur. Yarım kalan iş varsa kapsamı
belirlenir; kullanıcıya ait değişiklikler üzerine yazılmaz. Mimari sorularda
mevcut `graphify-out/` çıktısı kontrol edilir, sonucu kaynakla doğrulanır.

Kapsam ve dışa açık işlem yetkisi kullanıcıya aittir. Geçerli açık yetki aynı
oturum içinde yeniden sorulmaz; kapsam dışına taşılmaz. Commit, push, merge
ve etiket yalnız yetkilendirilmişse yapılır. İş bitiminde kendiliğinden commit
teklifi sunulmaz.

## Doğrulama ve raporlama

Kullanıcıyla Türkçe konuşulur. Rapor değişikliği, koşulan kapıları, kanıtı ve
kalan riski söyler. Koşulmayan kontrol, yapılmayan insan dinlemesi ya da cihaz
ölçümü tamamlanmış gibi yazılmaz. Düşen tek kapı yeniden koşulur; uzun test ve
build koşuları bağımsız işlere devam edilebilecek biçimde başlatılır.

Servis düzeltmesi kullanıcının açık oturumunda, native değişiklik gerçek
uygulama paketinde doğrulanır. Cihazda bırakılan geçici dosya ve kısayollar
raporlanır. Görünüm beğenisi ve ses dinleme kararı insanındır.

## Araçlar ve kayıtlar

`.pen` dosyaları yalnız Pencil MCP üzerinden okunur ve değiştirilir.
Paketin özel AGENTS.md sözleşmesi önce okunur. Kod değişince mevcut graphify
çıktısı güncellenir. Yerel araç çıktısı paketin git dışı records/ ya da
export/ dizinine yazılır; geçici çalışma dosyaları scratch dizininde kalır.
Kalıcı belleğe yalnız kullanıcının açık bellek güncelleme talebiyle yazılır.

Sır, kimlik, cihaz adresi, oturum belirteci ve ayıklanmamış ham kişisel veri
koda, belgeye, loga ve commit'e girmez. Teknik belge bugünkü sözleşmeyi anlatır;
oturum günlüğü, geçici plan ve başka projelerin adı repoda tutulmaz.
