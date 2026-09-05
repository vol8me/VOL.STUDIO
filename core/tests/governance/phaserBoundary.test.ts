import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * KATMAN MI, MOTOR MU? — sınırın kaydını tutar.
 *
 * CORE bir katmandır: Phaser'ı BOOT eder, sahnesini, renderer'ını, girdi
 * yüzeyini ve sahne grafiğini KULLANIR. Motor olsaydı bunları kendi yazardı.
 *
 * Ama bu sınır tek bir kararla değil, birikerek kayar. Her yeni primitif
 * masum görünür; Phaser'ın zaten verdiği bir şeyi yeniden yazdığında bunu
 * SÖYLEYEN kimse olmaz ve altı ay sonra "biz ne zaman motor yazmaya başladık?"
 * sorusu cevapsız kalır. Bu dosya o soruyu cevaplanabilir tutar.
 *
 * Her CORE modülü Phaser karşısındaki duruşunu BEYAN eder:
 *
 *   gap        Phaser bunu HİÇ vermez. Doldurmak katmanın işidir.
 *   delegates  Phaser verir, CORE onu import eder ve KULLANIR.
 *   structural Phaser nesnesiyle beslenir ama Phaser'a BAĞLANMAZ — ihtiyacı
 *              olan yüzeyi kendi yapısal arayüzüyle bildirir, böylece render
 *              motoru örneği olmadan test edilebilir.
 *   replaces   Phaser verir, CORE KENDİ uygulamasını taşır. Motor sınırı burada.
 *
 * `replaces` sayısı SABİTLENMİŞTİR. Yeni bir tane eklemek, `quality.json`
 * eşiğini düşürmek gibi bilinçli bir düzenleme gerektirir — ve o düzenlemeyi
 * yapan kişi Phaser'ın neyi vermediğini yazmak zorundadır.
 */
const ROOT = resolve(import.meta.dirname, '../..');

type Posture = 'gap' | 'delegates' | 'structural' | 'replaces';

interface ModuleStance {
  posture: Posture;
  /** `gap` dışındaki her duruş için ZORUNLU: Phaser tarafında karşılığı ne? */
  why?: string;
}

const STANCES: Readonly<Record<string, ModuleStance>> = {
  // --- Phaser'ın HİÇ vermediği alanlar ------------------------------------
  ui: { posture: 'gap' },
  grid: { posture: 'gap' },
  spatial: { posture: 'gap' },
  collections: { posture: 'gap' },
  rig: { posture: 'gap' },
  platform: { posture: 'gap' },
  lifecycle: { posture: 'gap' },
  debug: { posture: 'gap' },
  benchmark: { posture: 'gap' },
  quality: { posture: 'gap' },
  state: { posture: 'gap' },
  stats: { posture: 'gap' },
  economy: { posture: 'gap' },
  fonts: { posture: 'gap' },
  i18n: { posture: 'gap' },
  '@types': { posture: 'gap' },

  // --- Phaser'ı KULLANAN alanlar -----------------------------------------
  entities: {
    posture: 'delegates',
    why: 'Phaser.GameObjects üzerine ince sözleşme; konum/ömür Phaser`ın.',
  },
  input: {
    posture: 'delegates',
    why: 'Phaser.Input.Keyboard/Pointer okunur; CORE yalnız sağlayıcı hakemliği ekler.',
  },
  fx: {
    posture: 'structural',
    why:
      'Phaser.GameObjects.Image/Scene ile beslenir ama onları import ETMEZ: ' +
      'ihtiyaç duyduğu yüzey yapısal arayüz olarak bildirilir, böylece efekt ' +
      'katmanı gerçek bir render motoru örneği olmadan test edilebilir.',
  },
  systems: {
    posture: 'delegates',
    why: 'ViewportManager Phaser.Scale ve Phaser.Game üzerinden çalışır.',
  },

  // --- Phaser'ın yerine geçen alanlar — MOTOR SINIRI ----------------------
  audio: {
    posture: 'replaces',
    why:
      'Phaser.Sound yerine ham Web Audio. SoundManager adaptive stem mix, sidechain ' +
      'ducking ve tek AudioContext yaşam döngüsü (ilk dokunuşta kilit açma, arka ' +
      'planda suspend) vermez; ikisi açık olsaydı iki context doğardı.',
  },
  time: {
    posture: 'replaces',
    why:
      'Phaser.Time.Clock/TimerEvent yerine kendi saati. Sahne döngüsüne bağlı ' +
      'olmayan, Phaser kurmadan test edilebilir sabit adım ve catch-up sınırı gerekiyordu.',
  },
  math: {
    posture: 'replaces',
    why:
      'Phaser.Math yerine kendi primitifleri. Headless testte Phaser kurmadan ' +
      'çalışması ve sonlu sayı sözleşmesini uygulaması gerekiyordu.',
  },
  events: {
    posture: 'replaces',
    why:
      'Phaser.Events.EventEmitter yerine tipli EventBus. Olay adları ve yükleri ' +
      'derleme zamanında bağlanır; yayın hatası tek aboneyi izole eder.',
  },
  pool: {
    posture: 'replaces',
    why:
      'Phaser.GameObjects.Group havuzlaması yerine jenerik ObjectPool. Phaser ' +
      'nesnesi OLMAYAN değerler (simülasyon durumu, vektör) için de gerekiyordu.',
  },
  random: {
    posture: 'replaces',
    why:
      'Phaser.Math.RND yerine tohumlanabilir üreteç. Determinizm testleri ve ' +
      'altın imza karşılaştırması Phaser`dan bağımsız tekrarlanabilirlik ister.',
  },
};

