# Claude çalışma düzeni

Bu belge, Claude Code'un bu depoda hangi modelle ve hangi alt ajanlarla çalıştığını, bunun
nedenini ve neyi garanti etmediğini söyler. Amaç: hesap ya da makine değişse de aynı düzen
depoyla birlikte gelir; plan limiti daha uzun yeter; kalite düşmez. Kısa davranış kuralları
[CLAUDE.md](../CLAUDE.md) içindedir.

## Ne yapılandırıldı

| Dosya                          | İçerik                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `.claude/settings.json`        | Ana model `sonnet`, danışman modeli `opus`                     |
| `.claude/agents/explore.md`    | `Explore` yerleşik ajanı Haiku'ya alır; salt okunur arama      |
| `.claude/agents/log-digest.md` | Uzun günlüğü okur, yalnız düşenleri satır numarasıyla döndürür |
| `.claude/agents/researcher.md` | Kaynaklı dış araştırma; Sonnet                                 |

Bilinçli olarak ayarlanmayanlar: `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`,
`CLAUDE_CODE_SUBAGENT_MODEL` ve `effortLevel`. `.claude/` içinde yalnız `settings.json` ile
`.claude/agents/` izlenir; `.claude/settings.local.json` kişiseldir ve git dışıdır. Bekçi:
`scripts/quality/tests/claudeConfig.test.mjs`.

## Neden böyle

**Ana model Sonnet, danışman Opus.** Anthropic'in danışman stratejisi yazısı (Nisan 2026,
Sonnet 4.6 + Opus 4.6) Sonnet'in Opus danışmanla SWE-bench Multilingual'da Sonnet tek
başınaya göre 2,7 puan artış ve görev başına maliyette %11,9 düşüş gösterdiğini yazar. 5.5
kuşağı için yayımlanmış ölçüm bulunamadı; Opus tek başına ile eşit olduğu gösterilmedi.
Danışman plan kilitlenmeden önce, aynı hata tekrarlayınca ve bitirmeden önce çağrılır: bu
depoda en pahalı hatalar tam bu üç yerde çıktı.

**Haiku yalnız salt okunur, kanıt döndüren işte.** Resmî belge Haiku'yu hızlı keşif ve
yüksek hacimli odaklı iş için önerir. Haiku'nun olgusal aramada uydurduğuna dair açık bir
bildirim vardır (anthropics/claude-code#93268: `claude-code-guide` alt ajanı olmayan bir
komut ve bayat bir model kimliği yazdı; tek örnek, yanıt yok). Bu yüzden Haiku ajanları
yazma aracı taşımaz ve her bulguyu satır numarasıyla alıntılar; uydurma riski taşıyan
araştırma Sonnet'tedir.

**Neden tüm alt ajanları Haiku'ya zorlamıyoruz.** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`
açıkken ajan tanımındaki model alanı yok sayılır ve Claude çağrıda model veremez: genel
amaçlı ajan da, karmaşık çok adımlı iş yapsa bile Haiku'ya düşer. Limit kazancı
(her alt ajan kendi istekleriyle plan limitinden yer) kaliteyle takas edilmez.

## Kaynak tweet'in iddiaları ve doğrulama

| İddia                                     | Durum                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Anthropic'in kurulumu"                   | Danışman özelliği resmî belgededir (deneysel). Önerilen kurulum komutu üçüncü taraf şablon deposundandır; çalıştırılmadı, aynı anahtarlar elle yazıldı. |
| "%97 daha ucuz"                           | Ölçüm değil: Haiku ile Opus'un çıktı token birim fiyat farkı, yalnız alt ajanın yazdığı tokenlara uygulanır. Oturum tasarrufu bu depoda ölçülmedi.      |
| `claude --advisor opus --subagents haiku` | `--advisor` vardır. `--subagents` yoktur: 2.1.288'de `unknown option '--subagents'`. Kalıcı karşılığı ayar dosyasıdır.                                  |
| Yorumlar                                  | Okunamadı: x.com 402 verdi, yardımcı uç noktalar yalnız ana gönderiyi döndürdü. Bu belgedeki hiçbir şey yorumlara dayanmaz.                             |

## Ölçülenler (Claude Code 2.1.288)

