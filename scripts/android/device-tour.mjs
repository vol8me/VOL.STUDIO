#!/usr/bin/env node
/**
 * Android cihaz turu (F09.2, UI-11.3–11.4): bağlı bir cihazda kurulu uygulamayı adb girdisi ve
 * WebView hata ayıklama kanalıyla sürer; her kontrol PASS / FAIL / NOT-RUN yazar.
 *
 *   node scripts/android/device-tour.mjs [--serial <no>] [--package <paket>] [--apk <yol>]
 *        [--wait-unlock <sn>] [--keep-awake] [--simulate-large-screen] [--shots <dizin>]
 *
 * Kapsam: kurulu APK'nın verilen artifact ile bayt eşitliği, soğuk açılış, yatay görünüm ve
 * güvenli alan, geri tuşu (duraklat/devam), arka plana gidip dönüş, dört yön isteği, metin girişi
 * (ekran klavyesi, alanın görünür kalması, bağlam menüsü bastırma) ve titreşim isteklerinin sistem
 * servisine ulaşması. Kapsam DIŞI (insan ister): his, ses dinleme, dokunma hassasiyeti.
 *
 * Çıktı JSON'dur ve cihaz seri numarası taşımaz. Cihaz kilitliyse kilit AŞILMAZ: tur NOT-RUN olur.
 * `--simulate-large-screen` (Android 16+): ekran yoğunluğunu en küçük genişlik ≈640dp olacak biçimde geçici
 * değiştirip yön kilidini yeniden sınar; bu FİZİKSEL ≥600dp cihaz değildir, yalnız işletim sisteminin büyük
 * ekran yolunu sürer ve özgün yoğunluk ayarı geri yazılır.
 * `--keep-awake` ekran zaman aşımını tur süresince uzatır ve sonunda özgün değeri geri yazar; yön
 * ayarları da geri yazılır. Uygulama tur sonunda durdurulur.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from '../quality/command.mjs';
import { selectDevice } from './device-benchmark-contract.mjs';
import { connectWebView } from './webviewClient.mjs';
import {
  findEditAction,
  judgeOrientation,
  judgeSelection,
  judgeVibrations,
  newVibrations,
  overallVerdict,
  parseAmStart,
  parseFocusedWindow,
  parseInputShown,
  parseKeyguardShowing,
  parseUiNodes,
  parseVibrations,
  parseWakefulness,
} from './deviceTour.mjs';

const ADB = process.env.ADB ?? 'adb';
const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const pkg = option('--package') ?? 'com.volstudio.voltest';
if (!/^[a-zA-Z][\w.]*$/.test(pkg)) {
  console.error('--package geçerli bir Android paket adı olmalı.');
  process.exit(2);
}
const apkPath = option('--apk');
const waitUnlockSeconds = Number(option('--wait-unlock') ?? 0);
const keepAwake = argv.includes('--keep-awake');
const simulateLargeScreen = argv.includes('--simulate-large-screen');
const shotsDirectory = option('--shots');
if (shotsDirectory) mkdirSync(shotsDirectory, { recursive: true });

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const log = (text) => console.error(text);

const listing = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' });
const serial = selectDevice(
  listing
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .map(([deviceSerial, state]) => ({ serial: deviceSerial, state })),
  option('--serial') ?? process.env.ANDROID_SERIAL,
);
const adb = (args, options = {}) =>
  execFileSync(ADB, ['-s', serial, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
const shell = (command) => adb(['shell', command]);
const prop = (name) => adb(['shell', 'getprop', name]).trim();
const setting = (key) => shell(`settings get system ${key}`).trim();
const focus = () => parseFocusedWindow(shell('dumpsys window'));
const pidOf = () => shell(`pidof ${pkg}`).trim().split(/\s+/)[0] || null;
const vibrations = () => parseVibrations(shell('dumpsys vibrator_manager'), pkg);

/** @type {{ id: string, verdict: string, detail: string, [key: string]: unknown }[]} */
const checks = [];
const add = (id, verdict, detail, extra = {}) => {
  checks.push({ id, verdict, detail, ...extra });
  log(`  ${verdict.padEnd(7)} ${id}: ${detail}`);
};

async function screenshot(name) {
  if (!shotsDirectory) return;
  const png = execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(shotsDirectory, `${name}.png`), png);
}

