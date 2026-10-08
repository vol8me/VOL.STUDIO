#!/usr/bin/env node
/**
 * Vitrin galerisi (kabul kaydı, kapı değil): her sekmedeki HER kartı iki yüzey dilinde (çelik, aurum) ve etkileşim
 * durumlarıyla (varsayılan · üzerine gelme · klavye odağı · basılı) tek şerit görüntü olarak üretir; ardından açık
 * katmanları (modal, sheet, onay, popup, popover, bağlam menüsü, bildirimler, diyalog, komut paleti, ekran klavyesi
 * katmanları, seviye/mağaza seçici, radyal menü, ipucu) tam ekran alır.
 *
 *   node devtools/vol-showcase/scripts/gallery.mjs [--tag <ad>] [--base http://127.0.0.1:4173]
 *
 * Çıktı: `devtools/vol-showcase/records/ui-gallery/<tag>/` (git dışı): `cards/*.jpg`, `layers/*.jpg`, `index.json`.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const tag = opt('tag', new Date().toISOString().slice(0, 10));
const PORT = Number(process.env.VOL_GALLERY_PORT ?? 4177);
const base = opt('base', `http://127.0.0.1:${PORT}`);
const out = resolve(root, 'records/ui-gallery', tag);
const TABS = [
  'buttons',
  'text',
  'panels',
  'hud',
  'cards',
  'forms',
  'workbench',
  'palette',
  'advanced',
  'scroll',
  'touch',
  'loading',
  'ses',
  'kimlik',
];
const SKINS = [
  { id: 'steel', label: 'Çelik' },
  { id: 'aurum', label: 'Aurum' },
];
const STILL =
  '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
const INTERACTIVE =
  'button:not([disabled]):not(.vol-sr-only), [role="tab"], input:not([type="hidden"]):not([disabled]), [role="slider"], [role="combobox"], [tabindex="0"]';

const only = opt('only', 'all');
if (only === 'all') rmSync(out, { recursive: true, force: true });
if (only === 'layers') rmSync(resolve(out, 'layers'), { recursive: true, force: true });
mkdirSync(resolve(out, 'cards'), { recursive: true });
mkdirSync(resolve(out, 'layers'), { recursive: true });

const server = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  },
);
await new Promise((done) => setTimeout(done, 4000));

const browser = await chromium.launch();
const previous =
  only === 'layers' ? JSON.parse(readFileSync(resolve(out, 'index.json'), 'utf8')) : null;
const index = {
  tag,
  generated: new Date().toISOString(),
  cards: previous?.cards ?? [],
  layers: [],
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const slug = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'x';

async function openPage(width = 1280, height = 800) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForSelector('[role="tablist"]');
  await page.addStyleTag({ content: STILL });
  return { context, page };
}

async function setSkin(page, skin) {
  const label = await page.locator('.vol-showcase-skin-button').textContent();
  const wantsAurum = skin === 'aurum';
  const isAurum = /aurum/i.test(label ?? '');
  if (wantsAurum !== isAurum) await page.locator('.vol-showcase-skin-button').click();
  await sleep(300);
  await page.addStyleTag({ content: STILL });
}

async function selectTab(page, tab) {
  await page.locator(`[role="tab"][id$="-tab-${tab}"]`).click();
  await page.locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`).waitFor();
  await sleep(250);
}

/** Şerit: etiketli kareleri yan yana tek JPEG'e dizer (tarayıcıda canvas ile). */
async function compose(composer, frames) {
  return composer.evaluate(async (items) => {
    const images = await Promise.all(
      items.map(
        (item) =>
          new Promise((resolve) => {
            const image = new globalThis.Image();
            image.onload = () => resolve(image);
            image.src = `data:image/png;base64,${item.b64}`;
          }),
      ),
    );
    const gap = 16;
    const label = 28;
    const width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length + 1);
    const height = Math.max(...images.map((image) => image.height)) + label + gap * 2;
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#0b0d10';
    context.fillRect(0, 0, width, height);
    context.font = '600 20px sans-serif';
    let x = gap;
    images.forEach((image, index) => {
      context.fillStyle = '#9aa7b3';
      context.fillText(items[index].label, x, gap + 18);
      context.drawImage(image, x, gap + label);
      x += image.width + gap;
    });
    return canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
  }, frames);
}

const composerContext = await browser.newContext();
const composer = await composerContext.newPage();
await composer.goto('about:blank');

