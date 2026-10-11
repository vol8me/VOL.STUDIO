# Claude çalışma düzeni

Bu belge, Claude Code'un bu depoda hangi modelle ve hangi alt ajanlarla çalıştığını, bunun
ölçümle nasıl belirlendiğini ve neyi garanti etmediğini söyler. Amaç: hesap ya da makine
değişse de aynı düzen depoyla birlikte gelir; plan limiti daha uzun yeter; kalite düşmez.
Kısa davranış kuralları [CLAUDE.md](../CLAUDE.md) içindedir.

## Ne yapılandırıldı

| Dosya                       | İçerik                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `.claude/settings.json`     | Ana model `sonnet`, danışman modeli `opus`                                  |
| `.claude/agents/explore.md` | Yerleşik `Explore` ajanını Haiku'ya alır; salt okunur, kanıt satırı getirir |

Bilinçli olarak ayarlanmayanlar: `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`,
`CLAUDE_CODE_SUBAGENT_MODEL` ve `effortLevel`. `.claude/` içinde yalnız `settings.json` ile
`.claude/agents/` izlenir; `.claude/settings.local.json` kişiseldir ve git dışıdır. Bekçi:
`scripts/quality/tests/claudeConfig.test.mjs`.

## Ölçümün sonucu

1. **Varsayılan doğrudan çalışmaktır.** Tek aramalık dosya bulma, günlük okuma ve olgu
   sorusunda alt ajan aynı doğruluğu daha pahalıya ve daha yavaş verdi.
2. **Tek kazanç `Explore`'u Haiku'ya almaktır.** Aynı keşif işinde yerleşik (Sonnet) ajana
   göre yaklaşık %43 ucuz, bulgu eşit.
3. **Danışman en büyük limit kalemidir** ve bu depoda faydası ölçülmedi (aşağıda).

## Ölçüm tablosu

Aynı istem, aynı depo, ana oturum Sonnet. Tutarlar liste fiyatıdır (abonelik limiti değil);
her hücrede n 1 ile 3 arasıdır: yönü gösterir, oranı kesinleştirmez.

| İş (doğru cevap mekanik doğrulandı)           | Doğrudan            | Alt ajanla                                | Doğruluk                  |
| --------------------------------------------- | ------------------- | ----------------------------------------- | ------------------------- |
| 35 dosya aranan keşif, `Explore`'a devredildi | —                   | Haiku 0,091 $ (n=3), Sonnet 0,158 $ (n=3) | 35/35, yanlış 0           |
| 1809 satırlık günlükten 3 düşen test          | 0,083 $, 9 s (n=3)  | Haiku 0,127 $, 24 s (n=3)                 | 3/3, satır ve mesaj doğru |
| 21355 satırlık günlükten 3 düşen test         | 0,085 $, 12 s (n=2) | Haiku 0,103 $, 32 s (n=2)                 | 3/3, satır ve mesaj doğru |
| Tek olgu, resmî belgeden (sürüm sorusu)       | ≈0,13 $, 17 s (n=3) | Sonnet 0,702 $, 181 s (n=1)               | doğru                     |
| Belgede olmayan bayrak sorusu (tuzak)         | ≈0,15 $, 11 s (n=3) | Sonnet 0,400 $, 100 s (n=1)               | "yok" dedi                |
| Çok kaynaklı araştırma, 7 beklenen olgu       | 0,146 $, 33 s (n=1) | Sonnet 0,391 $, 124 s (n=1)               | 7/7                       |

Okuma: alt ajan yalnız `Explore` satırında kazandı, o da modeli değiştirdiği için. Diğer
beş satırda 1,2 ile 5,4 kat pahalı ve 2,7 ile 10 kat yavaştı. Bu yüzden günlük ve
araştırma ajanları depoya konmadı.

Koşullar ve sınırlar:

