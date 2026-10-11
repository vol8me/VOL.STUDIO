# Claude Code

@AGENTS.md

Depo sınırları, kapılar ve belge yönlendirmesi yukarıdaki [AGENTS.md](AGENTS.md) içindedir; Claude Code onu
kendiliğinden okumadığı için bu dosya içe aktarır.

`.claude/` içinde yalnız `.claude/settings.json` (model yönlendirmesi) ve `.claude/agents/` (alt ajanlar)
izlenir; kişisel ayar `.claude/settings.local.json` ile oturum verisi git dışıdır. Araç
çıktıları paketin git dışı records/export alanına yazılır. Kalıcı belleğe yalnız
kullanıcının açık bellek güncelleme talebiyle yazılır.

Pencil erişimi için [pen.dev sözleşmesi](devtools/pen.dev/AGENTS.md) geçerlidir.
Claude'un araç izni kullanıcı kapsamını genişletmez; mevcut açık yetki tekrar sorulmaz.

## Model ve alt ajan düzeni

Ana model Sonnet, danışman Opus. Ölçümler, gerekçe ve sınırlar: [Claude çalışma düzeni](docs/claude-workflow.md).

- Varsayılan doğrudan çalışmaktır: arama, dosya okuma ve olgu sorusu Grep, Read ve WebFetch ile ana oturumda yapılır. Bu işlerde alt ajan ölçümde daha pahalı ve daha yavaştı, doğruluk eşitti; küçük işe dağıtım yapılmaz.
- `Explore` yalnız çok adımlı, açık uçlu, salt okunur keşif içindir.
- Alt ajan çıktısı kanıt değildir: karar ya da rapor taşıyan her bulgu (yol, satır, sayı) kaynağından doğrulanır.
- Danışman pahalıdır: kısa işte çağrılmaz, çok adımlı işte bağlam küçükken çağrılır.
- Konu değişince yeni oturum açılır: uzun bağlam her istekte plan limitinden yer.
