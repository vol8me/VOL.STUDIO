import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themePath = resolve(import.meta.dirname, '../../../../../core/src/ui/theme.css');
const themeContent = readFileSync(themePath, 'utf-8');

const stylesPath = resolve(import.meta.dirname, '../../../src/styles.css');
const stylesContent = readFileSync(stylesPath, 'utf-8');

const scenePath = resolve(import.meta.dirname, '../../../src/runtime/scene/GameScene.ts');
const sceneContent = readFileSync(scenePath, 'utf-8');

const settingsScenePath = resolve(
  import.meta.dirname,
  '../../../src/runtime/scene/SettingsScene.ts',
);
const settingsSceneContent = readFileSync(settingsScenePath, 'utf-8');

const hudStatsPath = resolve(import.meta.dirname, '../../../src/runtime/ui/HUDStats.ts');
const hudStatsContent = readFileSync(hudStatsPath, 'utf-8');

// HUD kurulumu sahneden `GameHud`'a taşındı; ölçü custom property'lerini artık o yazıyor.
const gameHudPath = resolve(import.meta.dirname, '../../../src/runtime/ui/GameHud.ts');
const gameHudContent = readFileSync(gameHudPath, 'utf-8');

describe('HUD responsive — --vol-space-md', () => {
  it('theme.css --vol-space-md değişkeni tanımlı', () => {
    expect(themeContent).toContain('--vol-space-md:');
  });

  it('theme.css --vol-space-xs/sm/lg/xl değişkenleri tanımlı', () => {
    const required = [
      '--vol-space-xs',
      '--vol-space-sm',
      '--vol-space-md',
      '--vol-space-lg',
      '--vol-space-xl',
    ];
    for (const v of required) {
      expect(themeContent, `${v} tanımlı olmalı`).toContain(v + ':');
    }
  });

  it('HUD üst şeridi güvenli alan ve tema boşluğuyla kenarlara bağlanır', () => {
    const block = /\.vol-hud-top\s*\{([^}]*)\}/.exec(stylesContent);
    expect(block, '.vol-hud-top tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('--vol-safe-top');
    expect(block![1]).toContain('--vol-space-md');
    expect(block![1]).toContain('grid-template-columns');
  });

  it('HUD stilleri TS içinde satır içi yazılmaz — tasarım sistemi baypas edilmez', () => {
    // O21: style.cssText ve sabit piksel top/left atamaları CSS'e taşındı.
    expect(hudStatsContent).not.toContain('style.cssText');
    expect(gameHudContent).not.toContain('style.cssText');
    expect(sceneContent).not.toContain('style.position');
    expect(sceneContent).not.toContain('style.top');
    expect(sceneContent).not.toContain('style.left');
  });

  it('HUD ölçüleri config üzerinden CSS custom property olarak verilir', () => {
    expect(gameHudContent).toContain('--vol-hud-bar-width');
    expect(stylesContent).toContain('var(--vol-hud-bar-width)');
  });
});

/**
 * Dokunmatik/mobil yerleşim değişmezleri.
 *
 * Bu değişmezler gerçek bir cihazda (Galaxy S21 FE, yatay 832×384 CSS px)
 * görülen hatalardan geldi; CSS'te tek bir satırla geri kırılabilir ve hiçbiri
 * jsdom'da görünmez (jsdom yerleşim hesaplamaz). Bu yüzden stil sayfası
 * METİN olarak denetlenir — kusurlu ama gerçek bir bekçi.
 */