- Danışmanı proje ayarı açar: `/advisor` proje ayarıyla `Opus 5.5`, yalnız kullanıcı
  kaynağıyla (`--setting-sources user`) `off` yazdı.
- Proje ajanları yalnız bu depoda yüklenir: `--setting-sources user` ile `log-digest` ve
  `researcher` listede yoktur.
- Gerçek `Explore` delegasyonunu Haiku koşturdu (`claude-haiku-4-5-20251001`, 949 giriş ve
  444 çıkış token); ana oturum Sonnet'te kaldı. Tek koşudur: tasarruf oranı çıkarılmaz.
- `haiku` takma adı 2.1.288'de Haiku 4.5'e, 2.1.296'da Haiku 5.5'e çözüldü (`modelUsage`
  ile ölçüldü). Haiku 5.5 Claude Code 2.1.293 ve üstünü ister; ajanlar takma adı kullandığı
  için sürüm yükselince kendiliğinden yeni modele geçer.
- Bu makinede kullanıcı varsayılanı zaten Sonnet'tir: `model` satırı burada davranışı
  değiştirmez, başka hesapta değiştirir. Ajan ve danışman satırları değiştirir.

## Sınırlar: depo neyi garanti etmez

- **Öncelik.** Yönetilen ayar > yerel > proje > kullanıcı. Proje ayarı kullanıcı ayarının
  üstündedir: oturumda `/model` ya da `/advisor off` yalnız o oturumu değiştirir. Kalıcı
  farklı tercih `.claude/settings.local.json` içindedir; örneğin `{ "model": "opus" }`.
- **Danışman hesaba bağlıdır.** Deneyseldir; yalnız Anthropic API'siyle çalışır (Bedrock,
  Vertex ve Foundry değil); `DISABLE_TELEMETRY` ya da özellik bayrağı çekimini kapatan bir
  değişken varsa kapalı kalır; kurumun `availableModels` listesi engelleyebilir. Ayar dosyası
  her hesapta gelir, danışmanın çalışması gelmeyebilir. Kontrol: `/advisor`.
- **Danışman limitten yer.** Her çağrı konuşmanın tamamını önbelleksiz yeniden okur ve plan
  limitine sayılır. Çok uzun oturumda pahalıdır; konu değişince yeni oturum açmak en büyük
  kaldıraçtır (Anthropic maliyet rehberi).
- **Alt ajan da limitten yer** ve başlangıçta kendi bağlamını yükler. Bu yüzden ajan
  tanımlarında `omitClaudeMd` açıktır; alan Claude Code 2.1.271 ve üstünü ister.
- **Alt ajan modelini görmek:** `/tasks`. Payını görmek: `/usage`.

## Değiştirme ve kapatma

- Danışmanı bir makinede kapatmak: `.claude/settings.local.json` içinde
  `{ "env": { "CLAUDE_CODE_DISABLE_ADVISOR_TOOL": "1" } }`.
- Tweet'in "tüm alt ajanlar Haiku" kipi kişisel tercih olarak yerel ayara yazılır
  (`CLAUDE_CODE_SUBAGENT_MODEL=haiku` ve `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`, Claude Code
  2.1.257 ve üstü); projede varsayılan yapılmaz, bekçi testi bunu reddeder.
- Yeni ajan eklerken: açık `tools` listesi yaz; Haiku ise yalnız `Read`, `Grep`, `Glob`.

## Ölçülmeyenler

Bu düzenin plan limitine gerçek etkisi bu depoda ölçülmedi. Kanıtlamak için aynı türde iki
görevi düzenin açık ve kapalı olduğu oturumlarda `/usage` ile karşılaştırmak gerekir.

## Kaynaklar

- [Danışman aracı](https://code.claude.com/docs/en/advisor)
- [Alt ajanlar](https://code.claude.com/docs/en/sub-agents)
- [Model yapılandırması](https://code.claude.com/docs/en/model-config)
- [Ayar başvurusu](https://code.claude.com/docs/en/settings-reference)
- [Maliyet yönetimi](https://code.claude.com/docs/en/costs)
- [The advisor strategy](https://claude.com/blog/the-advisor-strategy)
- [claude-code-templates#1133](https://github.com/davila7/claude-code-templates/pull/1133)
- [anthropics/claude-code#93268](https://github.com/anthropics/claude-code/issues/93268)
