import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dokunmatik hedef politikası.
 *
 * `cursor: pointer` taşıyan her kural ya `--vol-hit-target-min` tüketir
 * ya da gerekçeli muafiyet taşır. Yeni bileşen eklenince kapı,
 * karar verilene kadar kırılır.
 *
 * jsdom layout/paint hesaplamadığı için doğrulama yapısal (metin tabanlı) yapılır.
 */
const CSS_DIR = resolve(import.meta.dirname, '../../src/ui');

/**
 * `cursor: pointer` taşımadığı hâlde politikaya dahil edilen seçiciler.
 *
 * Bunlar kare düğme değil; hedef büyütmesi TEK EKSENDE ya da bir taşma
 * şeridiyle uygulanır. Bu yüzden `consumesToken`ın "hem min-height hem
 * min-width" kuralı yerine yalnızca token'a DAYANDIKLARI aranır.
 *
 * Önceden liste `.vol-slider__track` / `.vol-range-slider__track` diyordu ve
 * token doğrudan GÖRSEL çubuğa uygulanıyordu; dokunmatik cihazda 16 px'lik
 * çubuk 44 px'e şişip kaydırıcıyı bozuyordu (gerçek cihazda görüldü). Hedef,
 * çubuğun görünümünü değiştirmeyen görünmez yüzeylere taşındı.
 */
const ALSO_REQUIRED: ReadonlyArray<{ selector: string; reason: string }> = [
  {
    selector: '.vol-slider--horizontal .vol-slider__input',
    reason: 'Yatay kaydırıcının tıklanan yüzeyi görünmez input; hedef dikeyde büyür.',
  },
  {
    selector: '.vol-slider--vertical .vol-slider__input',
    reason: 'Dikey kaydırıcıda aynı yüzey, hedef yatayda büyür.',
  },
  {
    selector: '.vol-range-slider__track::before',
    reason: 'Aralık kaydırıcısında hedef, çubuğun üstünde simetrik taşan görünmez şerittir.',
  },
];

/**
 * Gerekçeli muafiyetler. Gerekçe ZORUNLUDUR: gerekçesiz bir muafiyet,
 * politikayı sessizce delmenin kolay yolu olur.
 */
