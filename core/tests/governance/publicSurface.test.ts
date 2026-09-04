import { describe, it, expect } from 'vitest';
import * as Core from '../../src/index';

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
// 185 → 192: Android taşımasının açtığı yedi giriş. `VirtualActionSource`
// ekran üstü düğmelerin eylemlerini dokunmatik sağlayıcının kare durumuna
// katar; `observeAppVisibility`/`getAppVisibility` arka plana alınmayı tek
// sözleşmede toplar (ses, duraklatma ve teşhis aynı soruyu ayrı ayrı
// soruyordu); `isTouchPrimary`/`hasTouchInput`/`canHover`/
// `shouldUseTouchControls` ise "ekran üstü kontrol kurulmalı mı?" sorusunun
// ÖNCÜL cevabıdır — girdi katmanının reaktif `pointer.wasTouch` ayrımı ilk
// kareden önce karar vermeye yetmiyordu.
// 192 → 197: dokunsal geri bildirim yüzeyi (`vibrate`, `setHapticsEnabled`,
// `isHapticsEnabled`, `isHapticsSupported`, `cancelHaptics`). Phaser'ın
// titreşim yüzeyi yok; Vibration API tek yerde anlamlandırılmış desenlere
// bağlanır ki aynı etkileşim her ekranda aynı hissetsin.
// 196 → 198: `FullscreenController` ve generic `StatsPanel` CORE UI sözleşmesine
// alındı. Her iki bileşen de oyun/devtool bağımsızdır ve showcase'te gösterilir.
// 198 → 199: `segmentCircleEntryT`, süpürülmüş çarpışmada "en yakın vuruş"u
// dizi sırasından bağımsız kılan geometri primitifi.
// 199 → 202: grafik kalitesi sözleşmesi — üç ÇALIŞMA ZAMANI export'u.
// `GraphicsQuality` kademe kaydını jenerik tutar (CORE hangi knob'ların var
// olduğunu bilmez); `applyVolViewport` + `VIEWPORT_REGISTRY_KEY` ise render
// çözünürlüğünü dünya boyutundan ayıran viewport sözleşmesidir. Bu turda
// eklenen tipler (`ViewportScaleSetting`, `GraphicsQualityOptions`…) derleme
// zamanında silindiği için bu sayıya girmez.
// 202 → 204: `getHapticsCapability` + `observeHapticsCapability`. Titreşim
// artık YETENEĞE bağlı: `navigator.vibrate` yoksa bağlı bir oyun kolunun
// rumble motoru kullanılır ve kol takılıp çıkarıldıkça yetenek canlı bildirilir
// — tüketici ayarı buna göre etkinleştirir.
// 204 → 208: eklemli uzuv alanı — dört ÇALIŞMA ZAMANI export'u. `Spring1D`
// (`core/math/Spring.ts`) hız taşıyan genel yay-damper integratörüdür;
// `solveTwoBoneIk` (`core/math/ik.ts`) iki kemikli düzlemsel ters kinematik;
// `RigMotionModel` sürekli hareket sinyalleri; `LegGait` ayak-sabitleyen
// yürüyüş döngüsüdür. Uzuv sözlüğü bilinçli olarak tüketicide kalır
// (bkz. `core/src/index.ts`daki not).
// 208 → 212: bakış ve poz-türevi sunum efektleri — dört ÇALIŞMA ZAMANI export'u.
// `GazeDriver` (`core/rig/GazeDriver.ts`) sıçramalı bakışı bir yuvanın içinde
// tutan sürücüdür; `samplePose` bir görüntü ağacını dünya uzayına düzleştirir
// ve `GhostTrail`/`PoseShadow` o pozdan ikinci bir görüntü çizer (art-görüntü,
// gölge). Hepsi mekanizma katmanıdır: hangi parçanın gövde, hangisinin uzuv
// olduğunu bilmezler. Ortak sprite havuzu (`PoseSpriteSet`) bu ikisinin İÇ
// aracıdır ve bilinçli olarak yüzeye çıkmaz.
// 212 → 215: iki oyunun ortak Android geri-yönlendirme yığını
// (`pushBackHandler`, `backHandlerCount`) ve varyant/bütçe taşıyan tek-atış
// `SoundBank`. Oyunlar yalnız olay kimliklerini ve asset'lerini tanımlar.
// 215 → 220: rig VARLIK katmanı CORE'a alındı (+6) ve ölü `toStepVelocity`
// düştü (−1). Altı çalışma zamanı girişi — `validateRigMetadata`,
// `buildRigDefinition`, `articulateRigDefinition`, `computePartLayout`,
// `preloadRigTextures`, `assembleRig` — üretilmiş bir parça ağacını doğrulayıp
// sahnede kurar. Bunlar bir tasarım aracının API'si DEĞİL, üretilmiş verinin
// sözleşmesidir: bir oyunun çalışma zamanı asset'ini üreten araca bağlanmamalı
// (AGENTS.md, "Bozulamaz Kurallar" 4). `toStepVelocity` ise Matter.js'e hız
// çeviren, repoda hiç tüketicisi olmayan bir kalıntıydı; sildiği yer
// (`math/physics`) gerçek bir temas/destek katmanına açık kaldı.
// 220 → 221: `clampSimulationStep`. Kare süresini simülasyona vermeden önce
// kelepçeleyen tek sözleşme. Alt sistemler bunu ayrı ayrı yaptığında sistem
// hızlanmıyor, TUTARSIZLAŞIYORDU: 500 ms'lik bir karede gövde 100 ms yol
// alırken yürüyüş döngüsü 500 ms ilerliyor ve ayaklar gövdenin gitmediği yere
// basıyordu. Tavanın kendisi `TECH.MAX_SIM_STEP_MS`tir ve `Spring1D` de artık
// kendi özel sabiti yerine onu okur.
// 221 → 222: `measureSupport`. Basılı ayakların dışbükey zarfını kurar ve
// gövdenin ona göre denge payını ölçer. Yürüyüş döngüsünün sıra disiplini
// "gövde her an desteklidir" güvencesini DOLAYLI olarak veriyordu ama kimse
// ölçemiyordu; acil adım sırayı deldiğinde güvencenin hâlâ geçerli olup
// olmadığı görünmüyordu. Bir fizik motoru değil, tek bir soruyu cevaplayan bir
// ölçüm: merkez destek alanının içinde mi?
const EXPECTED_EXPORT_COUNT = 222;

// 196: asset compiler'lar (görsel/ses sentezi) CORE public surface'da
// tutulmaz; runtime yalnızca üretilmiş asset'leri çalar.

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

  it('deprecated takma adlar yüzeyde ama sayıya dahil', () => {
    // `PlayerController` → `MovableController` geçişinin takma adı. Kaldırma
    // turu geldiğinde bu testin de güncellenmesi gerektiğini hatırlatır.
    expect(Core.PlayerController).toBe(Core.MovableController);
  });
});
