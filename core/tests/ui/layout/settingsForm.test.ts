import { describe, expect, it } from 'vitest';
import { SettingsForm, SettingsRow } from '../../../src/ui/layout/SettingsForm';

function control(): { element: HTMLButtonElement } {
  return { element: document.createElement('button') };
}

describe('SettingsForm', () => {
  it('etiketli kontrolleri ortak satır ve kontrol yuvasında toplar', () => {
    const input = control();
    const row = new SettingsRow({ label: 'Dil', control: input, stackOnNarrow: true });
    const form = new SettingsForm({ className: 'örnek' }).add(row);

    expect(form.element.className).toBe('vol-settings-form örnek');
    expect(row.element.textContent).toBe('Dil');
    expect(row.element.querySelector('.vol-settings-row__control')?.firstChild).toBe(input.element);
    expect(row.element.classList).toContain('vol-settings-row--stack-narrow');

    row.setLabel('Language');
    expect(row.element.textContent).toBe('Language');
  });

  it('kendi etiketini taşıyan kontrolü tek sütunlu ayar satırı yapar', () => {
    const row = new SettingsRow({ control: control() });

    expect(row.element.classList).toContain('vol-settings-row--self-labeled');
    expect(row.element.querySelector('.vol-settings-row__label')).toBeNull();
  });

  it('kapsayıcı ve satır kapanışları idempotenttir', () => {
    const row = new SettingsRow({ label: 'Dil', control: control() });
    const form = new SettingsForm().add(row);
    document.body.appendChild(form.element);

    row.destroy();
    row.destroy();
    form.destroy();
    form.destroy();

    expect(form.element.isConnected).toBe(false);
  });
});

describe('SettingsRow erişilebilirlik ve SettingsForm kilidi', () => {
  it('görünür etiket ve açıklama denetime bağlanır; düğmede değer adın parçası kalır', () => {
    const input = document.createElement('input');
    const row = new SettingsRow({
      label: 'Ses',
      description: 'Genel seviye',
      control: { element: input },
    });
    document.body.appendChild(row.element);
    const label = row.element.querySelector('.vol-settings-row__label')!;
    expect(input.getAttribute('aria-labelledby')).toBe(label.id);
    expect(input.getAttribute('aria-describedby')).toBe(
      row.element.querySelector('.vol-settings-row__description')!.id,
    );

    const button = document.createElement('button');
    const buttonRow = new SettingsRow({ label: 'Dil', control: { element: button } });
    document.body.appendChild(buttonRow.element);
    const ids = button.getAttribute('aria-labelledby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(button.id);
  });

  it('kendi adı olan denetimin adı ezilmez', () => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Kendi adı');
    new SettingsRow({ label: 'Ses', control: { element: input } });
    expect(input.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('hata satırı aria-invalid ve aria-describedby kurar, temizleyince kaldırır', () => {
    const input = document.createElement('input');
    const row = new SettingsRow({ label: 'Ad', control: { element: input } });
    document.body.appendChild(row.element);
    const error = row.element.querySelector<HTMLElement>('.vol-settings-row__error')!;
    expect(error.hidden).toBe(true);
    row.setError('Boş olamaz');
    expect(error.hidden).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    row.setError(null);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('runExclusive sürerken ikinci çağrıyı başlatmaz ve aria-busy yönetir', async () => {
    const form = new SettingsForm();
    let release: () => void = () => undefined;
    const first = form.runExclusive(() => new Promise<void>((resolve) => (release = resolve)));
    expect(form.isBusy()).toBe(true);
    expect(form.element.getAttribute('aria-busy')).toBe('true');
    expect(await form.runExclusive(() => undefined)).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(form.isBusy()).toBe(false);
    expect(form.element.hasAttribute('aria-busy')).toBe(false);
  });

  it('görev hata fırlatırsa kilit açılır', async () => {
    const form = new SettingsForm();
    await expect(
      form.runExclusive(() => {
        throw new Error('disk dolu');
      }),
    ).rejects.toThrow('disk dolu');
    expect(form.isBusy()).toBe(false);
  });
});