const EXEMPT: ReadonlyArray<{ selector: string; reason: string }> = [
  // --- Birincil kontrolün yanındaki KISAYOLLAR ---
  {
    selector: '.vol-color-picker__preset',
    reason:
      'Hazır renk kısayolu; aynı seçimi birincil kontrol (tam boy kutucuk + hex alanı) ' +
      'zaten karşılıyor. Altı kutucuklu bir şeridi dokunmatik hedefe büyütmek paleti okunmaz yapardı.',
  },

  // --- Zaten hedefin üstünde: dokunmatik-öncelikli kontroller ---
  {
    selector: '.vol-joystick__base',
    reason: 'Boyut `--vol-joystick-radius`×2; dokunmatik için tasarlandı, hedefin altına inemez.',
  },
  {
    selector: '.vol-square-joystick__base',
    reason:
      'Boyut `--vol-square-joystick-size`×2; dokunmatik için tasarlandı, hedefin altına inemez.',
  },
  {
    selector: '.vol-touch-button',
    reason:
      'Varsayılan 72px; boyutu `--vol-touch-button-size` ile tüketici verir, hedefin üstünde.',
  },
  {
    selector: '.vol-long-press-button',
    reason: 'Varsayılan 72px (`--vol-long-press-button-size`); hedefin belirgin biçimde üstünde.',
  },
  {
    selector: '.vol-charge-button',
    reason: 'Varsayılan 72px (`--vol-charge-button-size`); hedefin belirgin biçimde üstünde.',
  },
  {
    selector: '.vol-pause-resume-button',
    reason: 'Varsayılan 64px (`--vol-pause-resume-button-size`); hedefin üstünde.',
  },
  {
    selector: '.vol-direction-button',
    reason: 'Varsayılan 56px (`--vol-direction-button-size`); hedefin üstünde.',
  },
  {
    selector: '.vol-action-bar__slot',
    reason: 'Varsayılan 68px (`--vol-action-bar-size`); aksiyon çubuğu dokunmatik-öncelikli.',
  },
  {
    selector: '.vol-radial-menu__item',
    reason: 'Sabit 64×64; radyal menü zaten parmakla kullanım için tasarlandı.',
  },
  {
    selector: '.vol-card-stack__action',
    reason: 'Sabit 52×52; kaydırmalı kart yığınının aksiyonları hedefin üstünde.',
  },
  {
    selector: '.vol-skill-tree__node',
    reason: 'height 44px + min-width 88px — hedefi kendi sabit ölçüleriyle zaten karşılıyor.',
  },

  // --- Hedef başka bir kutuda ---
  {
    selector: '.vol-tree__item[aria-expanded] .vol-tree__caret',
    reason: 'Ok yalnızca göstergedir; tıklanan kutu `.vol-tree__row` ve o politikaya dahil.',
  },
  {
    selector: '.vol-slider__input',
    reason:
      'Görünmez `<input type=range>`; hit alanını kapladığı `.vol-slider__track` belirler (ALSO_REQUIRED).',
  },
  {
    selector: '.vol-kanban__card:hover',
    reason: 'Bu bir :hover DURUM kuralı, taban kural değil; kartın kendisi zaten büyük bir kutu.',
  },

  // --- Doğası gereği büyük yüzeyler ---
  {
    selector: '.vol-minimap__canvas',
    reason: 'Harita tuvali; boyutu panel tarafından verilir, minimum dayatmak paneli taşırır.',
  },
  {
    selector: '.vol-dialogue',
    reason: 'Tıkla-ilerle yüzeyi kutunun TAMAMI (min(720px, 90vw)); zaten hedefin çok üstünde.',
  },
  {
    selector: '.vol-datatable__row--selectable',
    reason:
      'Tablo satırı. CSS tablo yerleşiminde satır kutusuna min-height güvenilir biçimde uygulanmaz; ' +
      'yükseklik hücre padding’inden gelir. Satır yüksekliğini artırmak hücre stiliyle yapılmalı.',
  },
];

function readCss(): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(CSS_DIR)) {
    if (!entry.endsWith('.css')) continue;
    files.set(entry, readFileSync(resolve(CSS_DIR, entry), 'utf-8'));
  }
  return files;
}

/** Üst seviye `seçici { … }` bloklarını çıkarır (iç içe blok bu CSS'te yok). */
function blocks(css: string): Array<{ selector: string; body: string }> {
  const result: Array<{ selector: string; body: string }> = [];
  const pattern = /^([.:[][^{\n]*?)\s*\{([^}]*)\}/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    result.push({ selector: match[1].trim(), body: match[2] });
  }
  return result;
}

/**
 * Kural: hem `min-height` hem `min-width` token'ı tüketmeli.
 *
 * Fallback genelde `auto`dur (masaüstünde etki yok). Bileşenin masaüstünde
 * ZATEN bir taban ölçüsü varsa (`.vol-tree__row` 36px) fallback o ölçü olur —
 * `auto`ya çevirmek dokunmatiği düzeltirken masaüstünü bozardı. Bu yüzden
 * fallback `auto` ya da bir px değeri olabilir.
 */
function consumesToken(body: string): boolean {
  const fallback = String.raw`(?:auto|\d+px)`;
  return (
    new RegExp(String.raw`min-height:\s*var\(--vol-hit-target-min,\s*${fallback}\)`).test(body) &&
    new RegExp(String.raw`min-width:\s*var\(--vol-hit-target-min,\s*${fallback}\)`).test(body)
  );
}

const files = readCss();
const exemptSelectors = new Set(EXEMPT.map((entry) => entry.selector));

