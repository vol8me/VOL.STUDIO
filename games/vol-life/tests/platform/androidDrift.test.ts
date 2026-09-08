import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ÜRETİLMİŞ ANDROID AĞACININ ELLE DÜZENLENMİŞ YERLERİ.
 *
 * `src-tauri/gen/android` Tauri CLI tarafından üretilir ama repoda tutulur ve
 * içinde ELLE yazılmış kararlar vardır. `tauri android init` bu ağacı yeniden
 * ürettiğinde hepsi sessizce silinir — üretilen bir dosya, üzerine yazıldığını
 * söylemez.
 *
 * Beklenen şey dosyaların birebir aynı kalması değil, elle alınan KARARLARIN
 * hâlâ orada olmasıdır. Bir karar bilinçli olarak geri alınıyorsa buradaki
 * satır da aynı turda silinir.
 */
const ANDROID_ROOT = resolve(import.meta.dirname, '../../src-tauri/gen/android');

function read(relativePath: string): string {
  return readFileSync(resolve(ANDROID_ROOT, relativePath), 'utf8');
}

interface HandEdit {
  readonly decision: string;
  readonly marker: string | RegExp;
}

const ACTIVITY_EDITS: readonly HandEdit[] = [
  {
    decision: 'Sürükleyici tam ekran: sistem çubukları gizlenir',
    marker: 'hide(WindowInsetsCompat.Type.systemBars())',
  },
  {
    decision: 'Odak geri geldiğinde çubuklar YENİDEN gizlenir',
    marker: /onWindowFocusChanged[\s\S]*hideSystemBars\(\)/,
  },
  {
    decision: 'Geri tuşu uygulamaya devredilir — tek sayfalık uygulamada Wry her basışta kapatırdı',
    marker: 'OnBackPressedCallback',
  },
  {
    decision: 'Geri olayı JS tarafına `vol:androidback` olarak taşınır',
    marker: "CustomEvent('vol:androidback')",
  },
  {
    decision:
      'Callback `onCreate` içinde kurulur — WebView callback`inde bazı cihazlarda kaçıyordu',
    marker: /override fun onCreate[\s\S]*onBackPressedDispatcher\.addCallback/,
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

const ACTIVITY_PATH = 'app/src/main/java/com/volstudio/life/MainActivity.kt';

describe('Android üretilmiş ağaç drifti', () => {
  it('MainActivity elle alınmış kararları taşır', () => {
    assertEdits(read(ACTIVITY_PATH), 'MainActivity.kt', ACTIVITY_EDITS);
  });

  /*
   * Dönüşte Activity yeniden yaratılırsa dünya sıfırlanır. Bu satır ŞABLONDAN
   * gelir, elle eklenmedi — ama şablon değişirse sessizce kaybolur ve kayıp
   * ancak cihazda ekran döndürülerek fark edilirdi.
   */
  it('yön değişimi Activity`yi yeniden yaratmaz', () => {
    const manifest = read('app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:configChanges="[^"]*orientation[^"]*screenSize[^"]*"/);
  });

  it('paket kimliği diğer oyunlarla paylaşılmaz', () => {
    const gradle = read('app/build.gradle.kts');
    expect(gradle).toContain('applicationId = "com.volstudio.life"');
    expect(read(ACTIVITY_PATH)).toContain('package com.volstudio.life');
  });

  /* Devir ancak karşılayan bir akış varken anlamlıdır; ikisi birlikte yaşar. */
  it('geri devri karşılayan bir JS akışı vardır', () => {
    const prompt = readFileSync(
      resolve(import.meta.dirname, '../../src/runtime/ui/LifeExitPrompt.ts'),
      'utf8',
    );
    expect(prompt).toContain('pushBackHandler');
    expect(prompt).toContain('showConfirm');
  });
});
