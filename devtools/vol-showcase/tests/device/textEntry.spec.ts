import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { ShowcaseTab } from '../e2e/support/determinism';
import { APP_URL, OUT_DIR, expect, test } from './device';

/**
 * GERÇEK CİHAZ metin girişi kabulü (UI-11.1): Android Chrome + cihazın gerçek ekran klavyesi (Gboard).
 * Tuşlara `adb shell input tap` ile gerçekten dokunulur; Gboard'un bileşim (composition) davranışı, `keydown`
 * kodları ve eylem tuşu sayfaya gerçek IME yolundan gelir. Taklit değildir; insan yazım hissi ve başka IME'ler
 * (Samsung Klavye, Japonca/Korece) bu kaydın dışındadır (UI-13.4).
 */
const ADB = process.env.ADB ?? 'adb';
const serial = process.env.VOL_DEVICE_SERIAL;
const adb = (...parts: string[]): string =>
  execFileSync(ADB, [...(serial ? ['-s', serial] : []), ...parts], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

async function touchTap(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('dokunulacak öğenin kutusu yok');
  const session = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function selectTab(page: Page, tab: ShowcaseTab): Promise<void> {
  await touchTap(page, page.locator(`[role="tab"][id$="-tab-${tab}"]`));
  await page
    .locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`)
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(250);
}

function save(name: string, document: unknown): void {
  writeFileSync(
    resolve(OUT_DIR, name),
    `${JSON.stringify(document, null, 2)}
`,
  );
}

function shot(name: string): void {
  try {
    const png = execFileSync(
      ADB,
      [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(resolve(OUT_DIR, name), png);
  } catch {
    /* ekran görüntüsü kanıtın eki; alınamazsa koşu durmaz */
  }
}

const GBOARD = 'com.google.android.inputmethod.latin';
/** Eylem tuşunun adı IME'nin `imeOptions`ına göre değişir ve cihaz diline çevrilir (`enterkeyhint="go"` → Git/Go). */
const GO_LABELS = ['Git', 'Go'];
const ACTION_LABELS = [
  ...GO_LABELS,
  'Enter',
  'Sonraki',
  'Ara',
  'Bitti',
  'Gönder',
  'Tamam',
  'Next',
  'Search',
  'Done',
  'Send',
];

interface KeyPoint {
  x: number;
  y: number;
}

/** Gboard'un erişilebilirlik ağacından tuşların ekran merkezleri (`uiautomator dump --windows`: IME penceresi dahil). */
function readImeKeys(): Map<string, KeyPoint> {
  adb('shell', 'uiautomator', 'dump', '--windows', '/sdcard/vol-ime.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/vol-ime.xml');
  const keys = new Map<string, KeyPoint>();
  for (const match of xml.matchAll(/<node [^>]*>/g)) {
    const node = match[0];
    if (!node.includes(`package="${GBOARD}"`)) continue;
    const label = /content-desc="([^"]+)"/.exec(node)?.[1];
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!label || !bounds || keys.has(label)) continue;
    keys.set(label, {
      x: (Number(bounds[1]) + Number(bounds[3])) / 2,
      y: (Number(bounds[2]) + Number(bounds[4])) / 2,
    });
  }
  return keys;
}

function tapImeKey(keys: Map<string, KeyPoint>, label: string): void {
  const point = keys.get(label);
  if (!point) throw new Error(`Gboard tuşu yok: ${label} (var: ${[...keys.keys()].join(' ')})`);
  adb('shell', 'input', 'tap', String(Math.round(point.x)), String(Math.round(point.y)));
}

function imeState(): { shown: boolean; method: string } {
  const dump = adb('shell', 'dumpsys', 'input_method');
  return {
    shown: /mInputShown=true/.test(dump),
    method: /mCurMethodId=(\S+)/.exec(dump)?.[1] ?? '',
  };
}

async function waitForIme(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (imeState().shown) return;
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error('Gboard 10 sn içinde görünmedi');
}

interface KeyRecord {
  type: string;
  key: string;
  keyCode: number;
  composing: boolean;
  data: string;
}

async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: unknown[] = [];
    (window as unknown as { __imeLog: unknown[] }).__imeLog = log;
    for (const type of [
      'keydown',
      'keyup',
      'beforeinput',
      'input',
      'compositionstart',
      'compositionupdate',
      'compositionend',
    ]) {
      document.addEventListener(
        type,
        (event) => {
          const e = event as KeyboardEvent & InputEvent;
          log.push({
            type,
            key: e.key ?? '',
            keyCode: e.keyCode ?? 0,
            composing: e.isComposing === true,
            data: e.data ?? '',
          });
        },
        true,
      );
    }
  });
}

const readLog = (page: Page): Promise<KeyRecord[]> =>
  page.evaluate(() => (window as unknown as { __imeLog: KeyRecord[] }).__imeLog.slice());

async function hideIme(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const deadline = Date.now() + 5_000;
  while (imeState().shown && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 250));
  }
}

async function openShowcase(page: Page, tab: ShowcaseTab): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await selectTab(page, tab);
}

test('cihaz: gerçek Gboard — komut paletinde yazarken komut çalışmaz; "Git" tuşu gerçek Enter üretir ve komutu çalıştırır', async ({
  device: page,
}) => {
  await openShowcase(page, 'advanced');
  await installRecorder(page);

  const card = page
    .locator('.vol-showcase-card', { hasText: /komut paleti|command palette/i })
    .first();
  await touchTap(page, card.locator('button').first());
  const input = page.locator('.vol-command-palette--visible input');
  await input.waitFor({ timeout: 10_000 });
  // Düğme dokunuşundaki `focus()` yerel klavyeyi kendiliğinden açabilir; açmadıysa alana gerçek dokunuş yeter.
  await page.waitForTimeout(800);
  if (!imeState().shown) await touchTap(page, input);
  await waitForIme();
  const ime = imeState();
  test.skip(!ime.method.startsWith(GBOARD), `varsayılan klavye Gboard değil: ${ime.method}`);

  // `enterkeyhint` DOM'da: eylem tuşunun "Git" olmasının nedeni budur (ipucu yoksa "Sonraki" çıkar ve Enter gelmez).
  await expect(input).toHaveAttribute('enterkeyhint', 'go');

  const keys = readImeKeys();
  for (const letter of 'kule') tapImeKey(keys, letter);
  await page.waitForTimeout(600);
  await expect(input).toHaveValue(/^kule$/i);
  shot('palette-gboard-typed.png');

  const typing = await readLog(page);
  const keydowns = typing.filter((record) => record.type === 'keydown');
  expect(keydowns.length).toBeGreaterThanOrEqual(4);
  // Gerçek Gboard tuşları IME tuşu olarak gelir (keyCode 229 ya da isComposing): `isComposingKey` bunların hepsini tanır
  // ve palet bu tuşları kendi eylemi saymaz. Hiçbiri Enter/Escape/ok değildir.
  for (const record of keydowns) {
    expect(record.keyCode === 229 || record.composing, JSON.stringify(record)).toBe(true);
    expect(['Enter', 'Escape', 'ArrowUp', 'ArrowDown']).not.toContain(record.key);
  }
  // Yazarken komut çalışmadı, palet kapanmadı.
  await expect(page.locator('.vol-command-palette--visible')).toHaveCount(1);
  await expect(card).toContainText(/bekleniyor|awaiting/i);

  const action = ACTION_LABELS.find((label) => keys.has(label));
  expect(GO_LABELS, `eylem tuşu "Git/Go" olmalı; görünen: ${action ?? 'yok'}`).toContain(action);
  tapImeKey(keys, action!);
  await expect(card).toContainText(/Kule|Turret/i);
  await expect(page.locator('.vol-command-palette--visible')).toHaveCount(0);

  const enter = (await readLog(page))
    .slice(typing.length)
    .filter((record) => record.type === 'keydown' && record.key === 'Enter');
  expect(enter).toHaveLength(1);
  expect(enter[0].keyCode).toBe(13);
  expect(enter[0].composing).toBe(false);

  save('palette-gboard.json', {
    ime: ime.method,
    typed: 'kule',
    keydownsWhileTyping: keydowns.map(({ key, keyCode, composing }) => ({
      key,
      keyCode,
      composing,
    })),
    compositionEvents: typing.filter((record) => record.type.startsWith('composition')).length,
    actionKey: action,
    enter: enter[0],
  });
  shot('palette-gboard-executed.png');
  await hideIme(page);
});

test('cihaz: dokunmatik modda yerel klavye açılır, ekran klavyesi açılmaz; salt okunur alan klavye açmaz', async ({
  device: page,
}) => {
  await openShowcase(page, 'forms');

  const writable = page.locator('input.vol-input:not([readonly])[type="text"]').first();
  await touchTap(page, writable);
  await waitForIme();
  // Kol kipi kapalı: çekirdeğin ekran klavyesi yerel klavyenin yerine geçmez.
  await expect(page.locator('.vol-osk')).toHaveCount(0);
  await hideIme(page);

  const readOnly = page.locator('input.vol-input[readonly]').first();
  await touchTap(page, readOnly);
  await page.waitForTimeout(1500);
  expect(imeState().shown, 'salt okunur alan klavye açmamalı').toBe(false);
  await expect(page.locator('.vol-osk')).toHaveCount(0);

  const password = page.locator('input.vol-input[type="password"]').first();
  await touchTap(page, password);
  await waitForIme();
  await expect(page.locator('.vol-osk')).toHaveCount(0);
  shot('forms-password-gboard.png');
  await hideIme(page);

  save('forms-ime.json', {
    ime: imeState().method,
    writableOpensNativeKeyboard: true,
    readOnlyOpensKeyboard: false,
    passwordOpensNativeKeyboard: true,
    coreKeyboardOpened: false,
  });
});
