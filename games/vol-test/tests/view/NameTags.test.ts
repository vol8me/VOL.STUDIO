import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ONLINE_VIEW } from '@/config/onlineView';
import { NameTags, type TagFrame } from '@/view/NameTags';
import { fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

function frame(id: number, patch: Partial<TagFrame> = {}): TagFrame {
  return {
    id,
    x: 100 * id,
    y: 50,
    name: `Pilot${id}`,
    color: 0x52f5cf,
    health: 1,
    alive: true,
    protected: false,
    ...patch,
  };
}

function setup() {
  const fake = fakeScene();
  const tags = new NameTags(fake as unknown as Phaser.Scene);
  const texts = (): FakeObject[] => fake.created.filter((object) => object.kind === 'text');
  const graphics = fake.created.find((object) => object.kind === 'graphics')!;
  return { tags, fake, texts, graphics };
}

describe('NameTags', () => {
  it('her araca bir yazı kurar, çubuğun üstüne ortalar ve renklendirir', () => {
    const { tags, texts } = setup();
    tags.update([frame(1), frame(2, { color: 0xe8644a })]);
    expect(tags.count).toBe(2);
    const [first, second] = texts();
    expect(first.args[2]).toBe('Pilot1');
    expect((first.args[3] as { color: string }).color).toBe('#52f5cf');
    expect((second.args[3] as { color: string }).color).toBe('#e8644a');
    const [x, y] = lastCall(first, 'setPosition') as [number, number];
    expect(x).toBe(100);
    expect(y).toBeLessThan(50 + ONLINE_VIEW.tag.offsetY);
    expect(lastCall(first, 'setOrigin')).toEqual([0.5, 1]);
    expect(lastCall(first, 'setResolution')).toEqual([ONLINE_VIEW.tag.resolution]);
  });

  it('aynı aracı yeniden kurmaz; ad ve renk değişince yalnız onları günceller', () => {
    const { tags, texts } = setup();
    tags.update([frame(1)]);
    tags.update([frame(1, { x: 130 })]);
    expect(texts()).toHaveLength(1);
    const text = texts()[0];
    expect(lastCall(text, 'setPosition')?.[0]).toBe(130);
    tags.update([frame(1, { name: 'Yeni', color: 0xe8644a })]);
    expect(lastCall(text, 'setText')).toEqual(['Yeni']);
    expect(lastCall(text, 'setColor')).toEqual(['#e8644a']);
  });

  it('çerçevede olmayan aracın yazısını söker', () => {
    const { tags, texts } = setup();
    tags.update([frame(1), frame(2)]);
    const [, second] = texts();
    tags.update([frame(1)]);
    expect(tags.count).toBe(1);
    expect(lastCall(second, 'destroy')).toBeDefined();
    tags.update([]);
    expect(tags.count).toBe(0);
  });

  it('ölü aracın etiketi solar ve canı çizilmez; koruma çerçeve ekler', () => {
    const { tags, texts, graphics } = setup();
    tags.update([frame(1, { alive: false, health: 0 })]);
    expect(lastCall(texts()[0], 'setAlpha')).toEqual([ONLINE_VIEW.tag.deadAlpha]);
    const fills = graphics.calls.filter(([name]) => name === 'fillRect');
    expect(fills).toHaveLength(1);

    tags.update([frame(1, { health: 0.5 })]);
    expect(lastCall(texts()[0], 'setAlpha')).toEqual([1]);
    const widths = graphics.calls
      .filter(([name]) => name === 'fillRect')
      .map(([, args]) => args[2] as number);
    expect(widths.at(-1)).toBeCloseTo(ONLINE_VIEW.tag.barWidth / 2);
    expect(graphics.calls.some(([name]) => name === 'strokeRect')).toBe(false);

    tags.update([frame(1, { protected: true })]);
    expect(graphics.calls.some(([name]) => name === 'strokeRect')).toBe(true);
  });

  it('can oranını 0..1 aralığına sıkıştırır', () => {
    const { tags, graphics } = setup();
    tags.update([frame(1, { health: 3 }), frame(2, { health: -1 })]);
    const widths = graphics.calls
      .filter(([name]) => name === 'fillRect')
      .map(([, args]) => args[2] as number);
    // [zemin, dolgu] çiftleri: 1'e kırpılan tam, 0'a kırpılan sıfır genişlik.
    expect(widths).toEqual([
      ONLINE_VIEW.tag.barWidth + 2,
      ONLINE_VIEW.tag.barWidth,
      ONLINE_VIEW.tag.barWidth + 2,
      0,
    ]);
  });

  it('söküldüğünde yazıları ve çizimi yok eder', () => {
    const { tags, texts, graphics } = setup();
    tags.update([frame(1), frame(2)]);
    tags.destroy();
    for (const text of texts()) expect(lastCall(text, 'destroy')).toBeDefined();
    expect(lastCall(graphics, 'destroy')).toBeDefined();
    expect(tags.count).toBe(0);
  });
});
