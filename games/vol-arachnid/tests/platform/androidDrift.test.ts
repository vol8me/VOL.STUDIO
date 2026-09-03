import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ÜRETİLMİŞ ANDROID AĞACININ ELLE DÜZENLENMİŞ YERLERİ.
 *
 * `src-tauri/gen/android` Tauri CLI tarafından üretilir ama repoda tutulur ve
 * içinde ELLE yazılmış kararlar vardır: yön kilidi, titreşim izni, geri tuşunun
 * oyuna devri, sürükleyici tam ekran. `tauri android init` bu ağacı yeniden
 * ürettiğinde hepsi sessizce silinir — üretilen bir dosya, üzerine yazıldığını
 * söylemez.
 *
 * Bu kapı bir DEĞİŞMEZLİK testi değildir: dosyaların birebir aynı kalmasını
 * beklemez, o her meşru düzenlemede kırılırdı. Beklediği şey elle alınan
 * KARARLARIN hâlâ orada olmasıdır. Bir karar bilinçli olarak geri alınıyorsa
 * buradaki satır da aynı turda silinir; unutulduğunda ise kapı düşer ve
 * "regenerate ettim, geri koymayı unuttum" hatası cihaza gitmeden görülür.
 *
 * Yeni bir elle düzenleme yapıldığında BURAYA da bir satır eklenir. Aksi hâlde
 * bir sonraki regenerate onu da götürür ve kimse fark etmez.
 */
const ANDROID_ROOT = resolve(import.meta.dirname, '../../src-tauri/gen/android');

function read(relativePath: string): string {
  return readFileSync(resolve(ANDROID_ROOT, relativePath), 'utf8');
}

interface HandEdit {
  /** Kararın adı — kapı düştüğünde okunacak metin. */
  readonly decision: string;
  /** Kararın dosyadaki kanıtı. */
  readonly marker: string | RegExp;
}

const MANIFEST_EDITS: readonly HandEdit[] = [
  {
    decision: 'Yön YATAYA kilitli — dikey kipte uzuvların yarısı ekran dışında kalır',
    marker: 'android:screenOrientation="sensorLandscape"',
  },
  {
    decision: 'VIBRATE izni — izinsiz `navigator.vibrate()` hata vermeden yutulur',
    marker: 'android.permission.VIBRATE',
  },
  {
    decision: 'Dönüşte Activity yeniden yaratılmaz, yalnız WebView ölçülür',
    marker: /android:configChanges="[^"]*orientation[^"]*screenSize[^"]*"/,
  },
];

const ACTIVITY_EDITS: readonly HandEdit[] = [
  {
    decision: 'Geri tuşu oyuna devredilir — tek sayfalık uygulamada Wry her basışta kapatırdı',
    marker: 'OnBackPressedCallback',
  },
  {
    decision: 'Geri olayı JS tarafına `vol:androidback` olarak taşınır',
    marker: "CustomEvent('vol:androidback')",
  },
  {
    decision:
      'Callback `onCreate` içinde kurulur — WebView callback’inde bazı cihazlarda kaçıyordu',
    marker: /override fun onCreate[\s\S]*onBackPressedDispatcher\.addCallback/,
  },
  {
    decision: 'Sürükleyici tam ekran: sistem çubukları gizlenir',
    marker: 'hide(WindowInsetsCompat.Type.systemBars())',
  },
  {
    decision: 'Odak geri geldiğinde çubuklar YENİDEN gizlenir',
    marker: /onWindowFocusChanged[\s\S]*hideSystemBars\(\)/,
  },
];

function assertEdits(source: string, file: string, edits: readonly HandEdit[]): void {
  const lost = edits
    .filter((edit) =>
      typeof edit.marker === 'string' ? !source.includes(edit.marker) : !edit.marker.test(source),
    )
    .map((edit) => edit.decision);

  expect(
    lost,
    `${file}: elle alınmış karar(lar) kaybolmuş. Ağaç yeniden üretildiyse ` +
      `düzenlemeleri geri koy; karar bilinçli olarak geri alındıysa bu testteki ` +
      `satırı da sil.`,
  ).toEqual([]);
}

describe('Android üretilmiş ağaç drifti', () => {
  it('AndroidManifest elle alınmış kararları taşır', () => {
    assertEdits(read('app/src/main/AndroidManifest.xml'), 'AndroidManifest.xml', MANIFEST_EDITS);
  });

  it('MainActivity elle alınmış kararları taşır', () => {
    assertEdits(
      read('app/src/main/java/com/volstudio/arachnid/MainActivity.kt'),
      'MainActivity.kt',
      ACTIVITY_EDITS,
    );
  });

  it('paket kimliği VOL.HELL ile paylaşılmaz', () => {
    /*
     * İki oyun bir dönem aynı native projeyi ve paket kimliğini paylaşıyordu;
     * biri diğerinin üzerine kuruluyordu. Kimlik ayrımı bu ağacın var olma
     * sebebidir ve regenerate sırasında yanlış `identifier` ile geri gelmesi
     * sessiz bir çakışma üretirdi.
     */
    const manifestPath = 'app/src/main/java/com/volstudio/arachnid/MainActivity.kt';
    expect(read(manifestPath)).toContain('package com.volstudio.arachnid');

    const config = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../src-tauri/tauri.conf.json'), 'utf8'),
    ) as { identifier?: string };
    expect(config.identifier).toBe('com.volstudio.arachnid');
  });
});