/** Ekranın erişilebilirlik ağacı: yerel seçim çubuğu bu pencerede görünür. */
function uiNodes() {
  shell('uiautomator dump --windows /sdcard/vol-tour-ui.xml');
  const xml = adb(['exec-out', 'cat', '/sdcard/vol-tour-ui.xml']);
  shell('rm -f /sdcard/vol-tour-ui.xml');
  return parseUiNodes(xml);
}

const FIELD_SELECTION = `(() => {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
  return { start: field.selectionStart, end: field.selectionEnd, value: field.value };
})()`;

/**
 * Seçim ve yerel eylem çubuğu (UI-11.3). Uzun basış kelimeyi seçer ve WebView'ın kendi ActionMode çubuğunu
 * açar (`contextmenu` olayı bu yolda oluşmaz). Çubuktan Kes ve Yapıştır GERÇEKTEN çalıştırılır: alanın değeri
 * sayfadan okunur. Alan odakta ve uzun basış yapılmış varsayılır.
 */
async function selectionProbe(x, y) {
  const selected = await page.evaluate(FIELD_SELECTION);
  const judged = judgeSelection(selected);
  add('text.long-press-selects-word', judged.verdict, judged.detail);
  await screenshot('text-selection');
  // Sayı alanında seçim aralığı API'si yoktur (NOT-RUN); seçimin varlığını çubuk kanıtlar, bu yüzden sürer.
  if (judged.verdict === 'FAIL') return;

  const nodes = uiNodes();
  const labels = nodes.map((node) => node.label).slice(0, 12);
  const cut = findEditAction(nodes, 'cut');
  const copy = findEditAction(nodes, 'copy');
  if (!cut && !copy) {
    add(
      'text.selection-toolbar-visible',
      'NOT-RUN',
      `erişilebilirlik ağacında Kes/Kopyala düğümü bulunamadı (görünen etiketler: ${labels.join(' | ') || 'yok'}); ` +
        'çubuk ekran görüntüsünde incelenmeli',
    );
    return;
  }
  add(
    'text.selection-toolbar-visible',
    'PASS',
    `yerel çubuk eylemleri: ${['cut', 'copy', 'selectAll', 'paste']
      .filter((name) => findEditAction(nodes, name))
      .join(', ')}`,
  );

  if (!cut) {
    add('text.selection-cut-removes-text', 'NOT-RUN', 'çubukta Kes yok (yalnız Kopyala)');
    return;
  }
  const before = selected.value;
  adb(['shell', 'input', 'tap', String(cut.x), String(cut.y)]);
  await sleep(1);
  const afterCut = await page.evaluate(FIELD_SELECTION);
  add(
    'text.selection-cut-removes-text',
    afterCut && afterCut.value.length < before.length ? 'PASS' : 'FAIL',
    `değer "${before}" → "${afterCut?.value ?? '?'}"`,
  );

  // Boş alanda uzun basış: pano doluyken Yapıştır çubuğu çıkar.
  adb(['shell', 'input', 'swipe', String(x), String(y), String(x), String(y), '900']);
  await sleep(1.2);
  const paste = findEditAction(uiNodes(), 'paste');
  if (!paste) {
    add(
      'text.selection-paste-restores-text',
      'NOT-RUN',
      'Kes sonrası uzun basışta Yapıştır düğümü bulunamadı',
    );
    return;
  }
  adb(['shell', 'input', 'tap', String(paste.x), String(paste.y)]);
  await sleep(1);
  const afterPaste = await page.evaluate(FIELD_SELECTION);
  const cutText = selected.start === null ? before : before.slice(selected.start, selected.end);
  add(
    'text.selection-paste-restores-text',
    afterPaste !== null && afterPaste.value.includes(cutText) ? 'PASS' : 'FAIL',
    `değer "${afterCut?.value ?? '?'}" → "${afterPaste?.value ?? '?'}" (yapıştırılan "${cutText}")`,
  );
}

