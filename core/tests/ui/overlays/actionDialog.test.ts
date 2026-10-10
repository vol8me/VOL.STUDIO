import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { getBackHandlerCount } from '../../../src/platform/backNavigation';
import { openActionDialog, showDialog } from '../../../src/ui/overlays/ActionDialog';
import { MODAL_TRANSITION_MS } from '../../../src/ui/overlays/Confirm';

/** Her turda mikro görevler ve 0 ms zamanlayıcılar işlenir. */
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  // Açık kalan diyaloglar geri kaydı ve gövde kilidi tutar; her biri Escape ile (üstten başlayarak) kapatılır.
  for (let guard = 0; guard < 20 && getBackHandlerCount() > 0; guard += 1) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.body.classList.remove('vol-modal__body-locked');
});

const ACTIONS = [
  { id: 'cancel', label: 'Vazgeç' },
  { id: 'ok', label: 'Tamam', variant: 'primary' as const },
];

/** Aynı anda birden çok (kapanmakta olan) diyalog DOM'da olabilir; en son açılanın düğmesi aranır. */
const latest = (): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.vol-dialog')].at(-1)!;
const button = (label: string): HTMLButtonElement => {
  const found = [...latest().querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Düğme yok: ${label}`);
  return found;
};
const dialogRole = (): HTMLElement => latest().querySelector<HTMLElement>('[role$="dialog"]')!;

describe('ActionDialog: doğrulama', () => {
  it('eylem sayısı 1–4 dışındaysa, kimlikler yinelenirse ya da iptal/odak eylemi yoksa fırlatır', () => {
    const base = { title: 'Başlık', cancelId: 'cancel' };
    expect(() => openActionDialog({ ...base, actions: [] })).toThrow(RangeError);
    expect(() =>
      openActionDialog({
        ...base,
        actions: ['a', 'b', 'c', 'd', 'cancel'].map((id) => ({ id, label: id })),
      }),
    ).toThrow(RangeError);
    expect(() =>
      openActionDialog({ ...base, actions: [ACTIONS[0], { id: 'cancel', label: 'Yine' }] }),
    ).toThrow(/benzersiz/);
    expect(() => openActionDialog({ ...base, cancelId: 'yok', actions: ACTIONS })).toThrow(
      /İptal eylemi/,
    );
    expect(() => openActionDialog({ ...base, actions: ACTIONS, initialFocusId: 'yok' })).toThrow(
      /İlk odak/,
    );
    expect(document.querySelector('.vol-dialog')).toBeNull();
  });
});

describe('ActionDialog: yapı ve erişilebilirlik', () => {
  it('ad ve açıklamaya bağlı diyalog kurar; yıkıcı eylem varsa alertdialog olur', () => {
    openActionDialog({
      title: 'Kaydı sil',
      message: 'Bu işlem geri alınamaz.',
      actions: [ACTIONS[0], { id: 'del', label: 'Sil', variant: 'danger' }],
      cancelId: 'cancel',
    });
    const role = dialogRole();
    expect(role.getAttribute('role')).toBe('alertdialog');
    expect(role.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(role.getAttribute('aria-labelledby')!);
    const message = document.getElementById(role.getAttribute('aria-describedby')!);
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent).toBe('Kaydı sil');
    expect(message?.textContent).toBe('Bu işlem geri alınamaz.');
  });

  it('yıkıcı eylem yoksa dialog olur; mesaj yoksa aria-describedby yazılmaz', () => {
    openActionDialog({ title: 'Bilgi', actions: ACTIONS, cancelId: 'cancel' });
    expect(dialogRole().getAttribute('role')).toBe('dialog');
    expect(dialogRole().hasAttribute('aria-describedby')).toBe(false);
  });

  it('rol açıkça verilirse varsayılanı ezer', () => {
    openActionDialog({ title: 'Bilgi', actions: ACTIONS, cancelId: 'cancel', role: 'alertdialog' });
    expect(dialogRole().getAttribute('role')).toBe('alertdialog');
  });

  it('karşılaştırma satırlarını tanım listesi olarak, notları düğmeye bağlı yığılmış düzende yazar', () => {
    openActionDialog({
      title: 'Çakışma',
      details: [
        { label: 'Bu cihaz', value: '12 Eki · 48 KB' },
        { label: 'Uzak kopya', value: '11 Eki · 51 KB' },
      ],
      actions: [
        { id: 'local', label: 'Yerel kalsın', note: 'Uzak kopya değişir' },
        { id: 'cancel', label: 'Vazgeç', note: 'Hiçbir şey değişmez' },
      ],
      cancelId: 'cancel',
    });
    const terms = [...document.querySelectorAll('.vol-dialog__details dt')].map(
      (node) => node.textContent,
    );
    const values = [...document.querySelectorAll('.vol-dialog__details dd')].map(
      (node) => node.textContent,
    );
    expect(terms).toEqual(['Bu cihaz', 'Uzak kopya']);
    expect(values).toEqual(['12 Eki · 48 KB', '11 Eki · 51 KB']);
    expect(document.querySelector('.vol-dialog__actions--stacked')).not.toBeNull();
    const local = button('Yerel kalsın');
    expect(document.getElementById(local.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Uzak kopya değişir',
    );
  });

  it('metinler düz metindir: HTML yorumlanmaz', () => {
    openActionDialog({
      title: '<img src=x onerror=alert(1)>',
      message: '<b>kalın</b>',
      details: [{ label: '<i>a</i>', value: '<u>b</u>' }],
      actions: [{ id: 'cancel', label: '<s>iptal</s>' }],
      cancelId: 'cancel',
    });
    expect(document.querySelector('.vol-dialog img, .vol-dialog b, .vol-dialog i')).toBeNull();
    expect(document.querySelector('.vol-dialog h2')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('ActionDialog: ilk odak', () => {
  it('yıkıcı eylem varsa iptale, yoksa birincil eyleme, açıkça verilirse ona odaklanır', () => {
    // Yıkıcı eylem İLK sırada: sıra ilk odağı belirlemez, iptal belirler.
    const a = openActionDialog({
      title: 'Sil',
      actions: [{ id: 'del', label: 'Sil', variant: 'danger' }, ACTIONS[0]],
      cancelId: 'cancel',
    });
    expect(document.activeElement).toBe(button('Vazgeç'));
    a.close();

    const b = openActionDialog({ title: 'Kaydet', actions: ACTIONS, cancelId: 'cancel' });
    expect(document.activeElement).toBe(button('Tamam'));
    b.close();

    openActionDialog({
      title: 'Kaydet',
      actions: ACTIONS,
      cancelId: 'cancel',
      initialFocusId: 'cancel',
    });
    expect(document.activeElement).toBe(button('Vazgeç'));
  });
});

describe('ActionDialog: sonuç ve kapanış', () => {
  it('eylem seçimi kimliğini döndürür ve süre sonunda DOM, kilit ve geri kaydı temizlenir', async () => {
    vi.useFakeTimers();
    const handle = openActionDialog({ title: 'Kaydet', actions: ACTIONS, cancelId: 'cancel' });
    expect(getBackHandlerCount()).toBe(1);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(true);
    button('Tamam').click();
    await expect(handle.result).resolves.toBe('ok');
    expect(getBackHandlerCount()).toBe(0);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
    expect(document.querySelector('.vol-dialog')).not.toBeNull();
    vi.advanceTimersByTime(MODAL_TRANSITION_MS);
    expect(document.querySelector('.vol-dialog')).toBeNull();
  });

  it('Escape, scrim ve Android geri iptal eylemini döndürür', async () => {
    const escape = showDialog({ title: 'a', actions: ACTIONS, cancelId: 'cancel' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(escape).resolves.toBe('cancel');

    const scrim = showDialog({ title: 'b', actions: ACTIONS, cancelId: 'cancel' });
    document.querySelector<HTMLElement>('.vol-modal--visible .vol-modal__scrim')!.click();
    await expect(scrim).resolves.toBe('cancel');

    const back = showDialog({ title: 'c', actions: ACTIONS, cancelId: 'cancel' });
    window.dispatchEvent(new Event('vol:androidback'));
    await expect(back).resolves.toBe('cancel');
    expect(getBackHandlerCount()).toBe(0);
  });

  it('sinyal iptali iptal eylemini döndürür; önceden iptal edilmişse hiç açılmaz', async () => {
    const controller = new AbortController();
    const pending = showDialog({
      title: 'a',
      actions: ACTIONS,
      cancelId: 'cancel',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toBe('cancel');
    expect(getBackHandlerCount()).toBe(0);

    document.body.innerHTML = '';
    await expect(
      showDialog({ title: 'b', actions: ACTIONS, cancelId: 'cancel', signal: AbortSignal.abort() }),
    ).resolves.toBe('cancel');
    expect(document.querySelector('.vol-dialog')).toBeNull();
  });

  it('programlı kapatma kimlik alabilir; ikinci kapanış ilk sonucu değiştirmez', async () => {
    const handle = openActionDialog({ title: 'a', actions: ACTIONS, cancelId: 'cancel' });
    handle.close('ok');
    handle.close('cancel');
    button('Vazgeç').click();
    await expect(handle.result).resolves.toBe('ok');
  });
});

describe('ActionDialog: bekleme, hata, yeniden deneme, iptal', () => {
  it('eşzamanlı onAction diyaloğu eylem kimliğiyle kapatır, bekleme durumuna girmez', async () => {
    const onAction = vi.fn();
    const handle = openActionDialog({
      title: 'a',
      actions: ACTIONS,
      cancelId: 'cancel',
      onAction,
    });
    button('Tamam').click();
    await expect(handle.result).resolves.toBe('ok');
    expect(onAction).toHaveBeenCalledWith('ok', expect.any(AbortSignal));
  });

  it('iptal eylemi onAction çağırmaz', async () => {
    const onAction = vi.fn();
    const handle = openActionDialog({ title: 'a', actions: ACTIONS, cancelId: 'cancel', onAction });
    button('Vazgeç').click();
    await expect(handle.result).resolves.toBe('cancel');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('söz beklenirken bekleme duyurulur, diğer eylemler kapanır, iptal açık kalır ve odak alır', async () => {
    let finish!: () => void;
    const handle = openActionDialog({
      title: 'a',
      actions: [...ACTIONS, { id: 'other', label: 'Başka' }],
      cancelId: 'cancel',
      onAction: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    button('Tamam').click();
    expect(document.querySelector('.vol-dialog__status')?.textContent).toBe(
      i18next.t('core:dialog.busy'),
    );
    expect(dialogRole().getAttribute('aria-busy')).toBe('true');
    expect(button('Tamam').getAttribute('aria-busy')).toBe('true');
    expect(button('Başka').disabled).toBe(true);
    expect(button('Vazgeç').disabled).toBe(false);
    expect(document.activeElement).toBe(button('Vazgeç'));

    finish();
    await expect(handle.result).resolves.toBe('ok');
  });

  it('reddedilen iş hata bölgesini açar, eylemleri geri verir ve aynı eylem yeniden denenir', async () => {
    const attempts: Array<(error?: Error) => void> = [];
    const handle = openActionDialog({
      title: 'a',
      actions: [...ACTIONS, { id: 'other', label: 'Başka' }],
      cancelId: 'cancel',
      onAction: () =>
        new Promise<void>((resolve, reject) => {
          attempts.push((error) => (error ? reject(error) : resolve()));
        }),
    });
    button('Tamam').click();
    attempts[0](new Error('disk dolu: /secret/path'));
    await turn();
    await turn();

    const alert = document.querySelector('.vol-dialog__alert')!;
    expect(alert.getAttribute('role')).toBe('alert');
    // Ham hata iletisi kullanıcıya sızmaz; çevrilmiş genel ileti gösterilir.
    expect(alert.textContent).toBe(i18next.t('core:dialog.failed'));
    expect(document.querySelector('.vol-dialog__status')?.textContent).toBe('');
    expect(dialogRole().getAttribute('aria-busy')).toBe('false');
    expect(button('Başka').disabled).toBe(false);
    expect(button('Tamam').disabled).toBe(false);
    expect(button('Tamam').classList.contains('vol-button--error')).toBe(true);
    expect(document.activeElement).toBe(button('Tamam'));

    // Yeniden deneme: hata temizlenir, bekleme geri gelir, başarıda kapanır.
    button('Tamam').click();
    expect(document.querySelector('.vol-dialog__alert')?.textContent).toBe('');
    expect(document.querySelector('.vol-dialog__status')?.textContent).not.toBe('');
    attempts[1]();
    await expect(handle.result).resolves.toBe('ok');
    expect(attempts).toHaveLength(2);
  });

  it('describeError çağıranın iletisini yazar; eşzamanlı fırlatma da hata durumuna düşer', async () => {
    const handle = openActionDialog({
      title: 'a',
      actions: ACTIONS,
      cancelId: 'cancel',
      onAction: () => {
        throw new Error('ağ yok');
      },
      describeError: (error) => `Başarısız: ${(error as Error).message}`,
    });
    button('Tamam').click();
    await turn();
    await turn();
    expect(document.querySelector('.vol-dialog__alert')?.textContent).toBe('Başarısız: ağ yok');
    expect(button('Tamam').disabled).toBe(false);
    handle.close();
  });

  it('bekleme sırasında iptal: sinyal iptal olur, sonuç iptaldir, geç sonuç ve geç hata yok sayılır', async () => {
    let signalSeen!: AbortSignal;
    let reject!: (error: Error) => void;
    const handle = openActionDialog({
      title: 'a',
      actions: ACTIONS,
      cancelId: 'cancel',
      onAction: (_id, signal) => {
        signalSeen = signal;
        return new Promise<void>((_resolve, rejectFn) => {
          reject = rejectFn;
        });
      },
    });
    button('Tamam').click();
    expect(signalSeen.aborted).toBe(false);
    button('Vazgeç').click();
    await expect(handle.result).resolves.toBe('cancel');
    expect(signalSeen.aborted).toBe(true);

    reject(new Error('geç hata'));
    await turn();
    await turn();
    expect(document.querySelector('.vol-dialog__alert')?.textContent ?? '').toBe('');
    await expect(handle.result).resolves.toBe('cancel');
  });

  it('bekleme sırasında Escape de işi iptal eder', async () => {
    let signalSeen!: AbortSignal;
    const handle = openActionDialog({
      title: 'a',
      actions: ACTIONS,
      cancelId: 'cancel',
      onAction: (_id, signal) => {
        signalSeen = signal;
        return new Promise<void>(() => undefined);
      },
    });
    button('Tamam').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(handle.result).resolves.toBe('cancel');
    expect(signalSeen.aborted).toBe(true);
  });
});