/**
 * `replaces` SAYISI.
 *
 * Bu sayı büyüdükçe CORE katman olmaktan çıkıp motora yaklaşır. Büyütmek
 * yasak değildir — `audio` savunulabilir bir gerekçeyle büyüttü — ama SESSİZ
 * olamaz.
 */
const EXPECTED_REPLACES = 6;

function coreModules(): string[] {
  return [
    ...new Set(
      execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((path) => path.endsWith('.ts'))
        .map((path) => path.split('/')[1])
        .filter(
          (segment): segment is string => segment !== undefined && segment.includes('.') === false,
        ),
    ),
  ].sort();
}

function importsPhaser(module: string): boolean {
  const files = execFileSync('git', ['ls-files', `src/${module}`], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path.endsWith('.ts'));
  return files.some((file) =>
    /^\s*import .*from 'phaser'/m.test(readFileSync(resolve(ROOT, file), 'utf8')),
  );
}

describe('Phaser sınırı', () => {
  it('her CORE modülü duruşunu BEYAN eder', () => {
    const undeclared = coreModules().filter((module) => !(module in STANCES));
    expect(
      undeclared,
      'Yeni CORE modülü: Phaser bunu vermiyor mu (gap), veriyor ve kullanıyor musun ' +
        '(delegates), yoksa yerine mi geçiyorsun (replaces)? Beyan et.',
    ).toEqual([]);
  });

  it('beyan edilen her modül GERÇEKTEN var — ölü kayıt birikmez', () => {
    const actual = new Set(coreModules());
    const stale = Object.keys(STANCES).filter((module) => !actual.has(module));
    expect(stale, 'silinen modülün beyanı da silinmeli').toEqual([]);
  });

  it('`structural` diyen modül Phaser`a BAĞLANMAMIŞ kalır', () => {
    /*
     * Ters yönlü koruma. `structural` duruşunun tek değeri Phaser'sız test
     * edilebilirliktir; modüle tek bir `from 'phaser'` importu girdiği an o
     * özellik kaybolur ve duruş sessizce `delegates`e döner.
     */
    const coupled = Object.entries(STANCES)
      .filter(([, stance]) => stance.posture === 'structural')
      .map(([module]) => module)
      .filter((module) => importsPhaser(module));

    expect(
      coupled,
      '`structural` beyanı var ama Phaser importu girmiş: yapısal bağımsızlık kayboldu',
    ).toEqual([]);
  });

  it('`delegates` diyen modül Phaser`ı GERÇEKTEN import eder', () => {
    /*
     * Sessiz kaymanın asıl yolu bu: bir modül "Phaser`ı kullanıyorum" diye
     * kayıtlıyken son Phaser importunu kaybeder ve fark edilmeden kendi
     * uygulamasına dönüşür. Beyan koda uymuyorsa beyan yalandır.
     */
    const lying = Object.entries(STANCES)
      .filter(([, stance]) => stance.posture === 'delegates')
      .map(([module]) => module)
      .filter((module) => !importsPhaser(module));

    expect(
      lying,
      '`delegates` beyanı var ama Phaser importu yok: modül sessizce `replaces` oldu',
    ).toEqual([]);
  });

  it('`replaces` ve `delegates` gerekçesiz olamaz', () => {
    const missing = Object.entries(STANCES)
      .filter(([, stance]) => stance.posture !== 'gap')
      .filter(([, stance]) => (stance.why ?? '').length < 40)
      .map(([module]) => module);

    expect(missing, 'Phaser tarafındaki karşılığı ve neden yetmediği YAZILMALI').toEqual([]);
  });

  it('Phaser`ın yerine geçen modül sayısı SABİT', () => {
    const replaces = Object.entries(STANCES)
      .filter(([, stance]) => stance.posture === 'replaces')
      .map(([module]) => module)
      .sort();

    expect(
      replaces.length,
      `CORE ${replaces.length} Phaser alt sistemini yeniden yazıyor (${replaces.join(', ')}). ` +
        'Bu sayı büyüdüyse: gerçekten Phaser`ın veremediği bir şey mi var, yoksa motor mu ' +
        'yazıyoruz? Cevabı `why` alanına yaz ve sayıyı güncelle.',
    ).toBe(EXPECTED_REPLACES);
  });
});