- Claude Code 2.1.296, 2026-10-11, tek makine ve tek depo, `-p` kipi. Arka plan görevleri
  kapalı (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`), yani alt ajan ön planda koştu.
- Soğuk ve ısınmış önbellek koşuları karışıktır; bu yüzden tutarlar arası küçük farklar
  anlam taşımaz, kat farkları taşır.
- Faz 1'de günlük ve araştırma koşuları geçersiz sayıldı: alt ajan arka planda başlayınca ana
  oturum yanıtı erken bitirdi. Aynı iş ön planda faz 2'de tekrarlandı; tabloda yalnız o var.
- "Doğrudan" sütununda hiçbir alt ajan çağrılmadı; bu koşular bazen `.claude` içermeyen
  klonda, bazen daraltılmış açıklamalı klonda koştu (model işi kendisi yaptı).
- Uzantının ikilisiyle (2.1.288) dört koşu yalnız yön kontrolüdür.
- `effort: low` ile `maxTurns` bir günlük ajanında denendi; maliyeti ya da doğruluğu
  değiştirmedi, kullanılmadı.
- Toplam harcama yaklaşık 8,7 $ (61 koşu 7,49 $, iki sonda yaklaşık 1,2 $).
  Değerlendirme betikleri depoda yoktur.

## Neden böyle

**Ana model Sonnet, danışman Opus.** Anthropic'in danışman stratejisi yazısı (Nisan 2026,
Sonnet 4.6 + Opus 4.6) Sonnet'in Opus danışmanla SWE-bench Multilingual'da Sonnet tek
başınaya göre 2,7 puan artış ve görev başına maliyette %11,9 düşüş gösterdiğini yazar. 5.5
kuşağı için yayımlanmış ölçüm bulunamadı; bu depoda da ölçülmedi. Kullanıcı kararıyla açık
tutulur; maliyeti aşağıda.

**Haiku yalnız salt okunur, kanıt döndüren işte.** Resmî belge Haiku'yu hızlı keşif için
önerir. Haiku'nun olgusal aramada uydurduğuna dair açık bir bildirim vardır
(anthropics/claude-code#93268: tek örnek, yanıt yok). Bu yüzden Haiku ajanı yazma aracı
taşımaz ve her bulguyu satır numarasıyla alıntılar. Bu depoda 35 dosyalık aramada bulgu
eşitti (35/35, yanlış 0).

**Neden tüm alt ajanları Haiku'ya zorlamıyoruz.** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`
açıkken ajan tanımındaki model alanı yok sayılır ve Claude çağrıda model veremez: genel
amaçlı ajan da karmaşık iş yapsa bile Haiku'ya düşer. Limit kazancı kaliteyle takas
edilmez.

**`Explore` açıklaması dardır.** "Tek bir desenin tek aramasıyla bulunacak şey için
KULLANMA" cümlesi, modelin küçük işi devretmesini engellemek içindir. Daraltılmış
açıklamanın kendisi ölçülmedi; ölçülen şey yalnız Haiku modelidir.

## Danışmanın maliyeti

Danışman her çağrıda konuşmanın tamamını önbelleksiz yeniden okur, Opus fiyatıyla ve plan
limitinden yer. Tek sondada 68 bin token bağlamda çağrı başına yaklaşık 0,38 $ ölçüldü;
maliyet bağlamla büyür. `-p` kipinde 61 koşuda danışman kendiliğinden hiç çağrılmadı;
etkileşimli oturumdaki çağrı sıklığı ölçülmedi.

Bu yüzden danışman limit kaleminin başındadır. İlk birkaç gerçek oturumdan sonra `/usage`
ile payına bakın. Beklentiyi karşılamıyorsa kapatın:

- Bir makinede: `.claude/settings.local.json` içinde
  `{ "env": { "CLAUDE_CODE_DISABLE_ADVISOR_TOOL": "1" } }`.
- Depoda kalıcı: `.claude/settings.json` içinden `advisorModel` satırını silin.

## Kaynak tweet'in iddiaları ve doğrulama

| İddia                                     | Durum                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Anthropic'in kurulumu"                   | Danışman özelliği resmî belgededir (deneysel). Önerilen kurulum komutu üçüncü taraf şablon deposundandır; çalıştırılmadı, aynı anahtarlar elle yazıldı. |
| "%97 daha ucuz"                           | Ölçüm değil: Haiku ile Opus'un çıktı token birim fiyat farkı, yalnız alt ajanın yazdığı tokenlara uygulanır. Oturum tasarrufu bu depoda ölçülmedi.      |
| `claude --advisor opus --subagents haiku` | `--advisor` vardır. `--subagents` yoktur: 2.1.288'de `unknown option '--subagents'`; resmî bayrak tablosunda da yok. Kalıcı karşılığı ayar dosyasıdır.  |
| Yorumlar                                  | Okunamadı: x.com 402 verdi, yardımcı uç noktalar yalnız ana gönderiyi döndürdü. Bu belgedeki hiçbir şey yorumlara dayanmaz.                             |

## Sürüm bağımlı ölçümler

- Danışmanı proje ayarı açar: `/advisor` proje ayarıyla `Opus 5.5`, yalnız kullanıcı
  kaynağıyla (`--setting-sources user`) `off` yazdı (2.1.288).
- Proje ajanları yalnız bu depoda yüklenir (2.1.288).
- `haiku` takma adı 2.1.288'de Haiku 4.5'e, 2.1.296'da Haiku 5.5'e çözüldü (`modelUsage`
  ile ölçüldü). Haiku 5.5 Claude Code 2.1.293 ve üstünü ister; ajan takma adı kullandığı
  için sürüm yükselince kendiliğinden yeni modele geçer.
- Bu makinede kullanıcı varsayılanı zaten Sonnet'tir: `model` satırı burada davranışı
  değiştirmez, başka hesapta değiştirir.

## Sınırlar: depo neyi garanti etmez

- **Öncelik.** Yönetilen ayar > yerel > proje > kullanıcı. Proje ayarı kullanıcı ayarının
  üstündedir: oturumda `/model` ya da `/advisor off` yalnız o oturumu değiştirir. Kalıcı
  farklı tercih `.claude/settings.local.json` içindedir; örneğin `{ "model": "opus" }`.
- **Danışman hesaba bağlıdır.** Deneyseldir; yalnız Anthropic API'siyle çalışır (Bedrock,
  Vertex ve Foundry değil); `DISABLE_TELEMETRY` ya da özellik bayrağı çekimini kapatan bir
  değişken varsa kapalı kalır; kurumun `availableModels` listesi engelleyebilir. Ayar dosyası
  her hesapta gelir, danışmanın çalışması gelmeyebilir. Kontrol: `/advisor`.
