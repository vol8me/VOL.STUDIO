import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { APP_URL, OUT_DIR, expect, test } from './device';
import { centerOf, gesture, release, tap, tapAt } from './touch';

/**
 * GERÇEK CİHAZ: ActionBar / BuildMenu / SkillTree / SlotGrid dokunma eşdeğerleri (UI-08.3). Android Chrome'da gerçek dokunma
 * (CDP `Input.dispatchTouchEvent`, pointerType: touch): bekleyen / nedenli kullanılamaz / kilitli öğeye dokunmak `reject`
 * verir, uzun basış (hover yok) nedeni balonla söyler ve o basışın tıklamasını yutar, hedefler ≥ 44 px, SlotGrid öğesi
 * "Taşı" + hücreye dokun ile ve parmakla sürükleyerek taşınır (tek `drop`, ardından ikinci `press` yok). Niyetler karttaki
 * "niyet sondası"ndan (`data-probe="intents"`, `data-log`) okunur. Cihaz dili Türkçe ya da İngilizce olabilir; metinler iki
 * dilde eşleşir. İnsan işitme/ekran okuyucu kabulü bu kaydın dışındadır (UI-13.4).
 */
const serial = process.env.VOL_DEVICE_SERIAL;
const TAB_PANEL = '[role="tabpanel"]:not([aria-hidden="true"])';
const MIN_TARGET = 43.5;
/** `LONG_PRESS_MS` (450 ms) + cihaz zamanlayıcı payı. */
const HOLD_MS = 700;
/** CDP dokunuşunun gecikmiş uyumluluk tıklaması için pay (bkz. `tapAt`). */
const CLICK_SETTLE_MS = 400;

