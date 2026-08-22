import { describe, it, expect } from 'vitest';
import * as Core from '../../src/index';
import * as Visual from '../../src/visual/index';

/**
 * CORE'un public API yüzeyinin BÜYÜKLÜĞÜNÜ kilitler.
 *
 * `index.ts` dokuz adet `export *` barrel'ı taşıyor (`ui/primitives`,
 * `ui/layout`, `ui/overlays`, `ui/data`, `ui/feedback`, `ui/controls`,
 * `ui/hud`, `ui/cards`, `debug`). Bu bilinçli bir kolaylık — bileşen
 * eklerken barrel'ı elle güncellemek unutuluyordu — ama bir bedeli var:
 * yeni bir dosyaya `export` yazmak, o ismi HİÇBİR KARAR NOKTASI OLMADAN
 * public API'ye sokuyor. Yüzey büyürken kimse "bu dışarıya açılmalı mı?"
 * sorusunu sormuyor.
 *
 * Barrel'ları elle yazılmış listelere çevirmek bu sorunu çözerdi ama 120+
 * satırlık kalıcı bir bakım yükü getirirdi. Bunun yerine yüzey SAYILIYOR:
 * değiştiğinde kapı kırılır ve biri kararı bilinçli olarak verir.
 *
 * **Bu test düştüğünde:** yüzey gerçekten büyümeli/küçülmeliyse aşağıdaki
 * sayıyı güncelle. Beklenmedik bir isim sızdıysa (dahili bir yardımcı,
 * geçici bir tip) `export`u kaldır. İkisi de meşru; sessizce olmaması
 * yeterli.
 */
const EXPECTED_EXPORT_COUNT = 172;

/**
 * `visual/` kök barrel'a TEK bir isimle (`Visual`) girer, tıpkı `Synth` gibi.
 * Bu, alt sistemin kendi yüzeyini kök sayısının gölgesinde büyütmesi demek
 * olurdu; bu yüzden ayrıca ve kendi başına sayılır.
 */
const EXPECTED_VISUAL_EXPORT_COUNT = 52;

describe('CORE public API yüzeyi', () => {
  it('export sayısı bilinçli bir kararla değişir', () => {
    const names = Object.keys(Core);

    expect(
      names.length,
      `CORE public API yüzeyi ${EXPECTED_EXPORT_COUNT} → ${names.length} oldu. ` +
        'Bu bir karar mı, sızıntı mı? Karar ise bu testteki sayıyı güncelle.',
    ).toBe(EXPECTED_EXPORT_COUNT);
  });

  it('yüzeyde dahili/geçici görünen isim yoktur', () => {
    // Alt çizgiyle başlayan ya da `Internal`/`Temp` gibi bir SEGMENT taşıyan
    // ismin public API'ye çıkması, barrel otomatikliğinin tipik sızıntı biçimi.
    //
    // Eşleşme camelCase SEGMENTİ üzerinden yapılır, ham substring üzerinden
    // değil: düz `/wip/i` taraması `SwipeableCardStack` ve `SwipeGestureZone`
    // isimlerini yakalıyordu ("S-wip-eable"). Bekçinin kendi yanlış pozitifi,
    // koruduğu şeyden daha hızlı devre dışı bırakılır.
    const FORBIDDEN_SEGMENTS = ['internal', 'temp', 'todo', 'wip', 'draft', 'unsafe'];
    const suspicious = Object.keys(Core).filter((name) => {
      if (name.startsWith('_')) return true;
      const segments = name.split(/(?=[A-Z])|[_-]/).map((part) => part.toLowerCase());
      return segments.some((segment) => FORBIDDEN_SEGMENTS.includes(segment));
    });

    expect(suspicious).toEqual([]);
  });

  it('visual alt sistemi kok barrel icine TEK isimle girer', () => {
    expect(Core.Visual).toBeDefined();
    expect(Object.keys(Visual).length).toBe(EXPECTED_VISUAL_EXPORT_COUNT);
  });

  it('deprecated takma adlar yüzeyde ama sayıya dahil', () => {
    // `PlayerController` → `MovableController` geçişinin takma adı. Kaldırma
    // turu geldiğinde bu testin de güncellenmesi gerektiğini hatırlatır.
    expect(Core.PlayerController).toBe(Core.MovableController);
  });
});