describe('Dokunmatik hedef politikası', () => {
  it('--vol-hit-target-min yalnızca pointer:coarse altında bir değer taşır', () => {
    // Bilinçli tasarım: varsayılan (mouse) :root'ta HİÇ tanımlanmaz, bu yüzden
    // min-height/min-width'te `auto`ya düşer — masaüstü görünümü etkilenmez.
    const theme = files.get('theme.css')!;
    expect(theme).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*:root\s*\{[^}]*--vol-hit-target-min:\s*\d+px/,
    );

    const beforeMediaQuery = theme.split('@media (pointer: coarse)')[0];
    expect(beforeMediaQuery).not.toMatch(/--vol-hit-target-min:/);
  });

  it('cursor:pointer taşıyan HER kural ya token tüketir ya gerekçeli muaftır', () => {
    const violations: string[] = [];

    for (const [name, css] of files) {
      for (const { selector, body } of blocks(css)) {
        if (!/cursor:\s*pointer/.test(body)) continue;
        if (exemptSelectors.has(selector)) continue;
        if (consumesToken(body)) continue;
        violations.push(
          `${name} → ${selector}: min-height VE min-width ile --vol-hit-target-min tüketmiyor. ` +
            `Ya politikaya dahil et ya da EXEMPT'e GEREKÇESİYLE ekle.`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('token gerektiren ek yüzeyler (cursor:pointer taşımayanlar) de politikaya dahil', () => {
    const violations: string[] = [];

    for (const { selector } of ALSO_REQUIRED) {
      const found = [...files.values()]
        .flatMap(blocks)
        .find((block) => block.selector === selector);
      if (!found) {
        violations.push(`${selector} hiçbir CSS dosyasında bulunamadı`);
        continue;
      }
      // Tek eksenli/şerit tabanlı hedefler için "her iki min-*" şartı geçerli
      // değil; aranan şey ölçünün TOKEN'DAN türemesi.
      if (!found.body.includes('--vol-hit-target-min')) {
        violations.push(`${selector} --vol-hit-target-min'e dayanmıyor`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('kaydırıcı çubukları GÖRSEL kalır — hedef büyütmesi çubuğa uygulanmaz', () => {
    // Regresyon: token doğrudan çubuğa uygulanınca 16 px'lik bar dokunmatikte
    // 44 px'e çıkıyor ve kaydırıcı, içinde ince bir tutamağın yüzdüğü kocaman
    // bir bloğa dönüşüyordu.
    for (const selector of ['.vol-slider__track', '.vol-range-slider__track']) {
      const found = [...files.values()]
        .flatMap(blocks)
        .find((block) => block.selector === selector);
      expect(found, `${selector} tanımlı olmalı`).toBeDefined();
      expect(found!.body, `${selector} görsel çubuktur, hedef değil`).not.toContain(
        '--vol-hit-target-min',
      );
    }
  });

  it('her muafiyet bir gerekçe taşır ve gerçekten var olan bir seçiciyi işaret eder', () => {
    const allSelectors = new Set([...files.values()].flatMap(blocks).map((b) => b.selector));

    for (const { selector, reason } of EXEMPT) {
      expect(reason.length, `${selector} gerekçesiz`).toBeGreaterThan(20);
      // Ölü muafiyet bırakılmaz: bileşen silinince muafiyet de silinmeli.
      expect(allSelectors.has(selector), `${selector} artık CSS'te yok — muafiyeti sil`).toBe(true);
    }
  });

  it('.vol-button ve .vol-checkbox görünmez ::before overlay kullanmaz', () => {
    // Görünmez overlay yerine gerçek kutu boyutu (min-height/min-width) kullanılır;
    // komşu öğelerle örtüşme riski azalır.
    const primitives = files.get('primitives.css')!;
    expect(primitives).not.toMatch(/\.vol-button::before/);
    expect(primitives).not.toMatch(/\.vol-checkbox::before/);
  });
});
