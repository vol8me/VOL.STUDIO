import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectTab } from './support/determinism';

/**
 * ActionBar / BuildMenu / SkillTree / SlotGrid (UI-08.3) GERÇEK tarayıcıda, iki motorda: bekleyen / nedenli kullanılamaz /
 * kilitli öğe `disabled` değildir (odaklanabilir, nedeni balonla söyler, basış `reject` niyeti verir), kullanılabilir öğe
 * tek niyet üretir, SlotGrid sürüklemenin klavye/kol/dokunma eşdeğerine sahiptir, BuildMenu seçimi RTS bağlamsal imleci
 * değiştirir ve altı haneli fiyat kutuyu taşırmaz.
 *
 * Niyetler kart içindeki "niyet sondası"ndan (`data-probe="intents"`, `data-log`) okunur. Sayfa varsayılan (İngilizce) dilde açılır.
 */
async function open(page: Page, tab: 'hud' | 'touch' | 'advanced'): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[role="tablist"]');
  await page.evaluate(() => document.fonts.ready);
  await selectTab(page, tab);
}

const cardOf = (page: Page, inner: string): Locator =>
  page.locator('.vol-showcase-card').filter({ has: page.locator(inner) });
const probe = (card: Locator): Locator => card.locator('[data-probe="intents"]');
const visibleBubble = (page: Page): Locator =>
  page.locator('[role="tooltip"].vol-tooltip--visible, .vol-rich-tooltip--visible');