- **Alt ajan da limitten yer** ve başlangıçta kendi bağlamını yükler. Bu yüzden ajan
  tanımında `omitClaudeMd` açıktır; alan Claude Code 2.1.271 ve üstünü ister.
- **Uzun bağlam her istekte limitten yer.** Konu değişince yeni oturum açmak en büyük
  kaldıraçtır (Anthropic maliyet rehberi).
- **Alt ajan modelini görmek:** `/tasks`. Payını görmek: `/usage`.

## Ölçülmeyenler

- Düzenin plan limitine toplam etkisi. Kanıtlamak için aynı türde iki görevi düzenin açık
  ve kapalı olduğu oturumlarda `/usage` ile karşılaştırmak gerekir.
- Danışmanın bu depoda kaliteyi artırıp artırmadığı.
- Etkileşimli oturumda alt ajanların arka planda başlaması: ölçümde kapalıydı, varsayılanın
  maliyeti bilinmiyor.
- Başka hesapların Opus ve danışmana erişimi.

## Yeni ajan eklemek

Ajan ancak aynı işte doğrudan çalışmaya karşı ölçümde kazanırsa girer: aynı istemi
`claude -p --output-format stream-json --verbose` ile iki düzende koşun, `Agent` çağrılarını
ve `modelUsage` tutarını okuyun, çıktıyı mekanik olarak doğrulayın. Tanıma açık `tools`
listesi yazın (Haiku ise yalnız `Read`, `Grep`, `Glob`) ve açıklamada ne zaman
KULLANMAYACAĞINI söyleyin; bekçi testi ikisini de ister.

## Kaynaklar

- [Danışman aracı](https://code.claude.com/docs/en/advisor)
- [Alt ajanlar](https://code.claude.com/docs/en/sub-agents)
- [Model yapılandırması](https://code.claude.com/docs/en/model-config)
- [Ayar başvurusu](https://code.claude.com/docs/en/settings-reference)
- [Maliyet yönetimi](https://code.claude.com/docs/en/costs)
- [The advisor strategy](https://claude.com/blog/the-advisor-strategy)
- [claude-code-templates#1133](https://github.com/davila7/claude-code-templates/pull/1133)
- [anthropics/claude-code#93268](https://github.com/anthropics/claude-code/issues/93268)
