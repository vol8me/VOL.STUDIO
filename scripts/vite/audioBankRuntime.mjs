/**
 * Gönderilen ses bank'larının ÇALIŞMA ZAMANI GÖRÜNÜMÜ.
 *
 * Oyun paketlerinin `audio-banks` klasöründeki JSON dosyaları kanonik `SoundFamilyBankV1` kaydıdır: üreticinin
 * ve `verifyFamily`nin okuduğu hash'ler, manifest yolları, program/PCM özetleri,
 * ses ölçümleri ve kalite kaydı da orada durur. Oyun bunların hiçbirini okumaz
 * (bkz. `SoundFamilyBank.parse`); onlar pakete girerse yalnız indirilen bayt
 * olurlar. Bu eklenti içe aktarma anında kaydı, çalışma zamanının okuduğu
 * alanlara indirger. Kanonik dosya, üretici ve doğrulayıcı hattı değişmez.
 *
 * SÖZLEŞME: aşağıdaki alan listesi `SoundFamilyBank.parse`nin okuduğu alanlarla
 * birebir aynı olmak ZORUNDADIR. Sapma sessizce kalmasın diye
 * `games/vol-test/tests/audio/bankRuntimeView.test.ts` her kanonik bank için
 * `parse(kanonik)` ile `parse(görünüm)` eşitliğini ve seçim eşitliğini sınar.
 */

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

function variantView(variant) {
  if (!isRecord(variant)) return variant;
  const view = pick(variant, ['key', 'roles', 'tags', 'durationSeconds']);
  if (isRecord(variant.asset)) view.asset = pick(variant.asset, ['path']);
  else if ('asset' in variant) view.asset = variant.asset;
  return view;
}

/**
 * Kanonik bank belgesinden çalışma zamanı görünümü. Beklenmeyen biçim (nesne
 * değil, varyant dizisi değil) olduğu gibi geçer: `SoundFamilyBank.parse` kendi
 * hatasıyla açılışta düşer, burada sessizce başka bir şeye çevrilmez.
 */
export function runtimeBankView(document) {
  if (!isRecord(document)) return document;
  const view = pick(document, ['schema', 'lookupContract']);
  view.choice = isRecord(document.choice) ? pick(document.choice, ['method']) : document.choice;
  view.family = isRecord(document.family) ? pick(document.family, ['familyId']) : document.family;
  view.variants = Array.isArray(document.variants)
    ? document.variants.map(variantView)
    : document.variants;
  return view;
}

const BANK_FILE = /\/audio-banks\/[^/]+\.json$/;

/** Vite eklentisi: `audio-banks/*.json` içe aktarmalarını çalışma zamanı görünümüne indirger. */
export function audioBankRuntime() {
  return {
    name: 'vol-audio-bank-runtime',
    // `vite:json` dönüşümünden ÖNCE: görünüm JSON metni olarak döner ve Vite onu
    // kendi JSON modülüne çevirir.
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replaceAll('\\', '/');
      if (!BANK_FILE.test(file)) return null;
      return { code: JSON.stringify(runtimeBankView(JSON.parse(code))), map: null };
    },
  };
}