function save(name: string, document: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(document, null, 2)}\n`);
}

function shot(name: string): void {
  try {
    const png = execFileSync(
      process.env.ADB ?? 'adb',
      [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(resolve(OUT_DIR, name), png);
  } catch {
    /* ekran görüntüsü kanıtın eki; alınamazsa koşu durmaz */
  }
}

async function open(page: Page, tab: 'hud' | 'touch' | 'advanced'): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('[role="tablist"]', { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await tap(page, page.locator(`[role="tab"][id$="-tab-${tab}"]`));
  await page
    .locator(`[role="tabpanel"][id$="-panel-${tab}"]:not([aria-hidden="true"])`)
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

const cardOf = (page: Page, inner: string): Locator =>
  page
    .locator(`${TAB_PANEL} .vol-showcase-card`)
    .filter({ has: page.locator(inner) })
    .first();
const probe = (card: Locator): Locator => card.locator('[data-probe="intents"]');
const log = async (card: Locator): Promise<string> =>
  (await probe(card).getAttribute('data-log')) ?? '';
const visibleBubble = (page: Page): Locator =>
  page.locator('[role="tooltip"].vol-tooltip--visible, .vol-rich-tooltip--visible');

/** Parmağı hedefin üstünde `ms` kadar basılı tutar ve kaldırır (uzun basış). */
async function longPress(page: Page, target: Locator, ms = HOLD_MS): Promise<void> {
  const point = await centerOf(target);
  const session = await gesture(page, [{ from: point, to: point }], 1, true);
  await page.waitForTimeout(ms);
  await release(session);
  // Bırakışın (yutulması gereken) uyumluluk tıklaması gecikmeli gelir: sonraki işlemden önce gelsin.
  await page.waitForTimeout(CLICK_SETTLE_MS);
}

async function size(target: Locator): Promise<{ width: number; height: number }> {
  const box = (await target.boundingBox())!;
  return { width: box.width, height: box.height };
}

/**
 * Düğüm görünüm penceresinin dışına taşıyorsa (ağaç dar pencereye sığmaz: dikey tablette sol dal kırpılır) ağacı boş bir
 * noktadan GERÇEK parmakla sürükleyip düğümü pencerenin ortasına getirir. Kaydırma da kabul edilen davranışın parçasıdır.
 */
async function reveal(page: Page, card: Locator, node: Locator): Promise<void> {
  const viewport = card.locator('.vol-skill-tree__viewport');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await viewport.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const view = (await viewport.boundingBox())!;
    const box = (await node.boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const inside =
      centerX >= view.x + 8 &&
      centerX <= view.x + view.width - 8 &&
      centerY >= view.y + 8 &&
      centerY <= view.y + view.height - 8;
    if (inside) return;
    const deltaX = view.x + view.width / 2 - centerX;
    const deltaY = view.y + view.height / 2 - centerY;
    // Sol üst köşe boştur (kök ortada, denetim düğmeleri sağ üstte): sürükleme düğme/düğüm basışıyla çakışmaz.
    const from = { x: view.x + 10, y: view.y + 10 };
    const to = {
      x: Math.min(Math.max(from.x + deltaX, view.x + 4), view.x + view.width - 4),
      y: Math.min(Math.max(from.y + deltaY, view.y + 4), view.y + view.height - 4),
    };
    await gesture(page, [{ from, to }], 12);
    await page.waitForTimeout(250);
  }
  throw new Error('düğüm parmakla kaydırılarak görünüm penceresine getirilemedi');
}

const LOW = /^(Low|Düşük)$/;
const ENOUGH = /^(Enough|Yeterli)$/;
const PLENTY = /^(Plenty|Bol)$/;
const NO_MANA = /Not enough mana|Yetersiz mana/;
const NO_GOLD = /Not enough Gold|Yetersiz Altın|Yetersiz Gold/;
const REQUIRES = /Requires: Sword Mastery|Gerekli: Kılıç Ustalığı/;

test('cihaz: ActionBar bekleyen slot dokunuşla reject verir; uzun basış nedeni balonla söyler ve eylemi çalıştırmaz; hedef ≥ 44 px', async ({
  device: page,
}) => {
  await open(page, 'touch');
  const card = cardOf(page, '.vol-action-bar');
  const slots = card.locator('.vol-action-bar__slot');
  await expect(slots).toHaveCount(3);

  const sizes = [];
  for (let i = 0; i < 3; i += 1) sizes.push(await size(slots.nth(i)));
  for (const s of sizes) {
    expect(s.width, 'slot genişliği (kaba işaretçi)').toBeGreaterThanOrEqual(MIN_TARGET);
    expect(s.height, 'slot yüksekliği (kaba işaretçi)').toBeGreaterThanOrEqual(MIN_TARGET);
  }

  // Kısa dokunuş: ilk dokunuş eylemdir (bekleme başlar), bekleme sürerken ikincisi reddedilir.
  const tower = slots.nth(0);
  await tap(page, tower);
  await expect.poll(() => log(card)).toMatch(/press:ActionBar$/);
  await expect(tower).toHaveAttribute('aria-disabled', 'true');
  await tap(page, tower);
  await expect.poll(() => log(card)).toMatch(/press:ActionBar reject:ActionBar$/);

  // Mana düşük: dalga nedenli kullanılamaz. Uzun basış balonu açar; o basışın tıklaması reject/press üretmez.
  await tap(page, card.getByRole('radio', { name: LOW }));
  const wave = slots.nth(1);
  await expect(wave).toHaveAttribute('aria-disabled', 'true');
  const before = await log(card);
  await longPress(page, wave);
  await expect(visibleBubble(page)).toContainText(NO_MANA);
  expect(await log(card), 'uzun basış bir eylem/reject üretmemeli').toBe(before);
  shot('hudInteraction-actionbar-bubble.png');

  // Parmak kalktıktan sonra balon kalır (dokunmada hover yok); başka yere dokunmak kapatır.
  await expect(visibleBubble(page)).toBeVisible();
  await tap(page, probe(card));
  await expect(visibleBubble(page)).toHaveCount(0);

  // Kısa dokunuş nedenli kullanılamaz slotta hâlâ reject verir; mana dönünce çalışır.
  await tap(page, wave);
  await expect.poll(() => log(card)).toMatch(/reject:ActionBar$/);
  await tap(page, card.getByRole('radio', { name: ENOUGH }));
  await expect(wave).not.toHaveAttribute('aria-disabled', 'true');
  await tap(page, wave);
  await expect.poll(() => log(card)).toMatch(/press:ActionBar$/);

  save('hudInteraction-actionbar.json', { sizes, finalLog: await log(card) });
});

test('cihaz: BuildMenu yetersiz kaynaklı bina reject verir, uzun basış nedeni söyler; bol kaynakta seçilir ve zemine dokunmak yerleştirir', async ({
  device: page,
}) => {
  await open(page, 'hud');
  const card = cardOf(page, '.vol-build-menu');
  const items = card.locator('.vol-build-menu__item');
  const cannon = card.locator('.vol-build-menu__item[data-item-id="cannon"]');
  const turret = card.locator('.vol-build-menu__item[data-item-id="turret"]');
  await cannon.scrollIntoViewIfNeeded();

  const count = await items.count();
  const sizes = [];
  for (let i = 0; i < count; i += 1) sizes.push(await size(items.nth(i)));
  for (const s of sizes) {
    expect(s.width, 'bina düğmesi genişliği').toBeGreaterThanOrEqual(MIN_TARGET);
    expect(s.height, 'bina düğmesi yüksekliği').toBeGreaterThanOrEqual(MIN_TARGET);
  }

  await expect(cannon).toHaveAttribute('aria-disabled', 'true');
  await tap(page, cannon);
  await expect.poll(() => log(card)).toMatch(/reject:BuildMenu$/);
  await expect(cannon).toHaveAttribute('aria-pressed', 'false');

  const before = await log(card);
  await longPress(page, cannon);
  await expect(visibleBubble(page)).toContainText(NO_GOLD);
  expect(await log(card), 'uzun basış seçim/reject üretmemeli').toBe(before);
  shot('hudInteraction-buildmenu-bubble.png');
  // Balon dokunuşu yutmaz (kaba işaretçi): boş bir noktaya (niyet sondası) dokunmak kapatır; bina düğmesine dokunmak seçerdi.
  await tap(page, probe(card));
  await expect(visibleBubble(page)).toHaveCount(0);

  // Bol kaynak: seçim tek `select`; zemine dokunmak yerleştirir ve seçimi bırakır, suya dokunmak engellenir.
  await tap(page, card.getByRole('radio', { name: PLENTY }));
  await expect(turret).not.toHaveAttribute('aria-disabled', 'true');
  await tap(page, turret);
  await expect(turret).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => log(card)).toMatch(/select:BuildMenu$/);

  const arena = card.locator('[data-arena="build"]');
  const water = arena.locator('[data-ctx="blocked"]');
  const readout = card.locator('[data-probe="build-cursor"]');

  // Suya dokunmak engellenir: seçim korunur ve neden söylenir.
  await tap(page, water);
  await expect(card.getByText(/Cannot build on water|Suya inşa edilemez/)).toBeVisible();
  await expect(turret).toHaveAttribute('aria-pressed', 'true');

  // Zemine (arenanın suyla örtüşmeyen sol kısmı) dokunmak yerleştirir ve seçimi bırakır.
  await centerOf(arena);
  const box = (await arena.boundingBox())!;
  const ground = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 };
  const hit = await arena.evaluate(
    (element, at) => document.elementFromPoint(at.x, at.y) === element,
    ground,
  );
  expect(hit, 'zemin noktasında arena durmalı (su/örtü değil)').toBe(true);
  await tapAt(page, ground);
  await expect(turret).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByText(/placed\.|yerleştirildi\./)).toBeVisible();
  await expect(readout).toHaveAttribute('data-value', /^idle\//);

  save('hudInteraction-buildmenu.json', { sizes, finalLog: await log(card) });
});

test('cihaz: SlotGrid öğesi "Taşı" + hücreye dokunarak taşınır (tek drop, ikinci press yok); parmakla sürükleme pick + drop verir; hücre ≥ 44 px', async ({
  device: page,
}) => {
  await open(page, 'touch');
  const card = cardOf(page, '.vol-slot-grid');
  await card.scrollIntoViewIfNeeded();
  const slot = (index: number): Locator =>
    card.locator(`.vol-slot-grid__item[data-slot-index="${index}"]`);
  const cell = (index: number): Locator =>
    card.locator(`.vol-slot-grid__cell[data-slot-index="${index}"]`);
  const move = card.locator('[data-action="slot-move"]');

  const cellSize = await size(cell(16));
  expect(cellSize.width, 'hücre genişliği').toBeGreaterThanOrEqual(MIN_TARGET);
  expect(cellSize.height, 'hücre yüksekliği').toBeGreaterThanOrEqual(MIN_TARGET);
  const moveSize = await size(move);
  expect(moveSize.height, 'Taşı düğmesi yüksekliği').toBeGreaterThanOrEqual(MIN_TARGET);

  await expect(move).toBeDisabled();
  await tap(page, slot(0));
  await expect(move).toBeEnabled();
  await tap(page, move);
  await expect(slot(0)).toHaveAttribute('aria-pressed', 'true');
  await tap(page, cell(16));
  await expect(slot(16)).toHaveCount(1);
  await expect(slot(0)).toHaveCount(0);
  const tapLog = await log(card);
  expect(tapLog, 'dokun-yerleştir tek drop üretir').toMatch(/drop:SlotGrid$/);
  expect(tapLog, 'bırakışın tıklaması ikinci niyet üretmez').not.toMatch(/drop:SlotGrid press/);
  shot('hudInteraction-slotgrid-tap.png');

  // Parmakla sürükleme: pick + drop; sürükleme sonrası gelen click ikinci bir press üretmez.
  await open(page, 'touch');
  const card2 = cardOf(page, '.vol-slot-grid');
  await card2.scrollIntoViewIfNeeded();
  // `centerOf` hedefi görünümün ortasına getirir: kaynak, hedeften SONRA ölçülür ki iki koordinat aynı kaydırma durumunu paylaşsın.
  const from = await centerOf(card2.locator('.vol-slot-grid__item[data-slot-index="0"]'));
  const target = await card2.locator('.vol-slot-grid__cell[data-slot-index="14"]').boundingBox();
  await gesture(
    page,
    [{ from, to: { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 } }],
    14,
  );
  await page.waitForTimeout(300);
  const dragLog = await log(card2);
  save('hudInteraction-slotgrid.json', { cellSize, moveSize, tapLog, dragLog });
  expect(dragLog, 'parmakla sürükleme pick + drop verir').toMatch(/pick:SlotGrid drop:SlotGrid$/);
  expect(dragLog).not.toMatch(/press/);
});

test('cihaz: SkillTree kilitli düğüme dokunmak reject + önkoşul notlu balon verir; açılabilir düğüm tek press; düğüm ve görünüm düğmeleri ≥ 44 px', async ({
  device: page,
}) => {
  await open(page, 'advanced');
  const card = cardOf(page, '.vol-skill-tree');
  await card.scrollIntoViewIfNeeded();
  const node = (id: string): Locator => card.locator(`.vol-skill-tree__node[data-node-id="${id}"]`);

  const nodeSize = await size(node('atk1'));
  expect(nodeSize.height, 'düğüm yüksekliği').toBeGreaterThanOrEqual(MIN_TARGET);
  const controls = card.locator('.vol-skill-tree__controls button');
  const controlCount = await controls.count();
  expect(controlCount, 'görünüm düğmeleri (yakınlaştır/uzaklaştır/sıfırla)').toBe(3);
  const controlSizes = [];
  for (let i = 0; i < controlCount; i += 1) controlSizes.push(await size(controls.nth(i)));
  for (const s of controlSizes) {
    expect(s.width, 'görünüm düğmesi genişliği').toBeGreaterThanOrEqual(MIN_TARGET);
    expect(s.height, 'görünüm düğmesi yüksekliği').toBeGreaterThanOrEqual(MIN_TARGET);
  }

  // Kilitli düğüm: kısa dokunuş reject + balon (neden); puan değişmez.
  const locked = node('atk2');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  const before = await card
    .locator('.vol-skill-tree__canvas')
    .evaluate((el) => (el as HTMLElement).style.transform);
  await reveal(page, card, locked);
  const after = await card
    .locator('.vol-skill-tree__canvas')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const panned = before !== after;
  await tap(page, locked);
  await expect.poll(() => log(card)).toMatch(/reject:SkillTree$/);
  await expect(visibleBubble(page)).toContainText(REQUIRES);
  shot('hudInteraction-skilltree-locked.png');

  // Açılabilir düğüm: tek press ve açılır.
  await reveal(page, card, node('atk1'));
  await tap(page, node('atk1'));
  await expect.poll(() => log(card)).toMatch(/reject:SkillTree press:SkillTree$/);
  await expect(node('atk1')).toHaveAttribute('aria-label', /unlocked|açık/i);

  // Yakınlaştır düğmesi gerçek dokunuşla ölçeği büyütür (iki parmaklı kıstırma tek yol değildir).
  const canvas = card.locator('.vol-skill-tree__canvas');
  const zoomIn = controls.nth(0);
  await tap(page, zoomIn);
  await expect(canvas).toHaveCSS('transform', /matrix\(1\.1/);

  save('hudInteraction-skilltree.json', {
    nodeSize,
    controlSizes,
    panned,
    finalLog: await log(card),
  });
});
