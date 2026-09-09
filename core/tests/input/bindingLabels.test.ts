import { describe, expect, it } from 'vitest';
import {
  describePCBinding,
  findBindingConflicts,
  isSameBinding,
} from '../../src/input/bindingLabels';

describe('describePCBinding', () => {
  it('harf ve rakam tuşlarını doğrudan karaktere çevirir', () => {
    expect(describePCBinding({ source: 'key', keyCode: 87 })).toBe('W');
    expect(describePCBinding({ source: 'key', keyCode: 65 })).toBe('A');
    expect(describePCBinding({ source: 'key', keyCode: 53 })).toBe('5');
  });

  it('adlandırılmış tuşları tablodan okur', () => {
    expect(describePCBinding({ source: 'key', keyCode: 32 })).toBe('Space');
    expect(describePCBinding({ source: 'key', keyCode: 27 })).toBe('Esc');
    expect(describePCBinding({ source: 'key', keyCode: 38 })).toBe('↑');
  });

  it('fonksiyon ve numpad tuşlarını aralıktan türetir', () => {
    expect(describePCBinding({ source: 'key', keyCode: 112 })).toBe('F1');
    expect(describePCBinding({ source: 'key', keyCode: 123 })).toBe('F12');
    expect(describePCBinding({ source: 'key', keyCode: 100 })).toBe('Num 4');
  });

  /*
   * Bilinmeyen kod için ad UYDURULMAZ. Yanlış bir ad, oyuncuyu bastığı tuşun
   * kaydedilmediğine inandırır; ham kod en azından doğrudur.
   */
  it('kapsanmayan kodu ham hâliyle gösterir', () => {
    expect(describePCBinding({ source: 'key', keyCode: 250 })).toBe('Tuş 250');
  });

  it('sol fare düğmesini LMB olarak yazar', () => {
    expect(describePCBinding({ source: 'pointerButton', button: 'left' })).toBe('LMB');
  });
});

describe('isSameBinding', () => {
  it('aynı tuş aynıdır, farklı kaynak değildir', () => {
    expect(isSameBinding({ source: 'key', keyCode: 32 }, { source: 'key', keyCode: 32 })).toBe(
      true,
    );
    expect(isSameBinding({ source: 'key', keyCode: 32 }, { source: 'key', keyCode: 65 })).toBe(
      false,
    );
    expect(
      isSameBinding({ source: 'key', keyCode: 32 }, { source: 'pointerButton', button: 'left' }),
    ).toBe(false);
  });
});

describe('findBindingConflicts', () => {
  const bindings = {
    fire: { source: 'pointerButton', button: 'left' },
    dash: { source: 'key', keyCode: 32 },
    reload: { source: 'key', keyCode: 82 },
  } as const;

  it('aynı girdiye bağlı DİĞER eylemleri bildirir', () => {
    expect(findBindingConflicts(bindings, 'reload', { source: 'key', keyCode: 32 })).toEqual([
      'dash',
    ]);
  });

  /* Bir eylemin kendi mevcut bağı çakışma değildir; aksi halde her ekran açılışı uyarırdı. */
  it('eylemin KENDİ bağı çakışma sayılmaz', () => {
    expect(findBindingConflicts(bindings, 'dash', { source: 'key', keyCode: 32 })).toEqual([]);
  });

  it('boş liste çakışma yok demektir', () => {
    expect(findBindingConflicts(bindings, 'dash', { source: 'key', keyCode: 81 })).toEqual([]);
  });

  it('birden çok çakışanı hepsini bildirir', () => {
    const many = {
      a: { source: 'key', keyCode: 32 },
      b: { source: 'key', keyCode: 32 },
      c: { source: 'key', keyCode: 65 },
    } as const;
    expect(findBindingConflicts(many, 'c', { source: 'key', keyCode: 32 }).sort()).toEqual([
      'a',
      'b',
    ]);
  });
});