async function cardStates(page, tab, skin) {
  const cards = page.locator(`[role="tabpanel"][id$="-panel-${tab}"] .vol-showcase-card`);
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const title =
      (
        (await card
          .locator('.vol-showcase-card__title')
          .first()
          .textContent()
          .catch(() => '')) ?? ''
      ).trim() || `kart-${i + 1}`;
    await card.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    const frames = [];
    const snap = async (label) =>
      frames.push({ label, b64: (await card.screenshot()).toString('base64') });
    await snap('varsayılan');
    const target = card.locator(INTERACTIVE).first();
    if (await target.count()) {
      try {
        await target.hover({ timeout: 2000 });
        await sleep(120);
        await snap('üzerine gelme');
        await page.mouse.move(2, 2);
        await page.keyboard.press('Shift');
        await target.focus({ timeout: 2000 });
        await sleep(120);
        await snap('klavye odağı');
        await target.blur();
        const box = await target.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await sleep(120);
          await snap('basılı');
          await page.mouse.move(2, 2);
          await page.mouse.up();
        }
      } catch {
        /* bu kartın etkileşim kareleri alınamadı; varsayılan kare yeterli */
      }
    }
    await page.mouse.move(2, 2);
    await page.keyboard.press('Escape');
    const file = `cards/${skin}-${tab}-${String(i + 1).padStart(2, '0')}-${slug(title)}.jpg`;
    writeFileSync(resolve(out, file), Buffer.from(await compose(composer, frames), 'base64'));
    index.cards.push({ skin, tab, title, file, states: frames.map((f) => f.label) });
    console.log(`[kart] ${skin} ${tab} ${title} (${frames.length} durum)`);
  }
}

async function layerShot(page, id, title, skin, setup, teardown) {
  const done = await setup(page);
  if (done === false) {
    console.warn(`[katman] ${id} kurulamadı`);
    return;
  }
  await sleep(700);
  const file = `layers/${skin}-${id}.jpg`;
  const png = await page.screenshot();
  const jpeg = await compose(composer, [
    { label: `${title} · ${skin}`, b64: png.toString('base64') },
  ]);
  writeFileSync(resolve(out, file), Buffer.from(jpeg, 'base64'));
  index.layers.push({ skin, id, title, file });
  console.log(`[katman] ${skin} ${id}`);
  await (teardown ? teardown(page) : page.keyboard.press('Escape'));
  await sleep(500);
}

const byName = (page, name) => page.getByRole('button', { name, exact: true });

