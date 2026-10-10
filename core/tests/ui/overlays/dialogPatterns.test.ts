import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import coreEn from '../../../src/i18n/en.json';
import coreTr from '../../../src/i18n/tr.json';
import { getBackHandlerCount } from '../../../src/platform/backNavigation';
import {
  showDestructiveConfirm,
  showExitPrompt,
  showPermissionPrompt,
  showSyncConflict,
} from '../../../src/ui/overlays/dialogPatterns';

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const t = (key: string): string => (i18next as unknown as { t(key: string): string }).t(key);

afterEach(() => {
  for (let guard = 0; guard < 20 && getBackHandlerCount() > 0; guard += 1) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.body.classList.remove('vol-modal__body-locked');
});

const latest = (): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.vol-dialog')].at(-1)!;
const button = (label: string): HTMLButtonElement => {
  const found = [...latest().querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Düğme yok: ${label}`);
  return found;
};
const role = (): string => latest().querySelector('[role$="dialog"]')!.getAttribute('role')!;
const escape = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('showDestructiveConfirm', () => {
  it('alertdialog açar, ilk odak iptaldedir ve sonucu açıkça yazar', async () => {
    const result = showDestructiveConfirm({ title: 'Kaydı sil', message: 'Kayıt 3 silinecek.' });
    expect(role()).toBe('alertdialog');
    expect(document.activeElement).toBe(button(t('core:dialog.cancel')));
    expect(latest().textContent).toContain('Kayıt 3 silinecek.');
    expect(latest().textContent).toContain(t('core:dialog.destructive.consequence'));
    expect(button(t('core:dialog.destructive.confirm')).className).toContain('vol-button--danger');
    button(t('core:dialog.destructive.confirm')).click();
    await expect(result).resolves.toBe(true);
  });

  it('Escape, iptal düğmesi ve sinyal false döndürür; Enter (ilk odak) yıkıcı işlem yapmaz', async () => {
    const escaped = showDestructiveConfirm({ title: 'a' });
    escape();
    await expect(escaped).resolves.toBe(false);

    const cancelled = showDestructiveConfirm({ title: 'b' });
    // İlk odak iptalde: odaktaki düğmeye basmak (Enter/A) iptaldir.
    (document.activeElement as HTMLButtonElement).click();
    await expect(cancelled).resolves.toBe(false);

    const controller = new AbortController();
    const aborted = showDestructiveConfirm({ title: 'c', signal: controller.signal });
    controller.abort();
    await expect(aborted).resolves.toBe(false);
  });

  it('özel etiket ve sonuç metni kullanılır', async () => {
    const result = showDestructiveConfirm({
      title: 'Hesabı kapat',
      consequence: 'Bütün ilerleme silinir.',
      confirmLabel: 'Hesabı kapat',
      cancelLabel: 'Vazgeç',
    });
    expect(latest().textContent).toContain('Bütün ilerleme silinir.');
    expect(latest().textContent).not.toContain(t('core:dialog.destructive.consequence'));
    button('Vazgeç').click();
    await expect(result).resolves.toBe(false);
  });
});

describe('showExitPrompt', () => {
  it('üç seçenek sunar; vazgeç ilk odaktır ve Escape bunu döndürür', async () => {
    const result = showExitPrompt();
    expect(role()).toBe('alertdialog');
    expect(document.activeElement).toBe(button(t('core:dialog.exit.stay')));
    escape();
    await expect(result).resolves.toBe('stay');
  });

  it('kaydet ve kaydetme seçimleri; kaydetme işi çalıştırmaz', async () => {
    const save = vi.fn();
    const discard = showExitPrompt({ save });
    button(t('core:dialog.exit.discardAndExit')).click();
    await expect(discard).resolves.toBe('discard');
    expect(save).not.toHaveBeenCalled();

    const saved = showExitPrompt({ save });
    button(t('core:dialog.exit.saveAndExit')).click();
    await expect(saved).resolves.toBe('save');
    expect(save).toHaveBeenCalledOnce();
  });

  it('kaydetme işi başarısızsa diyalog açık kalır, yeniden denenir ve kaydetmeden çıkış hâlâ mümkündür', async () => {
    const save = vi
      .fn<(signal: AbortSignal) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk dolu'))
      .mockResolvedValueOnce(undefined);
    const result = showExitPrompt({ save });
    button(t('core:dialog.exit.saveAndExit')).click();
    await turn();
    await turn();
    expect(latest().querySelector('.vol-dialog__alert')?.textContent).toBe(t('core:dialog.failed'));
    expect(button(t('core:dialog.exit.discardAndExit')).disabled).toBe(false);
    expect(button(t('core:dialog.exit.stay')).disabled).toBe(false);
    button(t('core:dialog.exit.saveAndExit')).click();
    await expect(result).resolves.toBe('save');
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('showPermissionPrompt', () => {
  it('gerekçesiz izin istemi açılmaz (söz reddedilir)', async () => {
    await expect(showPermissionPrompt({ title: 'Mikrofon', reason: '   ' })).rejects.toThrow(
      /gerekçe/,
    );
    expect(document.querySelector('.vol-dialog')).toBeNull();
  });

  it('gerekçeyi açıklama olarak gösterir; izin ver, izin verme ve Escape sonuçları', async () => {
    const allow = showPermissionPrompt({ title: 'Mikrofon', reason: 'Sesli komut için gerekir.' });
    expect(role()).toBe('dialog');
    expect(latest().textContent).toContain('Sesli komut için gerekir.');
    // İzin isteminde ilk odak "izin verme"dir: yanlış Enter izin vermez.
    expect(document.activeElement).toBe(button(t('core:dialog.permission.deny')));
    button(t('core:dialog.permission.allow')).click();
    await expect(allow).resolves.toBe('allow');

    const deny = showPermissionPrompt({ title: 'Mikrofon', reason: 'Sesli komut için gerekir.' });
    button(t('core:dialog.permission.deny')).click();
    await expect(deny).resolves.toBe('deny');

    const escaped = showPermissionPrompt({
      title: 'Mikrofon',
      reason: 'Sesli komut için gerekir.',
    });
    escape();
    await expect(escaped).resolves.toBe('deny');
  });

  it('gerçek istek reddedilirse hata ve yeniden deneme çıkar; izin verme isteği çalıştırmaz', async () => {
    const request = vi
      .fn<(signal: AbortSignal) => Promise<void>>()
      .mockRejectedValueOnce(new Error('sistem reddetti'));
    const result = showPermissionPrompt({ title: 'Mikrofon', reason: 'Neden', request });
    button(t('core:dialog.permission.allow')).click();
    await turn();
    await turn();
    expect(request).toHaveBeenCalledOnce();
    expect(latest().querySelector('.vol-dialog__alert')?.textContent).toBe(t('core:dialog.failed'));
    button(t('core:dialog.permission.deny')).click();
    await expect(result).resolves.toBe('deny');
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('showSyncConflict', () => {
  const local = { summary: '12 Eki 2026 14:03 · 48 KB' };
  const remote = { summary: '11 Eki 2026 21:40 · 51 KB' };

  it('iki kopyayı karşılaştırır, her eylemin sonucunu yazar ve ilk odak iptaldedir', async () => {
    const result = showSyncConflict({ local, remote });
    expect(role()).toBe('alertdialog');
    const rows = [...latest().querySelectorAll('.vol-dialog__details dd')].map(
      (node) => node.textContent,
    );
    expect(rows).toEqual([local.summary, remote.summary]);
    const terms = [...latest().querySelectorAll('.vol-dialog__details dt')].map(
      (node) => node.textContent,
    );
    expect(terms).toEqual([t('core:dialog.conflict.local'), t('core:dialog.conflict.remote')]);
    expect(latest().textContent).toContain(t('core:dialog.conflict.keepLocalNote'));
    expect(latest().textContent).toContain(t('core:dialog.conflict.useRemoteNote'));
    expect(latest().textContent).toContain(t('core:dialog.conflict.cancelNote'));
    expect(document.activeElement).toBe(button(t('core:dialog.cancel')));
    escape();
    await expect(result).resolves.toBe('cancel');
  });

  it('kopya adı çağıranın verdiği etikettir', async () => {
    const result = showSyncConflict({
      local: { label: 'Dizüstü', summary: 'a' },
      remote: { label: 'Bulut', summary: 'b' },
    });
    const terms = [...latest().querySelectorAll('.vol-dialog__details dt')].map(
      (node) => node.textContent,
    );
    expect(terms).toEqual(['Dizüstü', 'Bulut']);
    escape();
    await result;
  });

  it('seçim çözüm işini doğru kopyayla çağırır; bekleme sürerken yalnız iptal açıktır', async () => {
    let finish!: () => void;
    const resolve = vi.fn(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const result = showSyncConflict({ local, remote, resolve });
    button(t('core:dialog.conflict.useRemote')).click();
    expect(resolve).toHaveBeenCalledWith('remote', expect.any(AbortSignal));
    expect(button(t('core:dialog.conflict.keepLocal')).disabled).toBe(true);
    expect(button(t('core:dialog.cancel')).disabled).toBe(false);
    expect(latest().querySelector('.vol-dialog__status')?.textContent).toBe(t('core:dialog.busy'));
    finish();
    await expect(result).resolves.toBe('remote');
  });

  it('çözüm başarısızsa açık hata, yeniden deneme ve iptal vardır; iptalde çözüm sinyali iptal olur', async () => {
    const signals: AbortSignal[] = [];
    const attempts: Array<() => void> = [];
    const resolve = vi.fn((_choice: 'local' | 'remote', signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((done, fail) => {
        attempts.push(() => (attempts.length === 1 ? fail(new Error('ağ')) : done()));
      });
    });
    const result = showSyncConflict({ local, remote, resolve });
    button(t('core:dialog.conflict.keepLocal')).click();
    attempts[0]();
    await turn();
    await turn();
    expect(latest().querySelector('.vol-dialog__alert')?.textContent).toBe(
      t('core:dialog.conflict.failed'),
    );
    expect(button(t('core:dialog.conflict.keepLocal')).disabled).toBe(false);
    expect(button(t('core:dialog.conflict.useRemote')).disabled).toBe(false);

    button(t('core:dialog.conflict.keepLocal')).click();
    expect(signals).toHaveLength(2);
    button(t('core:dialog.cancel')).click();
    await expect(result).resolves.toBe('cancel');
    expect(signals[1].aborted).toBe(true);
  });

  it('iptal çözüm işini hiç çağırmaz', async () => {
    const resolve = vi.fn();
    const result = showSyncConflict({ local, remote, resolve });
    button(t('core:dialog.cancel')).click();
    await expect(result).resolves.toBe('cancel');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('varsayılan metinler bir bulut hizmeti adı anmaz (gerçek AutoCloud diye sunulmaz)', async () => {
    const forbidden = /steam|autocloud|bulut|cloud/i;
    // Gösterilen diyalog (geçerli dil) ve iki dilin tüm çakışma metinleri.
    const shown = showSyncConflict({ local, remote });
    expect(latest().textContent).not.toMatch(forbidden);
    escape();
    await expect(shown).resolves.toBe('cancel');
    for (const bundle of [coreTr.dialog.conflict, coreEn.dialog.conflict]) {
      for (const text of Object.values(bundle)) expect(text).not.toMatch(forbidden);
    }
  });
});
