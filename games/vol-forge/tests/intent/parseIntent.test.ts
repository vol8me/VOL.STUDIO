import { describe, expect, it } from 'vitest';
import { parseVisualIntent } from '../../src/intent/parseIntent';

describe('niyet değiştiricileri', () => {
  it('boyut, renk ve bitirişi Türkçe metinden birlikte çözer', () => {
    expect(parseVisualIntent('64×64 mor kristal, keskin piksel bitişli')).toEqual({
      size: [64, 64],
      color: '#8b67c6',
      finish: 'pixel',
    });
  });

  it('İngilizce ve kısa boyut yazımını kabul eder', () => {
    expect(parseVisualIntent('smooth green surface 128')).toEqual({
      size: [128, 128],
      color: '#64824d',
      finish: 'smooth',
    });
  });

  it('dikdörtgen ve 2048 sınırını destekler, sınır dışını yok sayar', () => {
    expect(parseVisualIntent('2048x1024 pembe')).toMatchObject({
      size: [2048, 1024],
      color: '#c96f91',
    });
    expect(parseVisualIntent('4096x4096')).toMatchObject({ size: undefined });
  });

  it('uygulanabilir değiştirici yoksa boş sonuç verir', () => {
    expect(parseVisualIntent('ince ve zarif bir biçim')).toEqual({
      size: undefined,
      color: undefined,
      finish: undefined,
    });
  });
});
