import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';
import { DashGhosts } from '@/view/spider/DashGhosts';
import { SpiderMotion } from '@/view/spider/SpiderMotion';
import { fakeScene } from '../../support/fakeScene';

describe.each(WALKER_IDS.map((id) => [id, SPIDER_LOOKS[id]] as const))(
  'DashGhosts (%s)',
  (_id, look) => {
    const pose = new SpiderMotion(look).pose;
    const build = () => {
      const scene = fakeScene();
      const ghosts = new DashGhosts(scene as unknown as Phaser.Scene, look, 9.5);
      return { scene, ghosts };
    };

    it('atılış yokken hiç görüntü yaratmaz', () => {
      const { scene, ghosts } = build();
      for (let i = 0; i < 60; i++) ghosts.update(0, 0, 0, pose, 0, 16);
      expect(scene.created).toHaveLength(0);
      expect(ghosts.active).toBe(0);
    });

    it('atılışta aralıkla kopya alır, havuzu aşmaz ve eski kopyaları yeniden kullanır', () => {
      const { scene, ghosts } = build();
      for (let i = 0; i < 120; i++) ghosts.update(i * 5, 0, 0, pose, 1, 16);
      // Kopya başına göğüs ve karın: havuz `count` ile sınırlıdır.
      expect(scene.created.filter((object) => object.kind === 'image')).toHaveLength(
        look.ghost.count * 2,
      );
      expect(ghosts.active).toBeGreaterThan(0);
      expect(ghosts.active).toBeLessThanOrEqual(look.ghost.count);
    });

    it('atılış bitince kopyalar ömürleri dolunca söner; dondurulmuş saatte (0 ms) yaşlanmaz', () => {
      const { ghosts } = build();
      for (let i = 0; i < 40; i++) ghosts.update(i * 5, 0, 0, pose, 1, 16);
      const before = ghosts.active;
      expect(before).toBeGreaterThan(0);
      ghosts.update(0, 0, 0, pose, 0, 0);
      expect(ghosts.active).toBe(before);
      for (let i = 0; i < 40; i++) ghosts.update(0, 0, 0, pose, 0, 16);
      expect(ghosts.active).toBe(0);
    });

    it('yok edilince bütün görüntüleri sökülür', () => {
      const { scene, ghosts } = build();
      for (let i = 0; i < 40; i++) ghosts.update(i * 5, 0, 0, pose, 1, 16);
      ghosts.destroy();
      const images = scene.created.filter((object) => object.kind === 'image');
      expect(images.length).toBeGreaterThan(0);
      for (const image of images)
        expect(image.calls.some(([name]) => name === 'destroy')).toBe(true);
    });
  },
);