const PAGE_STATE = `(() => {
  // Kapalı modal DOM'da kalır: görünmezlik atadan gelen opaklık, inert ve aria-hidden ile verilir.
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
      if (node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const padding = getComputedStyle(probe);
  const insets = [padding.paddingTop, padding.paddingRight, padding.paddingBottom, padding.paddingLeft].map(parseFloat);
  probe.remove();
  const seed = [...document.querySelectorAll('input[type=number],input[type=text],textarea')].find(visible);
  const seedRect = seed ? seed.getBoundingClientRect() : null;
  return {
    type: screen.orientation && screen.orientation.type,
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    visual: { top: visualViewport.offsetTop, left: visualViewport.offsetLeft, height: visualViewport.height },
    coarse: matchMedia('(pointer: coarse)').matches,
    visibility: document.visibilityState,
    insets,
    canvases: [...document.querySelectorAll('canvas')].filter(visible).length,
    dialogs: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(visible).length,
    tokenKept: window.__tourToken === window.__tourExpected,
    field: seedRect && { x: seedRect.x, y: seedRect.y, width: seedRect.width, height: seedRect.height,
      active: document.activeElement === seed },
  };
})()`;

/** @type {{ screenOff?: string, accelerometer?: string, rotation?: string, density?: string, vibrateOn?: string }} */
const original = {};
let page = null;
let pid = null;
const tourStart = Date.now();
let verdictExit = 0;

