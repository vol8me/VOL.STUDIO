# Claude Code

Depo sınırları ve belge yönlendirmesi [AGENTS.md](AGENTS.md) içindedir.

`.claude/` içinde yalnız `.claude/settings.json` (model yönlendirmesi) ve `.claude/agents/` (alt ajanlar)
izlenir; kişisel ayar `.claude/settings.local.json` ile oturum verisi git dışıdır. Araç
çıktıları paketin git dışı records/export alanına yazılır. Kalıcı belleğe yalnız
kullanıcının açık bellek güncelleme talebiyle yazılır.

Pencil erişimi için [pen.dev sözleşmesi](devtools/pen.dev/AGENTS.md) geçerlidir.
Claude'un araç izni kullanıcı kapsamını genişletmez; mevcut açık yetki tekrar sorulmaz.

## Model ve alt ajan düzeni

Ana model Sonnet, danışman Opus; alt ajanlar ve gerekçe: [Claude çalışma düzeni](docs/claude-workflow.md).

- Hacimli ve bağımsız iş alt ajana gider: geniş arama `Explore`, uzun günlük `log-digest`, kaynaklı dış araştırma `researcher`. Karar, tasarım ve düzenleme ana oturumda kalır. Bağımsız işler aynı mesajda paralel başlatılır.
- Alt ajan çıktısı kanıt değildir: bir kararı ya da raporu taşıyan her bulgu (yol, satır, düşen test, sayı) kaynağından doğrulanır.
- Danışman plan kilitlenmeden önce, aynı sorun iki kez düzeltilemediğinde ve "bitti" demeden önce çağrılır.
- Konu değişince yeni oturum açılır: uzun bağlam her istekte plan limitinden yer.
