import { describe, expect, it } from 'vitest';
import { SettingsForm, SettingsRow } from '../../src/ui/layout/SettingsForm';

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
