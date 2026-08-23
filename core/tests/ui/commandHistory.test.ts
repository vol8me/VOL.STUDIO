import { describe, expect, it, vi } from 'vitest';
import { CommandHistory, type HistoryCommand } from '../../src/ui/controls/CommandHistory';

function deltaCommand(
  state: { value: number },
  delta: number,
  label = `Delta ${delta}`,
  byteCost = 1,
): HistoryCommand {
  return {
    label,
    byteCost,
    apply: () => {
      state.value += delta;
    },
    revert: () => {
      state.value -= delta;
    },
  };
}

describe('CommandHistory', () => {
  it('execute/undo/redo/clear durumunu ve snapshot callbackini doğru tutar', () => {
    const state = { value: 0 };
    const onChange = vi.fn();
    const history = new CommandHistory({ maxBytes: 10, onChange });
    history.execute(deltaCommand(state, 2, 'İki', 3));
    expect(state.value).toBe(2);
    expect(history.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: 'İki',
      byteCost: 3,
      undoCount: 1,
    });
    expect(history.undo()).toBe(true);
    expect(state.value).toBe(0);
    expect(history.getSnapshot().redoLabel).toBe('İki');
    expect(history.redo()).toBe(true);
    expect(state.value).toBe(2);
    expect(history.redo()).toBe(false);
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.undo()).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  it('byte bütçesini en eskiden kırpar', () => {
    const state = { value: 0 };
    const history = new CommandHistory({ maxBytes: 5 });
    history.execute(deltaCommand(state, 1, 'A', 3));
    history.execute(deltaCommand(state, 2, 'B', 3));
    // İkisi birlikte bütçeyi aşar; en eski (A) düşer, B saklanmaya devam eder.
    expect(history.getSnapshot()).toMatchObject({ undoCount: 1, undoLabel: 'B', byteCost: 3 });
    expect(history.undo()).toBe(true);
    expect(state.value).toBe(1);
  });

  it('bütçeden büyük komut uygulanır ama geçmiş tümüyle bırakılır', () => {
    const state = { value: 0 };
    const history = new CommandHistory({ maxBytes: 5 });
    history.execute(deltaCommand(state, 1, 'A', 3));
    history.execute(deltaCommand(state, 2, 'B', 3));

    history.execute(deltaCommand(state, 4, 'Büyük', 10));

    // Büyük komut belgeye uygulanır fakat saklanamaz. Eski girdiler
    // BIRAKILMAZSA undo, belgenin hiç bulunmadığı bir duruma götürür: burada
    // "B geri alınmış ama Büyük hâlâ uygulanmış" karması. Delta fixture'ı yer
    // değiştirebilir olduğu için bu zararsız görünür; gerçek belge komutları
    // (tile buffer geri yükleme) bayat veriyi yeni içeriğin üzerine yazar.
    // Bu noktadan geriye hiçbir undo geçerli olmadığından yığın bırakılır.
    expect(state.value).toBe(7);
    expect(history.canUndo()).toBe(false);
    expect(history.getSnapshot()).toMatchObject({ undoCount: 0, byteCost: 0 });
    expect(history.undo()).toBe(false);
    expect(state.value).toBe(7);
  });

  it('record zaten uygulanmış komutu saklar ve yeni komut redo dalını temizler', () => {
    const state = { value: 5 };
    const history = new CommandHistory();
    history.record(deltaCommand(state, 5, 'Dışarıda uygulandı'));
    expect(state.value).toBe(5);
    history.undo();
    expect(state.value).toBe(0);
    history.execute(deltaCommand(state, 2, 'Yeni dal'));
    expect(history.canRedo()).toBe(false);
  });

  it('transaction komutlarını tek undo adımında ters sırayla geri alır', () => {
    const log: string[] = [];
    const history = new CommandHistory();
    const transaction = history.beginTransaction('Çoklu işlem');
    transaction.execute({
      label: 'A',
      byteCost: 2,
      apply: () => log.push('apply-a'),
      revert: () => log.push('revert-a'),
    });
    transaction.execute({
      label: 'B',
      byteCost: 3,
      apply: () => log.push('apply-b'),
      revert: () => log.push('revert-b'),
    });
    expect(() => history.undo()).toThrow(/Aktif transaction/);
    transaction.commit();
    expect(history.getSnapshot()).toMatchObject({
      undoCount: 1,
      undoLabel: 'Çoklu işlem',
      byteCost: 5,
    });
    history.undo();
    expect(log).toEqual(['apply-a', 'apply-b', 'revert-b', 'revert-a']);
    history.redo();
    expect(log.slice(-2)).toEqual(['apply-a', 'apply-b']);
    expect(() => transaction.commit()).toThrow(/zaten kapatıldı/);
  });

  it('runTransaction hata halinde uygulanmış komutları rollback eder', () => {
    const state = { value: 0 };
    const history = new CommandHistory();
    expect(() =>
      history.runTransaction('Hatalı', (transaction) => {
        transaction.execute(deltaCommand(state, 4));
        throw new Error('dur');
      }),
    ).toThrow('dur');
    expect(state.value).toBe(0);
    expect(history.canUndo()).toBe(false);

    const empty = history.beginTransaction('Boş');
    expect(() => history.beginTransaction('İç içe')).toThrow(/İç içe/);
    empty.rollback();
    empty.rollback();
  });

  it('aynı mergeKey komutlarını sağlayıcının birleşik komutuna indirger', () => {
    const state = { value: 0 };
    const history = new CommandHistory();
    const first: HistoryCommand = {
      ...deltaCommand(state, 1, 'Sürükle', 2),
      mergeKey: 'drag',
      mergeWith: () => ({
        label: 'Sürükle',
        byteCost: 3,
        mergeKey: 'drag',
        apply: () => {
          state.value += 3;
        },
        revert: () => {
          state.value -= 3;
        },
      }),
    };
    history.execute(first);
    history.execute({ ...deltaCommand(state, 2, 'Sürükle', 2), mergeKey: 'drag' });
    expect(state.value).toBe(3);
    expect(history.getSnapshot()).toMatchObject({ undoCount: 1, byteCost: 3 });
    history.undo();
    expect(state.value).toBe(0);
    history.redo();
    expect(state.value).toBe(3);
  });

  it('geçersiz bütçe ve komutları durum değiştirmeden reddeder', () => {
    expect(() => new CommandHistory({ maxBytes: Number.NaN })).toThrow(/maxBytes/);
    const history = new CommandHistory();
    expect(() =>
      history.execute({ label: '', byteCost: 1, apply: vi.fn(), revert: vi.fn() }),
    ).toThrow(/label/);
    expect(() =>
      history.record({ label: 'X', byteCost: -1, apply: vi.fn(), revert: vi.fn() }),
    ).toThrow(/byteCost/);
    const transaction = history.beginTransaction('Test');
    expect(() =>
      transaction.record({ label: 'X', byteCost: Number.NaN, apply: vi.fn(), revert: vi.fn() }),
    ).toThrow(/byteCost/);
    transaction.rollback();
  });
});