describe('mobil yerleşim değişmezleri', () => {
  it('güvenli alan token’ları theme.css’te env() üzerinden tanımlanır', () => {
    // `viewport-fit=cover` olmadan env() hep 0 döner; ikisi birlikte anlamlı.
    for (const token of ['--vol-safe-top', '--vol-safe-right', '--vol-safe-bottom']) {
      expect(themeContent, `${token} tanımlı olmalı`).toContain(token + ':');
    }
    expect(themeContent).toContain('env(safe-area-inset-top');
  });

  it('kenara yapışan dokunmatik yüzeyler çıplak boşluk değil güvenli alan kullanır', () => {
    for (const selector of ['.vol-touch-controls', '.vol-touch-pause', '.vol-settings-close']) {
      const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(stylesContent);
      expect(block, `${selector} tanımlı olmalı`).not.toBeNull();
      expect(block![1], `${selector} güvenli alanı gözetmeli`).toMatch(/--vol-safe-/);
    }
  });

  it('ayarlar kapatma düğmesi panel içinde değil ekran kökünde yaşar', () => {
    const block = /\.vol-settings-close\s*\{([^}]*)\}/.exec(stylesContent);
    expect(block, 'ayarlar kapatma ankrajı tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('position: absolute');
    expect(block![1]).toContain('--vol-safe-top');
    expect(block![1]).toContain('--vol-safe-right');
    expect(settingsSceneContent).toContain('this.ui.mount(this.closeButton.element)');
    expect(settingsSceneContent).not.toContain(
      'this.panel.element.appendChild(this.closeButton.element)',
    );
  });

  it('ayarlar güvenli ekranın tamamından kaydırılır, panel yalnız içerik genişliğini sınırlar', () => {
    const surfaceBlock = /\.settings-scroll-surface\s*\{([^}]*)\}/.exec(stylesContent);
    expect(surfaceBlock, 'tam ekran ayarlar kaydırma yüzeyi tanımlı olmalı').not.toBeNull();
    expect(surfaceBlock![1]).toContain('position: absolute');
    expect(surfaceBlock![1]).toContain('inset: 0');
    expect(surfaceBlock![1]).toContain('overflow: hidden auto');
    expect(surfaceBlock![1]).toContain('touch-action: pan-y');

    const contentBlock =
      /\.settings-scroll-surface\s*>\s*\.vol-scroll-view__content\s*\{([^}]*)\}/.exec(
        stylesContent,
      );
    expect(contentBlock, 'güvenli alanlı ayarlar iç yüzeyi tanımlı olmalı').not.toBeNull();
    expect(contentBlock![1]).toContain('width: 100%');
    expect(contentBlock![1]).toContain('min-height: 100%');
    expect(contentBlock![1]).toContain('--vol-safe-left');
    expect(contentBlock![1]).toContain('--vol-safe-right');

    const panelBlock = /\.settings-panel\s*\{([^}]*)\}/.exec(stylesContent);
    expect(panelBlock, 'ayarlar içerik sütunu tanımlı olmalı').not.toBeNull();
    // Ölçü artık paylaşılan değişkende; okunabilir sütun sınırı orada tanımlı.
    expect(panelBlock![1]).toContain('width: var(--vol-settings-column)');
    const columnBlock = /--vol-settings-column:\s*([^;]+);/.exec(stylesContent);
    expect(columnBlock, 'paylaşılan sütun ölçüsü tanımlı olmalı').not.toBeNull();
    expect(columnBlock![1]).toContain('min(');
    expect(panelBlock![1]).toContain('position: relative');

    expect(settingsSceneContent).toContain("new ScrollView({ direction: 'vertical' })");
    expect(settingsSceneContent).toContain("classList.add('settings-scroll-surface')");
    expect(settingsSceneContent).toContain('this.scrollSurface.add(this.panel)');
    expect(settingsSceneContent).toContain('this.ui.mount(this.scrollSurface.element)');
  });

  it('dokunmatik kontroller diyalog katmanının ALTINDA kalır', () => {
    // Üstte kalırsa dash düğmesi dükkân kartlarının "KİLİTLE" düğmesini örtüp
    // dokunuşu çalıyor (cihazda görüldü). `.vol-card-layer` tam ekran ve
    // pointer-events: auto olduğu için altta durmak hem örtmeyi hem girdi
    // kesmeyi kendiliğinden sağlar.
    for (const selector of ['.vol-touch-controls', '.vol-touch-pause']) {
      const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(stylesContent);
      expect(block![1], `${selector} z-index diyalogdan türemeli`).toContain(
        'calc(var(--vol-z-dialog) - 1)',
      );
    }
  });

  it('mobil üst şerit 44 px pause hedefinden yatayda ayrılır', () => {
    const block = /\.vol-touch-active \.vol-hud-top\s*\{([^}]*)\}/.exec(stylesContent);
    expect(block, 'mobil HUD/pause ayrımı tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('44px');
    expect(block![1]).toContain('--vol-safe-right');
  });

  it('pause ayar X düğmesi kaydırmada görünür kalır', () => {
    const block = /\.pause-settings-close\s*\{([^}]*)\}/.exec(stylesContent);
    expect(block, 'pause ayar kapatma düğmesi tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('position: sticky');
    expect(block![1]).toContain('top: 0');
  });

  it('dalga sayacı ve duyurusu numarayı yeni satıra düşürmez', () => {
    for (const selector of ['.vol-wave__counter', '.vol-wave__announcement']) {
      const block = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(stylesContent);
      expect(block, `${selector} tanımlı olmalı`).not.toBeNull();
      expect(block![1]).toContain('white-space: nowrap');
    }
  });

  it('ayar formu iki yüzeyde de AYNI okuma sütununu kullanır', () => {
    // Regresyon: ana menü 560 px, pause 420 px kullanıyordu. Aynı
    // `GameSettingsContent` iki ayrı genişlikte sarıyor ve pause'daki form
    // gözle görülür biçimde sıkışık duruyordu.
    const settings = /\.settings-panel\s*\{([^}]*)\}/.exec(stylesContent);
    const pause = /\.pause-settings-panel\s*\{([^}]*)\}/.exec(stylesContent);

    expect(settings, 'ayarlar paneli tanımlı olmalı').not.toBeNull();
    expect(pause, 'pause ayar paneli tanımlı olmalı').not.toBeNull();
    expect(settings![1]).toContain('var(--vol-settings-column)');
    expect(pause![1]).toContain('var(--vol-settings-column)');
    // Ölçü TEK yerde tanımlı olmalı; iki panelde ayrı sayı kalmamalı.
    expect(settings![1]).not.toMatch(/min\(\d+px/);
    expect(pause![1]).not.toMatch(/min\(\d+px/);
  });

  it('duraklatma ve ölüm panelleri kısa ekranda taşmaz', () => {
    // 384 px yükseklikte ölüm özeti 445 px'e çıkıp başlığı ve "ANA MENÜ"
    // düğmesini kırpıyordu; oyuncu koşu sonunda menüye dönemiyordu.
    const block = /\.death-panel,\s*\.pause-panel,\s*\.main-menu-panel\s*\{([^}]*)\}/.exec(
      stylesContent,
    );
    expect(block, 'panel yükseklik sınırı tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('max-height');
    expect(block![1]).toContain('overflow-y: auto');
  });

  it('uzun ayarlar ve ölüm panelleri negatif yönde ortalanmaz', () => {
    // Flex `center`, taşan içeriğin başını negatif koordinata iter; scrollTop
    // sıfırken bile başlık ve ilk kontroller geri getirilemez hâle gelir.
    const block = /\.death-panel,\s*\.settings-panel\s*\{([^}]*)\}/.exec(stylesContent);
    expect(block, 'uzun paneller için başlangıç hizası tanımlı olmalı').not.toBeNull();
    expect(block![1]).toContain('justify-content: flex-start');
  });

  it('üst şerit tek banttır: can ve dash yan yana, Spark tam satır, istatistikler 2×2', () => {
    // Dört satırlık istatistik sütunu bandı 87 px'e çıkarıp 384 px yüksek
    // telefonda arenanın dörtte birini yiyordu (ölçüldü); bant iki satırda kalır.
    const vitals = /\.vol-hud-top__vitals\s*\{([^}]*)\}/.exec(stylesContent);
    expect(vitals, 'vitals ızgarası tanımlı olmalı').not.toBeNull();
    expect(vitals![1]).toContain('grid-template-columns: repeat(2,');

    const spark = /\.vol-hud__slot--spark\s*\{([^}]*)\}/.exec(stylesContent);
    expect(spark, 'Spark tam satır olmalı').not.toBeNull();
    expect(spark![1]).toContain('grid-column: 1 / -1');

    const stats = /\.vol-hud-stats\s*\{([^}]*)\}/.exec(stylesContent);
    expect(stats, 'istatistik ızgarası tanımlı olmalı').not.toBeNull();
    expect(stats![1]).toContain('grid-template-columns: repeat(2, max-content)');

    expect(stylesContent).toMatch(/@media \(width < 600px\)[\s\S]*?\.vol-hud-top \.vol-wave/);
  });

  it('masaüstü ability HUD mobil kopya seçicileri ve ikonları taşımaz', () => {
    expect(stylesContent).not.toContain('.vol-touch-active .vol-ability-hud');
    expect(stylesContent).not.toContain('.vol-ability-slot__icon');
    expect(gameHudContent).toContain('abilitySlots');
  });

  it('dokunmatik yüzey kararı sahne açılışında yalnız bir kez alınır', () => {
    expect(sceneContent.match(/shouldUseTouchControls\(\)/g)).toHaveLength(1);
    expect(sceneContent).toContain('this.touchControlsEnabled = shouldUseTouchControls();');
  });
});