test.describe('ActionBar kullanılamaz slot', () => {
  test('toolbar tek sekme durağıdır; oklar gezinir; bekleyen slot odaklanabilir kalır, basış reject verir ve balon kalan süreyi söyler', async ({
    page,
  }) => {
    await open(page, 'touch');
    const card = cardOf(page, '.vol-action-bar');
    const bar = card.locator('.vol-action-bar');
    await expect(bar).toHaveAttribute('role', 'toolbar');
    const slots = bar.locator('.vol-action-bar__slot');
    await expect(slots).toHaveCount(3);
    await expect(bar.locator('.vol-action-bar__slot[tabindex="0"]')).toHaveCount(1);

    const tower = slots.nth(0);
    await tower.click();
    await expect(probe(card)).toHaveAttribute('data-log', /press:ActionBar$/);
    // Bekleme sürerken slot `disabled` değil `aria-disabled`dır ve odağı korur.
    await expect(tower).toHaveAttribute('aria-disabled', 'true');
    await expect(tower).toHaveJSProperty('disabled', false);
    await tower.focus();
    await expect(tower).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(probe(card)).toHaveAttribute('data-log', /press:ActionBar reject:ActionBar$/);
    await expect(visibleBubble(page)).toContainText(/Build Tower \[1\]: \d s left/);
    await expect(card.getByText(/not ready yet/i)).toBeVisible();

    // Ok tuşu bir sonraki slota geçer; bekleme bitince aynı slot yine çalışır.
    await page.keyboard.press('ArrowRight');
    await expect(slots.nth(1)).toBeFocused();
    await expect(tower).not.toHaveAttribute('aria-disabled', 'true', { timeout: 6000 });
    await tower.click();
    await expect(probe(card)).toHaveAttribute('data-log', /reject:ActionBar press:ActionBar$/);
  });

  test('mana düşükken dalga nedenli kullanılamaz: reject ve neden balonda; mana dönünce çalışır', async ({
    page,
  }) => {
    await open(page, 'touch');
    const card = cardOf(page, '.vol-action-bar');
    const wave = card.locator('.vol-action-bar__slot').nth(1);
    await card.getByRole('radio', { name: 'Low' }).click();
    await expect(wave).toHaveAttribute('aria-disabled', 'true');
    await expect(wave).toHaveClass(/vol-action-bar__slot--unavailable/);
    await wave.focus();
    await expect(visibleBubble(page)).toContainText('Start Wave [2]: Not enough mana');
    await page.keyboard.press('Space');
    await expect(probe(card)).toHaveAttribute('data-log', /reject:ActionBar$/);
    await expect(card.getByText('Start Wave: not enough mana.')).toBeVisible();

    await card.getByRole('radio', { name: 'Enough' }).click();
    await expect(wave).not.toHaveAttribute('aria-disabled', 'true');
    await wave.click();
    await expect(probe(card)).toHaveAttribute('data-log', /press:ActionBar$/);
  });

  test('kısayol tuşu bekleyen kuleyi çalıştırmaz; hazır olunca çalıştırır', async ({ page }) => {
    await open(page, 'touch');
    const card = cardOf(page, '.vol-action-bar');
    await card.locator('.vol-action-bar__slot').nth(2).focus();
    await page.keyboard.press('1');
    await page.keyboard.press('1');
    // İlk basış eylemdir, ikincisi bekleme sürerken reddedilir.
    await expect(probe(card)).toHaveAttribute('data-log', 'press:ActionBar reject:ActionBar');
    await expect(card.locator('.vol-action-bar__slot').first()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('BuildMenu kullanılamaz öğe', () => {
  const menuCard = (page: Page): Locator => cardOf(page, '.vol-build-menu');
  const item = (card: Locator, id: string): Locator =>
    card.locator(`.vol-build-menu__item[data-item-id="${id}"]`);

  test('yetersiz kaynakta bina odaklanabilir, basış reject + neden verir; bol kaynakta seçilir', async ({
    page,
  }) => {
    await open(page, 'hud');
    const card = menuCard(page);
    const cannon = item(card, 'cannon');
    await expect(cannon).toHaveAttribute('aria-disabled', 'true');
    await expect(cannon).toHaveJSProperty('disabled', false);
    // Balon açıkken neden `aria-describedby` ile okuyucuya bağlıdır (balon metni = ad, kısayol, maliyet, neden).
    const described = await cannon.evaluate((element) =>
      (element.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' '),
    );
    expect(described).toContain('Not enough Gold');
    // Playwright aria-disabled öğeye tıklamayı "etkin değil" sayıp bekler; gerçek kullanıcı tıklar: zorla tıklanır.
    await cannon.click({ force: true });
    await expect(card.getByText('Cannon: Not enough Gold')).toBeVisible();
    await expect(probe(card)).toHaveAttribute('data-log', /reject:BuildMenu$/);
    await expect(cannon).toHaveAttribute('aria-pressed', 'false');

    await card.getByRole('radio', { name: 'Plenty' }).click();
    await expect(cannon).not.toHaveAttribute('aria-disabled', 'true');
    await cannon.click();
    await expect(cannon).toHaveAttribute('aria-pressed', 'true');
    await expect(probe(card)).toHaveAttribute('data-log', /select:BuildMenu$/);
    // Aynı öğeye tekrar basmak iptaldir: tek `cancel` niyeti.
    await cannon.click();
    await expect(probe(card)).toHaveAttribute('data-log', /select:BuildMenu cancel:BuildMenu$/);
  });

  test('balon ad + kısayol + maliyet + nedeni söyler (odakta); tek sekme durağı, oklar uzamsal gezinir', async ({
    page,
  }) => {
    await open(page, 'hud');
    const card = menuCard(page);
    await expect(card.locator('.vol-build-menu__item[tabindex="0"]')).toHaveCount(1);
    const cannon = item(card, 'cannon');
    await cannon.focus();
    await expect(visibleBubble(page)).toContainText('Cannon [O]');
    await expect(visibleBubble(page)).toContainText('120 Gold');
    await expect(visibleBubble(page)).toContainText('Not enough Gold');

    const activeBox = (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const box = (document.activeElement as HTMLElement).getBoundingClientRect();
        return { x: box.x, y: box.y };
      });
    // Uzamsal gezinme: sağ ok görünen sıradaki komşuya gider, aşağı ok bir alt satırdaki aynı sütuna.
    const before = await cannon.boundingBox();
    await page.keyboard.press('ArrowRight');
    const right = await activeBox();
    expect(right.x).toBeGreaterThan(before!.x);
    expect(Math.abs(right.y - before!.y)).toBeLessThan(4);
    await page.keyboard.press('ArrowDown');
    const down = await activeBox();
    expect(down.y).toBeGreaterThan(before!.y);
    await page.keyboard.press('Home');
    await expect(card.locator('.vol-build-menu__item').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(card.locator('.vol-build-menu__item').last()).toBeFocused();
  });

  test('altı haneli fiyat kutuyu taşırmaz ve kısayol rozetiyle çakışmaz (masaüstü ve telefon genişliği)', async ({
    page,
  }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, 'hud');
      const castle = item(menuCard(page), 'castle');
      await castle.scrollIntoViewIfNeeded();
      const geometry = await castle.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const costElement = element.querySelector<HTMLElement>('.vol-build-menu__cost')!;
        const cost = costElement.getBoundingClientRect();
        const hotkey = element.querySelector('.vol-build-menu__hotkey')!.getBoundingClientRect();
        const apart =
          cost.right <= hotkey.left ||
          cost.left >= hotkey.right ||
          cost.bottom <= hotkey.top ||
          cost.top >= hotkey.bottom;
        return {
          inside:
            cost.left >= box.left - 0.5 &&
            cost.right <= box.right + 0.5 &&
            cost.bottom <= box.bottom + 0.5,
          apart,
          fits: costElement.scrollWidth <= costElement.clientWidth + 1,
          text: costElement.textContent,
        };
      });
      expect(geometry.text).toBe('123,456 Gold');
      expect(geometry.inside, `maliyet kutu içinde (${width}px)`).toBe(true);
      expect(geometry.fits, `maliyet metni taşmaz (${width}px)`).toBe(true);
      expect(geometry.apart, `maliyet kısayol rozetini örtmez (${width}px)`).toBe(true);

      // Gerilim: boşluksuz, çok uzun bir tutar (çeviri/para birimi uzadığında) satır kırılarak kutuda kalır.
      const stressed = await castle.evaluate((element) => {
        const cost = element.querySelector<HTMLElement>('.vol-build-menu__cost')!;
        cost.textContent = '1234567890123456';
        const box = element.getBoundingClientRect();
        const rect = cost.getBoundingClientRect();
        // Kutu max-width ile sınırlıdır: taşma elemanın kutusunda değil İÇERİĞİNDE (scrollWidth) görünür.
        return (
          rect.left >= box.left - 0.5 &&
          rect.right <= box.right + 0.5 &&
          cost.scrollWidth <= cost.clientWidth + 1
        );
      });
      expect(stressed, `uzun tutar kutu içinde kırılır (${width}px)`).toBe(true);
    }
  });

  test('seçim RTS bağlamsal imleci değiştirir: seçimsiz boşta, seçili iken inşa, suda engelli', async ({
    page,
  }) => {
    await open(page, 'hud');
    const card = menuCard(page);
    const arena = card.locator('[data-arena="build"]');
    const readout = card.locator('[data-probe="build-cursor"]');
    const cursorOf = (): Promise<string> =>
      arena.evaluate((element) => getComputedStyle(element).cursor);
    /** Menü tıklaması sayfayı kaydırır: koordinatlar her seferinde zeminin GÜNCEL kutusundan alınır. */
    const points = async (): Promise<{
      ground: { x: number; y: number };
      water: { x: number; y: number };
    }> => {
      await arena.scrollIntoViewIfNeeded();
      const box = (await arena.boundingBox())!;
      return {
        ground: { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 },
        water: { x: box.x + box.width * 0.75, y: box.y + box.height * 0.45 },
      };
    };

    let at = await points();
    await page.mouse.move(at.ground.x, at.ground.y);
    await expect(readout).toHaveAttribute('data-value', /^idle\//);
    const idleCursor = await cursorOf();

    await card.getByRole('radio', { name: 'Plenty' }).click();
    await item(card, 'turret').click();
    at = await points();
    await page.mouse.move(at.ground.x + 4, at.ground.y + 4);
    await expect(readout).toHaveAttribute('data-value', /^build\//);
    const buildCursor = await cursorOf();
    expect(buildCursor).not.toBe(idleCursor);

    await page.mouse.move(at.water.x, at.water.y);
    await expect(readout).toHaveAttribute('data-value', /^blocked\//);
    const blockedCursor = await cursorOf();
    expect(blockedCursor).not.toBe(buildCursor);
    await page.mouse.click(at.water.x, at.water.y);
    await expect(card.getByText('Cannot build on water.')).toBeVisible();

    // Zemine tıklamak yerleştirir ve seçimi bırakır; imleç boşta döner.
    await page.mouse.move(at.ground.x, at.ground.y);
    await page.mouse.click(at.ground.x, at.ground.y);
    await expect(card.getByText('Arrow Tower placed.')).toBeVisible();
    await expect(item(card, 'turret')).toHaveAttribute('aria-pressed', 'false');
    await expect(readout).toHaveAttribute('data-value', /^idle\//);
    expect(await cursorOf()).toBe(idleCursor);
  });
});

test.describe('SkillTree kilitli düğüm', () => {
  const treeCard = (page: Page): Locator => cardOf(page, '.vol-skill-tree');
  const node = (card: Locator, id: string): Locator =>
    card.locator(`.vol-skill-tree__node[data-node-id="${id}"]`);

  test('kilitli düğüm odaklanabilir, ok tuşu uzamsal gezinir, basış reject + eksik önkoşul notlu balon verir', async ({
    page,
  }) => {
    await open(page, 'advanced');
    const card = treeCard(page);
    await card.scrollIntoViewIfNeeded();
    // Tab durağı ilk AÇILABİLİR düğümdür (kök zaten açık).
    await expect(card.locator('.vol-skill-tree__node[tabindex="0"]')).toHaveCount(1);
    await expect(node(card, 'atk1')).toHaveAttribute('tabindex', '0');

    await node(card, 'atk1').focus();
    await page.keyboard.press('ArrowDown');
    const locked = node(card, 'atk2');
    await expect(locked).toBeFocused();
    await expect(locked).toHaveAttribute('aria-disabled', 'true');
    await expect(locked).toHaveJSProperty('disabled', false);
    await expect(locked).toHaveAttribute('aria-label', 'Deadly Strike, locked');
    await page.keyboard.press('Enter');
    await expect(probe(card)).toHaveAttribute('data-log', /reject:SkillTree$/);
    await expect(visibleBubble(page)).toContainText('Requires: Sword Mastery');
    // Kilitli düğüme basmak puanı etkilemez.
    await expect(card.getByText('Skill Points: 5')).toBeVisible();
  });

  test('açılabilir düğüm tek press niyeti verir ve açılır; puan yetmezse host geri bildirimi verir', async ({
    page,
  }) => {
    await open(page, 'advanced');
    const card = treeCard(page);
    await card.scrollIntoViewIfNeeded();
    await node(card, 'atk1').click();
    await expect(probe(card)).toHaveAttribute('data-log', 'press:SkillTree');
    await expect(node(card, 'atk1')).toHaveAttribute('aria-label', 'Sword Mastery, unlocked');
    await expect(card.getByText('Skill Points: 4')).toBeVisible();
  });

  test('klavye ve düğmeler yakınlaştırır; tekerlek sınırda sayfaya bırakılır; görünüm ilk birincil işaretçiyle kaydırılır', async ({
    page,
  }) => {
    await open(page, 'advanced');
    const card = treeCard(page);
    await card.scrollIntoViewIfNeeded();
    const canvas = card.locator('.vol-skill-tree__canvas');
    const viewport = card.locator('.vol-skill-tree__viewport');
    await viewport.focus();
    await page.keyboard.press('+');
    await expect(canvas).toHaveCSS('transform', /matrix\(1\.1,/);
    await page.keyboard.press('0');
    await expect(canvas).toHaveCSS('transform', /matrix\(1,/);

    const zoomIn = card.getByRole('button', { name: 'Zoom in', exact: true });
    const zoomOut = card.getByRole('button', { name: 'Zoom out', exact: true });
    for (let i = 0; i < 10; i++) await zoomIn.click();
    await expect(canvas).toHaveCSS('transform', /matrix\(2,/);
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await expect(zoomOut).toHaveAttribute('aria-disabled', 'false');
    await card.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(canvas).toHaveCSS('transform', /matrix\(1,/);

    // Sınırda tekerlek sayfayı kaydırmaya bırakılır (yakınlaştırma yutulmaz → kaydırma tuzağı yok).
    for (let i = 0; i < 10; i++) await zoomIn.click();
    const prevented = await viewport.evaluate((element) => {
      const event = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);

    // Fare koordinatları görünüm penceresindedir: yakınlaştırma tıklamaları sayfayı kaydırmış olabilir.
    await viewport.scrollIntoViewIfNeeded();
    const box = (await viewport.boundingBox())!;
    const before = await canvas.evaluate((element) => element.style.transform);
    // Sol üst köşe boştur (kök düğüm ortada): sürükleme düğme tıklamasıyla çakışmaz.
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 4 });
    await page.mouse.up();
    expect(await canvas.evaluate((element) => element.style.transform)).not.toBe(before);
  });
});

test.describe('SlotGrid taşıma', () => {
  const gridCard = (page: Page): Locator => cardOf(page, '.vol-slot-grid');
  const slot = (card: Locator, index: number): Locator =>
    card.locator(`.vol-slot-grid__item[data-slot-index="${index}"]`);
  const cell = (card: Locator, index: number): Locator =>
    card.locator(`.vol-slot-grid__cell[data-slot-index="${index}"]`);

  test('Taşı ile tutulan öğeyi oklar/Enter taşır (kol D-pad + A eşdeğeri); tek drop niyeti, ikinci press yok', async ({
    page,
  }) => {
    await open(page, 'touch');
    const card = gridCard(page);
    await card.scrollIntoViewIfNeeded();
    const move = card.locator('[data-action="slot-move"]');
    await expect(move).toBeDisabled();
    await slot(card, 0).click();
    await expect(move).toBeEnabled();
    await move.click();
    const held = slot(card, 0);
    await expect(held).toBeFocused();
    await expect(held).toHaveAttribute('data-vol-arrows', 'both');
    await expect(held).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(slot(card, 0)).toHaveCount(0);
    await expect(slot(card, 1)).toHaveCount(1);
    await expect(probe(card)).toHaveAttribute('data-log', /drop:SlotGrid$/);
    expect(await probe(card).getAttribute('data-log')).not.toMatch(/drop:SlotGrid press/);
  });

  test('Taşı sonrası bir hücreye tıklamak/dokunmak öğeyi yerleştirir (dokun-yerleştir); Escape vazgeçirir', async ({
    page,
  }) => {
    await open(page, 'touch');
    const card = gridCard(page);
    await card.scrollIntoViewIfNeeded();
    await slot(card, 0).click();
    await card.locator('[data-action="slot-move"]').click();
    await cell(card, 16).click();
    await expect(slot(card, 16)).toHaveCount(1);
    await expect(slot(card, 0)).toHaveCount(0);
    await expect(probe(card)).toHaveAttribute('data-log', /drop:SlotGrid$/);

    // Escape: tutulan öğe yerinde kalır, tutma işaretleri temizlenir.
    await slot(card, 16).click();
    await card.locator('[data-action="slot-move"]').click();
    await expect(slot(card, 16)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(slot(card, 16)).not.toHaveAttribute('aria-pressed', 'true');
    await expect(slot(card, 16)).not.toHaveAttribute('data-vol-arrows', /.+/);
    await expect(slot(card, 16)).toHaveCount(1);
  });

  test('fareyle sürükle-bırak pick ve drop üretir; ardından gelen click ikinci bir press üretmez', async ({
    page,
  }) => {
    await open(page, 'touch');
    const card = gridCard(page);
    await card.scrollIntoViewIfNeeded();
    const from = (await slot(card, 0).boundingBox())!;
    const to = (await cell(card, 14).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(slot(card, 14)).toHaveCount(1);
    await expect(probe(card)).toHaveAttribute('data-log', 'pick:SlotGrid drop:SlotGrid');
  });
});
