import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { HUDStats } from '@/runtime/ui/HUDStats';
import { SparkBar } from '@/runtime/ui/SparkBar';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { economyConfig } from '@/config/economy';
import trResources from '@/i18n/tr.json';

describe('Ekonomi HUD’u', () => {
  let root: HTMLDivElement;

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    await i18n.init();
    await i18next.changeLanguage('tr');
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  describe('Flux sayacı (sağ üst)', () => {
    it('sıfırdan başlar ve toplandıkça artar', () => {
      const hud = new HUDStats(root);

      hud.setFlux(3);
      expect(root.textContent).toContain('3');

      hud.setFlux(7);
      expect(root.textContent).toContain('7');

      hud.destroy();
    });

    it('artışta vurgu (pulse) uygular', () => {
      const hud = new HUDStats(root);
      const counter = root.querySelector('.vol-counter');
      expect(counter).not.toBeNull();

      hud.setFlux(1);
      expect(counter!.classList.contains('vol-counter--pulse')).toBe(true);

      hud.destroy();
    });

    it('aynı değer tekrar verilirse DOM’a dokunmaz', () => {
      const hud = new HUDStats(root);
      hud.setFlux(4);
      const counter = root.querySelector('.vol-counter')!;
      counter.classList.remove('vol-counter--pulse');

      hud.setFlux(4);
      expect(counter.classList.contains('vol-counter--pulse')).toBe(false);

      hud.destroy();
    });

    it('destroy sayacı da kaldırır', () => {
      const hud = new HUDStats(root);
      hud.setFlux(5);
      hud.destroy();
      expect(root.querySelector('.vol-counter')).toBeNull();
    });
  });

  describe('Spark barı (sol sütun)', () => {
    it('HUD yuvası olarak mount olur ve ekonomiyi yansıtır', () => {
      const economy = new RunEconomy();
      const bar = new SparkBar(root, economy);

      const slot = root.querySelector('.vol-hud__slot--spark');
      expect(slot).not.toBeNull();
      // Etiket seviye ve eşik bilgisini taşır.
      expect(slot!.textContent).toContain('Spark');
      expect(slot!.textContent).toContain(String(economyConfig.spark.baseThreshold));

      bar.destroy();
    });

    it('boş Spark barı kırmızı uyarı durumuna düşmez', () => {
      const economy = new RunEconomy();
      const bar = new SparkBar(root, economy);
      const xpBar = root.querySelector('.vol-xp-bar')!;

      // Koşu başında bar boştur; "kritik" algısı yaratmamalı.
      expect(xpBar.classList.contains('vol-bar--low')).toBe(false);

      economy.addSpark(1);
      bar.refresh();
      expect(xpBar.classList.contains('vol-bar--low')).toBe(false);

      bar.destroy();
    });

    it('Spark kazanınca dolum değeri artar', () => {
      const economy = new RunEconomy();
      const bar = new SparkBar(root, economy);
      const xpBar = root.querySelector('.vol-xp-bar')!;
      expect(xpBar.getAttribute('aria-valuenow')).toBe('0');

      economy.addSpark(5);
      bar.refresh();

      // Görünen dolum animasyonla akar; anlık ve kesin değer aria'da durur.
      expect(xpBar.getAttribute('aria-valuenow')).toBe('5');

      bar.destroy();
    });

    it('seviye atlayınca level-up vurgusu oynar ve eşik büyür', () => {
      const economy = new RunEconomy();
      const bar = new SparkBar(root, economy);

      economy.addSpark(economyConfig.spark.baseThreshold);
      bar.refresh();

      const xpBar = root.querySelector('.vol-xp-bar')!;
      expect(xpBar.classList.contains('vol-xp-bar--level-up')).toBe(true);
      expect(xpBar.textContent).toContain(String(economy.getLevelSpan()));

      bar.destroy();
    });

    it('ekonomi değişmediyse tekrar refresh vurguyu yeniden tetiklemez', () => {
      const economy = new RunEconomy();
      const bar = new SparkBar(root, economy);

      economy.addSpark(economyConfig.spark.baseThreshold);
      bar.refresh();
      const xpBar = root.querySelector('.vol-xp-bar')!;
      xpBar.classList.remove('vol-xp-bar--level-up');

      bar.refresh();
      expect(xpBar.classList.contains('vol-xp-bar--level-up')).toBe(false);

      bar.destroy();
    });

    it('destroy yuvayı DOM’dan kaldırır', () => {
      const bar = new SparkBar(root, new RunEconomy());
      bar.destroy();
      expect(root.querySelector('.vol-hud__slot--spark')).toBeNull();
    });
  });
});
