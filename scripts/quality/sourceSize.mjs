/**
 * KAYNAK DOSYA BOYUTU — doktrini bir karara çevirir.
 *
 * AGENTS.md ~600 satırdan sonra mantık sınırının yeniden düşünülmesini
 * istiyor. Bu bir yasak değil, bir DURAKSAMA noktası: bazı dosyalar meşru
 * biçimde büyüktür (bir showcase sekmesi kurucu koleksiyonudur, bir şema
 * dosyası veri taşır), bazıları ise gerçekten bölünmelidir.
 *
 * Zorlayan hiçbir şey olmadığında ikisi ayırt edilemez ve liste sessizce
 * büyür. Kapı bu yüzden BÖLMEYİ dayatmaz, GEREKÇE dayatır: eşiği aşan her
 * dosya ya küçülür ya da neden büyük kaldığını yazar.
 *
 * `EXPECTED_EXPORT_COUNT` ile aynı disiplin: sayı kendiliğinden kötü değildir,
 * kaydedilmemiş olması kötüdür.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** Doktrinin duraksama eşiği (AGENTS.md). */
export const LINE_THRESHOLD = 600;

/**
 * Eşiği bilinçli olarak aşan dosyalar ve GEREKÇELERİ.
 *
 * Yeni bir giriş eklemek bir karardır: "bölemedim" değil, "şu sebeple
 * bölünmemeli" yazılır. Dosya küçüldüğünde girdi de kaldırılır.
 */
export const ACKNOWLEDGED = {
  'devtools/vol-ui/src/sections/advancedTab.ts':
    'Showcase sekmesi: bağımsız kart kurucularının düz koleksiyonu. Bölmek ' +
    'dosya sayısını artırır, bağımlılığı azaltmaz — kurucular birbirini çağırmaz.',
  'devtools/vol-ui/src/sections/touchTab.ts': 'Showcase sekmesi; advancedTab ile aynı gerekçe.',
  'devtools/visual-synth/src/validate.ts':
    'Tek sözleşmenin bekçisi: her `check*` aynı `IssueList`i doldurur ve ' +
    'bölünürse "tüm sorunlar TEK seferde bildirilir" ilkesi dağılır.',
  'devtools/visual-synth/src/types.ts': 'Şema veri dosyası — tip bildirimi, mantık değil.',
  'devtools/visual-synth/src/render.ts': 'Boru hattının TEK giriş noktası (D3).',
  'devtools/vol-asset-studio/server/routes.ts':
    'HTTP yüzeyinin tamamı; rota tanımları birbirinden bağımsız ve düzdür.',
  'devtools/vol-asset-studio/src/audio/AudioEditorPanel.ts':
    'Tek panelin kurulumu ve olay bağlantıları; parçalanması durumu ikiye böler.',
  'games/vol-hell/src/runtime/scene/GameScene.ts':
    'Phaser sahnesi: gövdesinin çoğu alan ATAMASI olan kurulum. Fabrikaya ' +
    'çıkarmak ~20 alanı döndürüp yeniden atamak demek — aynı uzunluk, fazladan dolaylılık.',
  'games/vol-hell/src/runtime/simulation/VolHellSimulation.ts':
    'Headless koşu modelinin tamamı; dalga/ekonomi/doğum tek durum üzerinde çalışır.',
  'core/src/ui/data/Kanban.ts':
    'SAF taşıma kuralları `kanbanModel.ts`e alındı. Kalan gövde sürükleme, ' +
    'klavye ve DOM kurulumu; ayırmak geniş bir geri-çağrı yüzeyi gerektirir ve ' +
    'karmaşıklığı azaltmaz, taşır.',
  'core/src/ui/hud/SlotGrid.ts':
    'Sürükle-bırak envanter ızgarası: her item TEK DOM node ve o kimlik ' +
    'sözleşmesi bileşenin içinde korunur.',
  'core/src/ui/hud/SkillTree.ts':
    'Düğüm yerleşimi, bağlantı çizimi ve ölçüm aynı geometriyi paylaşır.',
};

/**
 * @param root Repo kökü.
 * @param acknowledged Gerekçe haritası; testler kendi haritasını verir.
 * @param threshold Satır eşiği.
 * @returns Sorun listesi; boşsa her aşım gerekçeli.
 */
export function validateSourceSize(root, acknowledged = ACKNOWLEDGED, threshold = LINE_THRESHOLD) {
  const files = execFileSync('git', ['ls-files', '*.ts'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !file.includes('node_modules'))
    .filter((file) => !/\.test\.|\.spec\.|(^|\/)tests?\//.test(file));

  const problems = [];
  const oversized = new Set();

  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(join(root, file), 'utf8').split('\n').length;
    } catch {
      continue;
    }
    if (lines <= threshold) continue;
    oversized.add(file);
    if (!(file in acknowledged)) {
      problems.push(
        `${file}: ${lines} satır (eşik ${threshold}) ve gerekçesi YOK. ` +
          'Böl, ya da neden bölünmemesi gerektiğini `ACKNOWLEDGED`e yaz.',
      );
    }
  }

  for (const file of Object.keys(acknowledged)) {
    if (!oversized.has(file)) {
      problems.push(
        `${file}: eşiğin ALTINA indi ama gerekçesi duruyor — ölü muafiyet kaldırılmalı.`,
      );
    }
  }

  return problems;
}