const LAYERS = [
  [
    'modal',
    'Modal',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Open Modal').click();
    },
  ],
  [
    'modal-locked',
    'Kilitli modal',
    async (p) => {
      await selectTab(p, 'panels');
      await p.getByRole('button', { name: /Open Locked Modal/ }).click();
    },
  ],
  [
    'sheet',
    'Sheet',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Open Sheet').click();
    },
  ],
  [
    'confirm',
    'Onay (yıkıcı)',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Delete Save').click();
    },
  ],
  [
    'popup',
    'Popup',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Open Popup').click();
    },
  ],
  [
    'popover',
    'Popover',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Open Popover').click();
    },
  ],
  [
    'context-menu',
    'Bağlam menüsü',
    async (p) => {
      await selectTab(p, 'panels');
      await p.getByRole('button', { name: /Actions/ }).click();
    },
  ],
  [
    'toasts',
    'Bildirimler (bilgi, başarı, kritik, eylemli)',
    async (p) => {
      await selectTab(p, 'panels');
      for (const name of ['Show Info', 'Show Success', 'Show Danger', 'Show Action'])
        await byName(p, name).click();
    },
    async (p) => {
      await p.reload();
      await p.waitForSelector('[role="tablist"]');
      await p.addStyleTag({ content: STILL });
    },
  ],
  [
    'corner-notification',
    'Köşe bildirimi',
    async (p) => {
      await selectTab(p, 'panels');
      await byName(p, 'Show Notification').click();
    },
  ],
  [
    'select-open',
    'Seçim listesi',
    async (p) => {
      await selectTab(p, 'forms');
      await p.locator('.vol-select').first().click();
    },
  ],
  [
    'osk-letters',
    'Ekran klavyesi — harfler',
    async (p) => {
      await selectTab(p, 'forms');
      await byName(p, 'Open keyboard').click();
      await p.locator('.vol-osk').waitFor();
    },
  ],
  [
    'osk-shift',
    'Ekran klavyesi — büyük harf',
    async (p) => {
      await selectTab(p, 'forms');
      await byName(p, 'Open keyboard').click();
      await p.locator('.vol-osk').waitFor();
      await p.locator('.vol-osk__key[data-action="shift"]').click();
    },
  ],
  [
    'osk-symbols',
    'Ekran klavyesi — semboller',
    async (p) => {
      await selectTab(p, 'forms');
      await byName(p, 'Open keyboard').click();
      await p.locator('.vol-osk').waitFor();
      await p.locator('.vol-osk__key[data-action="symbols"]').click();
    },
  ],
  [
    'osk-turkish',
    'Ekran klavyesi — Türkçe düzen',
    async (p) => {
      await selectTab(p, 'forms');
      await byName(p, 'Open keyboard').click();
      await p.locator('.vol-osk').waitFor();
      await p.locator('.vol-osk__key[data-action="layout"]').click();
    },
  ],
  [
    'level-up',
    'Seviye seçici',
    async (p) => {
      await selectTab(p, 'cards');
      await p.getByRole('button', { name: /open level-up/i }).click();
    },
    async (p) => {
      await p.locator('.vol-card__action').first().click();
    },
  ],
  [
    'shop',
    'Mağaza seçici',
    async (p) => {
      await selectTab(p, 'cards');
      await p.getByRole('button', { name: /open shop/i }).click();
    },
  ],
  [
    'dialogue',
    'Diyalog (seçimli)',
    async (p) => {
      await selectTab(p, 'advanced');
      await byName(p, 'Start Dialogue').click();
      await sleep(2500);
      await p.locator('.vol-dialogue').click();
      await sleep(2500);
    },
  ],
  [
    'command-palette',
    'Komut paleti',
    async (p) => {
      await selectTab(p, 'advanced');
      await byName(p, 'Command Palette').click();
      await p.keyboard.type('set');
    },
  ],
  [
    'rich-tooltip',
    'Zengin ipucu',
    async (p) => {
      await selectTab(p, 'advanced');
      await p.getByText('Flame Sword').hover();
      await sleep(700);
    },
  ],
  [
    'radial-menu',
    'Radyal menü (klavye)',
    async (p) => {
      await selectTab(p, 'touch');
      await p.getByRole('button', { name: /open with keys/i }).click();
    },
  ],
  [
    'charge-button',
    'Şarj düğmesi (dolum sürerken)',
    async (p) => {
      await selectTab(p, 'touch');
      const b = p.locator('.vol-charge-button').first();
      await b.scrollIntoViewIfNeeded();
      await b.focus();
      await p.keyboard.down('Space');
      await sleep(600);
    },
    async (p) => {
      await p.keyboard.up('Space');
    },
  ],
  [
    'loading-bar',
    'Yükleme ekranı · çelik plaka (çubuk)',
    async (p) => {
      await selectTab(p, 'loading');
      await p
        .getByRole('button', { name: /Full Screen Preview/ })
        .first()
        .click();
      await sleep(1100);
    },
  ],
  ...[
    ['orbital', 'Halkalar', 1],
    ['energy', 'Enerji çekirdeği', 2],
    ['particle', 'Parçacık yörüngesi', 3],
    ['hexagon', 'Altıgen', 4],
  ].map(([id, title, clicks]) => [
    `loading-${id}`,
    `Yükleme ekranı · süs göstergesi: ${title}`,
    async (p) => {
      await selectTab(p, 'loading');
      const cycle = p
        .locator('[role="tabpanel"]:not([aria-hidden="true"]) .vol-showcase-panel-demo button')
        .first();
      for (let k = 0; k < clicks; k += 1) await cycle.evaluate((e) => e.click());
      await p
        .getByRole('button', { name: /Full Screen Preview/ })
        .first()
        .click();
      await sleep(1100);
    },
  ]),
  [
    'loading-stages',
    'Yükleme ekranı · aşama + ipucu',
    async (p) => {
      await selectTab(p, 'loading');
      await p
        .getByRole('button', { name: /Preview full flow/ })
        .first()
        .click();
      await sleep(1700);
    },
  ],
  [
    'loading-stall',
    'Yükleme ekranı · takılma bildirimi',
    async (p) => {
      await selectTab(p, 'loading');
      await p
        .getByRole('button', { name: /Preview full flow/ })
        .first()
        .click();
      await sleep(4200);
    },
  ],
  [
    'loading-failed',
    'Yükleme ekranı · hata, Tekrar dene / Vazgeç',
    async (p) => {
      await selectTab(p, 'loading');
      await p
        .getByRole('button', { name: /Simulate failed loading/ })
        .first()
        .click();
      await p.locator('.vol-loading [role="alert"]').waitFor({ timeout: 10_000 });
    },
  ],
];

try {
  for (const skin of SKINS) {
    const { context, page } = await openPage();
    await setSkin(page, skin.id);
    if (only !== 'layers') {
      for (const tab of TABS) {
        await selectTab(page, tab);
        await cardStates(page, tab, skin.id);
      }
    }
    for (const [id, title, setup] of LAYERS) {
      // Her katman taze sayfada çekilir: önceki kartların bıraktığı durum örtü bırakmaz.
      await page.goto(base);
      await page.evaluate(() => globalThis.document.fonts.ready);
      await page.waitForSelector('[role="tablist"]');
      await page.addStyleTag({ content: STILL });
      await setSkin(page, skin.id);
      await layerShot(
        page,
        id,
        title,
        skin.id,
        async (p) => {
          try {
            await setup(p);
          } catch (error) {
            console.warn(`[katman] ${id}: ${String(error).slice(0, 120)}`);
            return false;
          }
          return true;
        },
        async () => undefined,
      );
    }
    await context.close();
  }
} finally {
  writeFileSync(resolve(out, 'index.json'), JSON.stringify(index, null, 2));
  await browser.close();
  server.kill();
}
console.log(`\nGaleri: ${out} (${index.cards.length} kart, ${index.layers.length} katman)`);