try {
  const model = prop('ro.product.model');
  const sdk = Number(prop('ro.build.version.sdk')) || null;
  const release = prop('ro.build.version.release');
  const size = /(\d+)x(\d+)/.exec(shell('wm size'));
  const density = /(\d+)/.exec(shell('wm density'));
  log(`cihaz: ${model} · Android ${release} (API ${sdk})`);

  // Kilit AŞILMAZ: kilitliyse (ya da uykudaysa) ekranı uyandırıp bekler, süre dolarsa NOT-RUN yazar.
  if (keepAwake) {
    original.screenOff = setting('screen_off_timeout');
    shell('settings put system screen_off_timeout 1800000');
  }
  const deadline = Date.now() + waitUnlockSeconds * 1000;
  let locked = true;
  for (;;) {
    const awake = parseWakefulness(shell('dumpsys power')) === 'Awake';
    if (!awake) adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    locked = !awake || parseKeyguardShowing(shell('dumpsys window')) !== false;
    if (!locked || Date.now() >= deadline) break;
    await sleep(2);
  }
  if (locked) {
    add('prereq.unlocked', 'NOT-RUN', 'cihaz kilitli ya da uykuda; kilit aşılmadı, tur koşulmadı');
    verdictExit = 3;
  } else {
    add('prereq.unlocked', 'PASS', 'ekran uyanık ve kilit açık');
    if (apkPath) {
      const local = createHash('sha256').update(readFileSync(apkPath)).digest('hex');
      const remote = shell(`pm path ${pkg}`).trim().split('\n')[0]?.replace('package:', '').trim();
      const scratch = mkdtempSync(join(tmpdir(), 'vol-tour-'));
      try {
        const pulled = join(scratch, 'base.apk');
        adb(['pull', remote, pulled], { stdio: ['ignore', 'pipe', 'pipe'] });
        const installed = createHash('sha256').update(readFileSync(pulled)).digest('hex');
        add(
          'build.installed-matches-artifact',
          installed === local ? 'PASS' : 'FAIL',
          installed === local
            ? `kurulu APK verilen artifact ile aynı (${local.slice(0, 12)}…)`
            : 'kurulu APK verilen artifact ile FARKLI',
        );
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    } else {
      add(
        'build.installed-matches-artifact',
        'NOT-RUN',
        '--apk verilmedi; kurulu sürüm commit’e bağlanamadı',
      );
    }

    const vibrationsBefore = vibrations();
    shell(`am force-stop ${pkg}`);
    await sleep(1);
    const started = parseAmStart(shell(`am start -W -n ${pkg}/.MainActivity`));
    let focused = null;
    for (let attempt = 0; attempt < 20 && focused?.package !== pkg; attempt += 1) {
      await sleep(1);
      focused = focus();
    }
    pid = pidOf();
    add(
      'launch.cold-start',
      started.status === 'ok' && started.launchState === 'COLD' && focused?.package === pkg && pid
        ? 'PASS'
        : 'FAIL',
      `durum=${started.status} başlangıç=${started.launchState} süre=${started.totalMs}ms odak=${focused?.window ?? 'yok'}`,
    );

    if (pid) {
      await sleep(5);
      page = await connectWebView(adb, pid);
      const expected = Math.random().toString(36).slice(2);
      await page.evaluate(
        `(window.__tourToken = window.__tourExpected = ${JSON.stringify(expected)})`,
      );
      const state = await page.evaluate(PAGE_STATE);
      await screenshot('launch');
      add(
        'runtime.landscape-touch-canvas',
        state.type?.startsWith('landscape') &&
          state.width > state.height &&
          state.coarse &&
          state.canvases > 0
          ? 'PASS'
          : 'FAIL',
        `${state.type} ${state.width}×${state.height} dpr=${state.dpr} dokunmatik=${state.coarse} tuval=${state.canvases} güvenli alan(ü,s,a,sol)=${state.insets.join('/')}`,
        {
          insets: state.insets,
          display: { width: size?.[1], height: size?.[2], density: density?.[1] },
        },
      );

      // Uygulama ana menüde açılır: duraklatma, metin ve titreşim adımları oyun içindir; alıştırma oturumu
      // çevrimdışı açılır ve HUD göstergeleri görününce dünya hazırdır.
      const entered = await page.evaluate(`(async () => {
        const button = document.querySelector('[data-testid="menu-practice"]');
        if (!button) return false;
        button.click();
        for (let wait = 0; wait < 60; wait += 1) {
          const vitals = document.querySelector('[data-testid="vitals"]');
          if (vitals && vitals.getBoundingClientRect().width > 0 && Number(getComputedStyle(vitals).opacity) > 0) return true;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
      })()`);
      await sleep(1);
      await screenshot('world');
      add(
        'menu.practice-enters-world',
        entered ? 'PASS' : 'FAIL',
        entered
          ? 'alıştırma açıldı, HUD göstergeleri görünür'
          : 'HUD göstergeleri 15 sn içinde görünmedi',
      );

      // Geri tuşu: uygulamayı kapatmaz; duraklatma panelini açar, ikinci basış devam ettirir.
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      await sleep(1.5);
      const paused = await page.evaluate(PAGE_STATE);
      await screenshot('back-pause');
      add(
        'back.opens-pause',
        paused.dialogs > 0 && focus()?.package === pkg && pidOf() === pid ? 'PASS' : 'FAIL',
        `panel=${paused.dialogs} odak=${focus()?.package ?? 'yok'} süreç ${pidOf() === pid ? 'aynı' : 'DEĞİŞTİ'}`,
      );
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      await sleep(1.5);
      const resumed = await page.evaluate(PAGE_STATE);
      add(
        'back.second-resumes',
        resumed.dialogs === 0 && focus()?.package === pkg && pidOf() === pid ? 'PASS' : 'FAIL',
        `panel=${resumed.dialogs} odak=${focus()?.package ?? 'yok'}`,
      );

      // Arka plan: süreç yaşar, sayfa yeniden yüklenmez, dönüşte kareler akar.
      adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
      await sleep(2);
      const away = focus();
      add(
        'lifecycle.background-keeps-process',
        away?.package !== pkg && pidOf() === pid ? 'PASS' : 'FAIL',
        `arka planda odak=${away?.window ?? 'yok'} süreç ${pidOf() === pid ? 'aynı' : 'DEĞİŞTİ'}`,
      );
      shell(`am start -n ${pkg}/.MainActivity`);
      await sleep(2);
      const frames = await page.evaluate(
        `new Promise((resolve) => { let count = 0; const end = performance.now() + 1000;
          const tick = () => { count += 1; performance.now() < end ? requestAnimationFrame(tick) : resolve(count); };
          requestAnimationFrame(tick); })`,
      );
      const back = await page.evaluate(PAGE_STATE);
      await screenshot('foreground-again');
      add(
        'lifecycle.resume-visible-frames-advance',
        focus()?.package === pkg &&
          pidOf() === pid &&
          back.visibility === 'visible' &&
          back.tokenKept &&
          frames >= 20
          ? 'PASS'
          : 'FAIL',
        `odak=${focus()?.package ?? 'yok'} görünürlük=${back.visibility} aynı sayfa=${back.tokenKept} 1 sn'de ${frames} kare`,
      );

      // Yön: manifest `landscape` kilidi dikey isteği yok saymalı; Activity yeniden yaratılmamalı.
      original.accelerometer = setting('accelerometer_rotation');
      original.rotation = setting('user_rotation');
      shell('settings put system accelerometer_rotation 0');
      const rotations = [];
      for (const rotation of [0, 1, 2, 3]) {
        shell(`settings put system user_rotation ${rotation}`);
        await sleep(2);
        const snapshot = await page.evaluate(PAGE_STATE);
        const judged = judgeOrientation({ ...snapshot, pid: pidOf() }, { pid });
        rotations.push({ rotation, ...judged });
        if (rotation === 0 || rotation === 1) await screenshot(`rotation-${rotation}`);
      }
      add(
        'orientation.landscape-lock-holds',
        rotations.every((entry) => entry.verdict === 'PASS') ? 'PASS' : 'FAIL',
        rotations
          .map((entry) => `${entry.rotation}: ${entry.verdict} (${entry.detail})`)
          .join(' | '),
      );
      shell(`settings put system user_rotation ${original.rotation}`);
      shell(`settings put system accelerometer_rotation ${original.accelerometer}`);
      await sleep(1.5);

      // Metin girişi: ekran klavyesi açılır, alan klavyenin üstünde görünür kalır. Yön denemesinden sonra
      // ilk geri basışı geçici sistem çubuğunu kapatmış olabilir; panel açılana dek (en çok 3) basılır.
      for (let press = 0; press < 3; press += 1) {
        adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        await sleep(1.5);
        if ((await page.evaluate(PAGE_STATE)).dialogs > 0) break;
      }
      await page.evaluate(
        `(() => { window.__tourContext = []; document.addEventListener('contextmenu', (event) => window.__tourContext.push(event), false); })()`,
      );
      let before = await page.evaluate(PAGE_STATE);
      for (let attempt = 0; attempt < 6 && !before.field; attempt += 1) {
        await sleep(1);
        before = await page.evaluate(PAGE_STATE);
      }
      // Alıştırmanın duraklatma menüsünde metin alanı yoktur: "Savaşa katıl" garaja götürür ve oyuncu adı
      // alanı orada sürülür. Sayfa gezintisi DOM tıklamasıdır; klavye, odak ve seçim gerçek dokunuştur.
      let leftWorld = false;
      if (!before.field) {
        leftWorld = await page.evaluate(
          `(() => { const button = document.querySelector('[data-testid="pause-online"]'); if (!button) return false; button.click(); return true; })()`,
        );
        for (let attempt = 0; leftWorld && attempt < 8 && !before.field; attempt += 1) {
          await sleep(1);
          before = await page.evaluate(PAGE_STATE);
        }
      }
      await screenshot('text-before');
      // Dar yatay ekranda panel görünümden uzun olabilir: kullanıcı gibi önce alanı görünüme kaydırır.
      const needsScroll =
        before.field &&
        (before.field.y < 0 || before.field.y + before.field.height > before.height);
      if (before.field && needsScroll) {
        await page.evaluate(
          `(() => { const field = [...document.querySelectorAll('input[type=number],input[type=text],textarea')].find((element) => element.getBoundingClientRect().width > 0); field && field.scrollIntoView({ block: 'center' }); })()`,
        );
        await sleep(0.8);
        before = await page.evaluate(PAGE_STATE);
      }
      if (before.field) {
        const x = Math.round((before.field.x + before.field.width / 2) * before.dpr);
        const y = Math.round((before.field.y + before.field.height / 2) * before.dpr);
        adb(['shell', 'input', 'tap', String(x), String(y)]);
        await sleep(2);
        const shown = parseInputShown(shell('dumpsys input_method'));
        const typing = await page.evaluate(PAGE_STATE);
        await screenshot('text-entry');
        // Klavye yalnız görsel görünümü küçültür (`resizes-visual`): alan, ekran klavyesinin üstünde kalan
        // görsel görünümün içinde olmalı; düzen görünümü yüksekliğine bakmak klavyenin ardını görünür sayar.
        const field = typing.field;
        const fieldVisible =
          field !== null &&
          field.y - typing.visual.top >= 0 &&
          field.y + field.height - typing.visual.top <= typing.visual.height;
        add(
          'text.keyboard-opens-field-visible',
          shown === true && typing.field?.active && fieldVisible ? 'PASS' : 'FAIL',
          `${needsScroll ? 'kaydırma gerekti; ' : ''}klavye=${shown} alan odakta=${typing.field?.active} alan görsel görünümde=${fieldVisible} (alan y=${Math.round(field?.y ?? -1)}, görsel görünüm üst=${Math.round(typing.visual.top)} yükseklik=${Math.round(typing.visual.height)}/${typing.height})`,
        );
        // Alanın özgün değeri turdan sonra geri yazılır (garajdaki oyuncu adı kalıcıdır).
        const originalValue = await page.evaluate(
          `(() => { const field = document.activeElement; return field && 'value' in field ? String(field.value) : ''; })()`,
        );
        // Seçim sınaması için alana bilinen bir değer yazılır (rakam: sayı alanı da kabul eder).
        adb(['shell', 'input', 'text', '24680']);
        await sleep(0.8);
        // Uzun basış METNİN üstüne yapılır. Klavye görsel görünümü kaydırır: `getBoundingClientRect` düzen
        // görünümünün koordinatıdır, ekrana dokunmak için görsel görünümün ofseti çıkarılır (çıkarılmazsa
        // dokunuş klavyenin tuşlarına düşer ve alana rakam yazar).
        const textX = String(Math.round((typing.field.x - typing.visual.left + 34) * typing.dpr));
        const textY = String(
          Math.round((typing.field.y - typing.visual.top + typing.field.height / 2) * typing.dpr),
        );
        adb(['shell', 'input', 'swipe', textX, textY, textX, textY, '900']);
        await sleep(1.2);
        const context = await page.evaluate(
          `({ count: window.__tourContext.length, prevented: window.__tourContext.filter((event) => event.defaultPrevented).length })`,
        );
        // Dokunmada yerel seçim çubuğu kalır: bu alanda oluşan `contextmenu` olayı ENGELLENMEMELİ (engellenirse
        // WebView tutamakları gösterir ama Kes/Kopyala çubuğunu açmaz; gerçek cihazda ölçüldü).
        add(
          'text.touch-context-menu-not-prevented',
          context.count === 0 ? 'NOT-RUN' : context.prevented === 0 ? 'PASS' : 'FAIL',
          context.count === 0
            ? 'dokunuşta contextmenu olayı oluşmadı; engelleme sınanamadı'
            : `${context.count} contextmenu olayı, ${context.prevented} engellendi`,
        );
        await selectionProbe(Number(textX), Number(textY));
        await page.evaluate(
          `(() => { const field = document.activeElement; if (field && 'value' in field) { field.value = ${JSON.stringify(originalValue)}; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); } })()`,
        );
        adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        await sleep(1);
        adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        await sleep(1);
      } else {
        add(
          'text.keyboard-opens-field-visible',
          'NOT-RUN',
          'duraklatma panelinde ve garajda metin alanı bulunamadı',
        );
      }

      // Garaja geçildiyse titreşim adımı için alıştırma dünyasına dönülür (garajdan ya da ana menüden).
      if (leftWorld) {
        for (const testid of ['garage-practice', 'menu-practice']) {
          const clicked = await page.evaluate(
            `(() => { const button = document.querySelector('[data-testid="${testid}"]'); if (!button) return false; button.click(); return true; })()`,
          );
          if (clicked) break;
        }
        await sleep(3);
      }

      // Titreşim istekleri oyun alanındaki kumanda dokunuşlarından gelir (geri tuşu her cihazda üretmez).
      // Sanal çubukların yeri cihaza göre değişir; alt bandı tarayan kısa sürüklemelerle çubuğa denk gelinir.
      if ((await page.evaluate(PAGE_STATE)).dialogs > 0) {
        adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        await sleep(1.2);
      }
      // Cihazın titreşim anahtarı kapalıysa sistem her isteği `ignored_for_settings` sayar ve çalındığı
      // ölçülemez; tur anahtarı yalnız bu adımda açar ve hemen geri yazar (çıkışta da `finally` yazar).
      original.vibrateOn = setting('vibrate_on');
      if (original.vibrateOn === '0') shell('settings put system vibrate_on 1');
      await sleep(1);
      const longSide = Math.max(Number(size?.[1] ?? 0), Number(size?.[2] ?? 0));
      const shortSide = Math.min(Number(size?.[1] ?? 0), Number(size?.[2] ?? 0));
      for (const fy of [0.74, 0.89]) {
        for (const fx of [0.07, 0.12, 0.875, 0.93]) {
          const x = Math.round(fx * longSide);
          const y = Math.round(fy * shortSide);
          adb([
            'shell',
            'input',
            'swipe',
            String(x),
            String(y),
            String(x),
            String(y - Math.round(0.18 * shortSide)),
            '500',
          ]);
        }
      }
      await sleep(1);
      const judged = judgeVibrations(newVibrations(vibrationsBefore, vibrations()));
      shell(`settings put system vibrate_on ${original.vibrateOn}`);
      delete original.vibrateOn;
      add('haptics.request-reached-system', judged.reached.verdict, judged.reached.detail);
      add('haptics.played', judged.played.verdict, judged.played.detail);

      // Benzetim yoğunluğu değiştirdiği için diğer adımlardan sonra, en sonda koşar.
      if (simulateLargeScreen) {
        if (!sdk || sdk < 36) {
          add(
            'orientation.large-screen-simulated',
            'NOT-RUN',
            `Android ${release} (API ${sdk}): büyük ekranda yön kilidini yok sayan kural yok`,
          );
        } else {
          const densityText = shell('wm density');
          const physical = /Physical density: (\d+)/.exec(densityText);
          const override = /Override density: (\d+)/.exec(densityText);
          const shortPx = Math.min(Number(size?.[1] ?? 0), Number(size?.[2] ?? 0));
          const target = Math.round((shortPx * 160) / 640);
          original.density = override ? override[1] : 'reset';
          shell(`wm density ${target}`);
          await sleep(3);
          shell('settings put system accelerometer_rotation 0');
          const large = [];
          for (const rotation of [0, 1, 2, 3]) {
            shell(`settings put system user_rotation ${rotation}`);
            await sleep(2);
            large.push({
              rotation,
              ...judgeOrientation({ ...(await page.evaluate(PAGE_STATE)), pid: pidOf() }, { pid }),
            });
          }
          const swDp = Math.round((shortPx * 160) / target);
          add(
            'orientation.large-screen-simulated',
            large.every((entry) => entry.verdict === 'PASS') ? 'PASS' : 'FAIL',
            `en küçük genişlik ≈${swDp}dp (yoğunluk ${physical?.[1] ?? '?'} → ${target}; BENZETİM, fiziksel ≥600dp cihaz değil): ${large
              .map((entry) => `${entry.rotation}: ${entry.verdict} (${entry.detail})`)
              .join(' | ')}`,
          );
          shell(
            original.density === 'reset' ? 'wm density reset' : `wm density ${original.density}`,
          );
          delete original.density;
          shell(`settings put system user_rotation ${original.rotation}`);
          shell(`settings put system accelerometer_rotation ${original.accelerometer}`);
          await sleep(2);
        }
      }
    }
  }
} finally {
  try {
    page?.close();
  } catch {
    // Kanal zaten kapalıysa temizlenecek bir şey yoktur.
  }
  // Kablosuz adb düşebilir: geri yazma birkaç kez denenir, olmazsa özgün değer açıkça yazılır.
  const restore = async (command) => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        shell(command);
        return;
      } catch {
        await sleep(2);
      }
    }
    log(`UYARI: ayar geri yazılamadı, elle uygula: adb shell ${command}`);
  };
  if (original.density !== undefined) {
    await restore(
      original.density === 'reset' ? 'wm density reset' : `wm density ${original.density}`,
    );
  }
  if (original.rotation !== undefined)
    await restore(`settings put system user_rotation ${original.rotation}`);
  if (original.accelerometer !== undefined)
    await restore(`settings put system accelerometer_rotation ${original.accelerometer}`);
  if (original.vibrateOn !== undefined)
    await restore(`settings put system vibrate_on ${original.vibrateOn}`);
  if (original.screenOff !== undefined)
    await restore(`settings put system screen_off_timeout ${original.screenOff}`);
  await restore(`am force-stop ${pkg}`);
}

const overall = overallVerdict(checks);
const record = {
  schema: 'AndroidDeviceTourV1',
  package: pkg,
  device: {
    model: prop('ro.product.model'),
    release: prop('ro.build.version.release'),
    sdk: Number(prop('ro.build.version.sdk')) || null,
  },
  durationSeconds: Math.round((Date.now() - tourStart) / 1000),
  restoredSettings: original,
  verdict: overall,
  checks,
  limits:
    'adb girdisi ve WebView kanalı kanıtıdır: dokunma/titreşim hissi, ses dinleme ve gerçek AT insan kabulüdür; ekran görüntüleri insan incelemesi içindir.',
};
console.log(JSON.stringify(record, null, 2));
process.exit(verdictExit || (overall === 'FAIL' ? 1 : 0));
