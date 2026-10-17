import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wizard, type WizardStep } from '../../../src/ui/layout/Wizard';

const mounted: Wizard[] = [];
const next = (wizard: Wizard) =>
  wizard.element.querySelector<HTMLButtonElement>('.vol-wizard__nav-button--next')!;

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function make(validate: WizardStep['validate'], onFinish = vi.fn(), onStepChange = vi.fn()) {
  const steps: WizardStep[] = ['a', 'b', 'c'].map((id) => ({
    id,
    title: id,
    content: { element: document.createElement('div') },
    validate: id === 'a' ? validate : undefined,
  }));
  const wizard = new Wizard({ steps, onFinish, onStepChange });
  document.body.appendChild(wizard.element);
  mounted.push(wizard);
  return wizard;
}

afterEach(() => {
  mounted.splice(0).forEach((wizard) => wizard.destroy());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Wizard bekleyen doğrulama sahipliği', () => {
  it('destroy sonrasında çözülen doğrulama adım, callback veya yeni geçiş başlatmaz', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const onStepChange = vi.fn();
    const wizard = make(() => pending.promise, vi.fn(), onStepChange);
    next(wizard).click();
    wizard.destroy();
    pending.resolve(true);
    await Promise.resolve();
    expect(wizard.getCurrentIndex()).toBe(0);
    expect(onStepChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('başka adıma geçince eski doğrulama son adımı tamamlamaz', async () => {
    const pending = deferred();
    const onFinish = vi.fn();
    const wizard = make(() => pending.promise, onFinish);
    next(wizard).click();
    wizard.goToStep(2);
    pending.resolve(true);
    await Promise.resolve();
    expect(onFinish).not.toHaveBeenCalled();
    expect(next(wizard).disabled).toBe(false);
    next(wizard).click();
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)(
    'eski %s yeni doğrulamayı açmaz veya yeni adımı ilerletmez',
    async (settle) => {
      const old = deferred();
      const current = deferred();
      const validations = [old.promise, current.promise];
      const wizard = make(() => validations.shift()!);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      next(wizard).click();
      wizard.goToStep(0);
      expect(next(wizard).disabled).toBe(false);
      next(wizard).click();
      if (settle === 'resolve') old.resolve(true);
      else old.reject(new Error('Eski doğrulama'));
      await Promise.resolve();
      expect(wizard.getCurrentIndex()).toBe(0);
      expect(next(wizard).disabled).toBe(true);
      expect(error).not.toHaveBeenCalled();
      current.resolve(true);
      await Promise.resolve();
      expect(wizard.getCurrentIndex()).toBe(1);
      expect(next(wizard).disabled).toBe(false);
    },
  );

  it('destroy sonrasında reddedilen doğrulama hata bildirmez', async () => {
    const pending = deferred();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wizard = make(() => pending.promise);
    next(wizard).click();
    wizard.destroy();
    pending.reject(new Error('Eski doğrulama'));
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
  });

  it('hızlı adım geçişleri sökümde eski zamanlayıcı bırakmaz', () => {
    vi.useFakeTimers();
    const wizard = make(undefined);
    wizard.goToStep(1);
    wizard.goToStep(2);
    wizard.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
