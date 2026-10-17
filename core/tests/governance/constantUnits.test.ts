import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BOYUTLU sabitler birimini ADINDA taşır.
 *
 * Repo alan adlarında birime titiz — 138 `…Ms`, 42 `…Seconds`, 49 `…Px` alan
 * adı var. Sabitlerde ise değildi: `UI_TIMING.TIMER_RESET: 300` ms mi saniye
 * mi, addan anlaşılmıyordu; birim yalnız yorumdaydı.
 *
 * Yorum bir sözleşme değildir. `durationMs:` bekleyen bir çağrıya `TIMER_RESET`
 * geçirmek doğruydu, ama bir sonraki kişi `NEW_DELAY: 2` yazıp saniye
 * kastettiğinde hiçbir şey ses çıkarmaz ve hata 1000 KAT olur. Zaman
 * birimlerinde bu sınıf hatanın maliyeti, yakalanma olasılığıyla ters orantılı:
 * 2 ms ile 2 sn arasındaki fark, testte fark edilmeyecek kadar küçük bir
 * gecikme ya da fark edilmeyecek kadar büyük bir donma üretir.
 *
 * BOYUTSUZ gruplar muaftır ve listesi gerekçesiyle aşağıdadır: bir orana ya da
 * katmana birim eki takmak yanlış bilgi verir.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SOURCE = readFileSync(resolve(import.meta.dirname, '../../src/constants.ts'), 'utf8');

/** Birim eki BEKLENMEYEN gruplar — hepsi boyutsuz. */
const DIMENSIONLESS: Record<string, string> = {
  UI_ALPHA: 'opaklık, 0..1 arası saf oran',
  UI_RATIO: 'adı zaten oran olduğunu söylüyor',
  UI_DEPTH: 'katman sırası — ölçü değil, sıralama',
  UI_CAPACITY: 'adet',
  PINCH_ZOOM: 'yakınlaştırma çarpanı — boyutsuz',
};

/** Adı birimini zaten taşıyan ya da boyutsuz olan tekil sabitler. */
const EXEMPT_KEYS: Record<string, string> = {
  DEAD_ZONE_RATIO: 'oran',
  DPR_FALLBACK: 'cihaz piksel oranı — boyutsuz',
  MS_PER_SECOND: 'çevrim çarpanı; adı zaten iki birimi de söylüyor',
  PULL_RESISTANCE_FACTOR: 'eğri katsayısı — boyutsuz',
};

const UNIT_SUFFIX = /_(MS|SECONDS|PX|PX_PER_MS|DEG|RAD|RATIO|PCT)$/;

interface ConstantGroup {
  readonly name: string;
  readonly keys: readonly string[];
}

function numericGroups(): ConstantGroup[] {
  const groups: ConstantGroup[] = [];
  for (const match of SOURCE.matchAll(/export const (\w+) = \{([\s\S]*?)\n\} as const;/g)) {
    const keys = [...match[2].matchAll(/^\s+([A-Z_0-9]+):\s*[\d.]+/gm)].map((entry) => entry[1]);
    if (keys.length > 0) groups.push({ name: match[1], keys });
  }
  return groups;
}

/** Sabit tüketimini ölçmek için taranan kaynak ağacı (constants.ts hariç). */
function collectSources(root: string, found: string[] = []): string[] {
  for (const group of ['core', 'games', 'devtools', 'tauri-v2']) {
    walk(resolve(root, group), found);
  }
  return found;
}

function walk(directory: string, found: string[]): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else if (entry.name.endsWith('.ts') && !path.endsWith('src/constants.ts')) {
      found.push(readFileSync(path, 'utf8'));
    }
  }
}

describe('sabit birim eki', () => {
  it('taranan grup listesi boş değil', () => {
    // Ayrıştırma bozulursa bu bekçi sessizce her şeyi onaylar.
    expect(numericGroups().length).toBeGreaterThan(5);
  });

  it('BOYUTLU her sabit birimini adında taşır', () => {
    const missing: string[] = [];
    for (const group of numericGroups()) {
      if (group.name in DIMENSIONLESS) continue;
      for (const key of group.keys) {
        if (key in EXEMPT_KEYS) continue;
        if (!UNIT_SUFFIX.test(key)) missing.push(`${group.name}.${key}`);
      }
    }

    expect(
      missing,
      'Bu sabitler bir ölçü taşıyor ama birimi adlarında yok. Ekle ' +
        '(_MS, _PX, _SECONDS…) ya da boyutsuzsa gerekçesini EXEMPT_KEYS’e yaz.',
    ).toEqual([]);
  });

  it('her sabitin EN AZ BİR tüketicisi var', () => {
    /*
     * Bu kapı gerçek bir çift-kaynak hatasıyla yazıldı: `UI_TIMING`de
     * `EVENT_LOG_LEAVE_MS: 220` duruyordu ama hiç kullanılmıyordu — `EventLog`
     * kendi `EVENT_LOG_LEAVE_DURATION_MS = 220` sabitini tanımlayıp onu
     * kullanıyordu. Aynı sürenin iki kaynağı vardı ve paylaşılan olan ölüydü:
     * `constants.ts`teki değeri değiştirmek hiçbir şey yapmıyor, ama okuyana
     * "burası tek kaynak" diyordu. Sessiz bir yalan.
     */
    /*
     * Korpus TEK SEFERDE okunur. İlk hâli sabit başına bir `grep` süreci
     * açıyordu; 45 süreç testi 7.8 saniyeye çıkarıp varsayılan sınırı aşıyordu.
     * Bir bekçinin kendisi yavaşlık yüzünden kırmızıya dönerse, güvenilirliğini
     * ölçtüğü şeyden önce kendi kaybeder.
     */
    const sources = collectSources(REPO_ROOT).join('\n');

    const dead: string[] = [];
    for (const group of numericGroups()) {
      for (const key of group.keys) {
        const uses = sources.split(`${group.name}.${key}`).length - 1;
        if (uses === 0) dead.push(`${group.name}.${key}`);
      }
    }

    expect(
      dead,
      'Bu sabitlerin tüketicisi yok. Ya kullanılmıyorlar (sil) ya da bir tüketici ' +
        'kendi kopyasını tanımlamış (tek kaynağa bağla).',
    ).toEqual([]);
  });

  it('muafiyet listeleri GEREKÇE taşır ve ölü giriş barındırmaz', () => {
    for (const [name, reason] of Object.entries({ ...DIMENSIONLESS, ...EXEMPT_KEYS })) {
      expect(reason.length, `${name}: gerekçe boş`).toBeGreaterThan(3);
    }

    // Ölü muafiyet, kaldırılmış bir kuralı hâlâ varmış gibi gösterir.
    const groupNames = new Set(numericGroups().map((group) => group.name));
    const allKeys = new Set(numericGroups().flatMap((group) => group.keys));
    expect(Object.keys(DIMENSIONLESS).filter((name) => !groupNames.has(name))).toEqual([]);
    expect(Object.keys(EXEMPT_KEYS).filter((key) => !allKeys.has(key))).toEqual([]);
  });
});
