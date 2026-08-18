import { describe, it, expect } from 'vitest';
import Phaser from 'phaser';
import { DEFAULT_MOVE_KEYS } from '../../src/input/PCController';

/**
 * `DEFAULT_MOVE_KEYS` bilinçli olarak HAM SAYI taşır, `Phaser.Input.Keyboard.KeyCodes`
 * referansı değil (gerekçe orada yazılı: modül seviyesinde Phaser okumak, Phaser'ı
 * mock'layan bir tüketicide import anında patlıyordu — vol-ui showcase testleri).
 *
 * Ham sayının bedeli sessiz sapma riskidir: biri `up: 87`'yi yanlış yazarsa
 * hiçbir şey uyarmaz. Bu test o riski kapatır — sayılar Phaser'ın kendi
 * tablosuyla karşılaştırılır.
 */
describe('DEFAULT_MOVE_KEYS', () => {
  it("ham keyCode değerleri Phaser'ın KeyCodes tablosuyla birebir aynı", () => {
    const codes = Phaser.Input.Keyboard.KeyCodes;
    expect(DEFAULT_MOVE_KEYS).toEqual({
      up: codes.W,
      down: codes.S,
      left: codes.A,
      right: codes.D,
    });
  });

  it('modül seviyesinde Phaser okunmadığı için değerler sayıdır', () => {
    // Bir enum referansı olsaydı Phaser mock'lanan ortamda `undefined` olurdu.
    for (const value of Object.values(DEFAULT_MOVE_KEYS)) {
      expect(typeof value).toBe('number');
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
