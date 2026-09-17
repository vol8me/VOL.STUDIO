import { describe, expect, it } from 'vitest';
import { LifeResearchPanel, type ResearchPanelOptions } from '@/runtime/ui/LifeResearchPanel';

const labels = { camera: 'Kamera adayı', audition: 'Audition adayı', seed: 'Tohum' };

function mount(overrides: Partial<ResearchPanelOptions> = {}) {
  const applied: string[] = [];
  const panel = new LifeResearchPanel({
    cameraCandidateIds: ['dengeli', 'cevik', 'agir'],
    activeCameraId: 'dengeli',
    audition: { entryIndex: 1, entryCount: 4, seedIndex: 0, seedCount: 3, digest: 'a'.repeat(16) },
    labels,
    search: '?audition=2&seed=1',
    navigate: (query) => applied.push(query.toString()),
    ...overrides,
  });
  document.body.appendChild(panel.element);
  return { panel, applied };
}

function rowButtons(key: string): HTMLButtonElement[] {
  const row = document.querySelector(`[data-research="${key}"]`);
  return [...(row?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
}

describe('LifeResearchPanel (P1/P2 kabul oturumu)', () => {
  it('kamera adayı ve audition gezinme satırlarını kurar', () => {
    const { panel } = mount();
    expect(document.querySelector('[data-research="camera"]')).not.toBeNull();
    expect(document.querySelector('[data-research="audition"]')).not.toBeNull();
    expect(document.querySelector('[data-research="seed"]')).not.toBeNull();
    expect(document.querySelector('.vol-life-research__position')?.textContent).toBe('2/4');
    panel.destroy();
  });

  it('katalog yoksa yalnız kamera satırı kurulur', () => {
    const { panel } = mount({ audition: null });
    expect(document.querySelector('[data-research="camera"]')).not.toBeNull();
    expect(document.querySelector('[data-research="audition"]')).toBeNull();
    panel.destroy();
  });

  /* Var olan sorgu KORUNUR: kamera değişince audition seçimi düşmez. */
  it('kamera seçimi audition sorgusunu korur', () => {
    const { panel, applied } = mount();
    const options = [...document.querySelectorAll('button')].filter(
      (button) => button.textContent === 'agir',
    );
    options[0].click();
    expect(applied).toHaveLength(1);
    expect(applied[0]).toContain('camera=agir');
    expect(applied[0]).toContain('audition=2');
    expect(applied[0]).toContain('seed=1');
    panel.destroy();
  });

  it('ileri ve geri düğmeleri bir adım ilerletir', () => {
    const { panel, applied } = mount();
    const [previous, next] = rowButtons('audition');
    next.click();
    previous.click();
    expect(applied[0]).toContain('audition=3');
    expect(applied[1]).toContain('audition=1');
    panel.destroy();
  });

  /* Sarmalama YOK: uçtaki düğme devre dışıdır, sessizce başa dönmez. */
  it('uçlarda düğmeler devre dışıdır', () => {
    const { panel } = mount({
      audition: {
        entryIndex: 0,
        entryCount: 2,
        seedIndex: 1,
        seedCount: 2,
        digest: 'b'.repeat(16),
      },
    });
    const [auditionPrev, auditionNext] = rowButtons('audition');
    const [seedPrev, seedNext] = rowButtons('seed');
    expect(auditionPrev.disabled).toBe(true);
    expect(auditionNext.disabled).toBe(false);
    expect(seedPrev.disabled).toBe(false);
    expect(seedNext.disabled).toBe(true);
    panel.destroy();
  });

  it('destroy panelin düğmelerini temizler', () => {
    const { panel } = mount();
    panel.element.remove();
    panel.destroy();
    expect(document.querySelector('[data-research="camera"]')).toBeNull();
  });
});
