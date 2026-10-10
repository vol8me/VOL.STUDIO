import { afterEach, describe, expect, it, vi } from 'vitest';
import { PauseResumeButton } from '../../../src/ui/buttons/PauseResumeButton';
import { PauseCounter } from '../../../src/ui/buttons/pauseCounter';

/**
 * PauseResumeButton sayaç tarifi (UI-10.3): düğmenin sunumundan ayrı, DOM'suz `PauseCounter`. Süre tik sayısından değil
 * geçen gerçek zamandan türetilir: duraklatma kesirli saniyeyi dondurur, geç tetiklenen zamanlayıcı geri kalmaz.
 * Saat enjekte edilir; zamanlayıcılar sahtedir.
 */
let clock = 0;
const now = (): number => clock;

/** Saati ve zamanlayıcıları milisaniye milisaniye ilerletir (her zamanlayıcı kendi anındaki saati görür). */
function advance(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 1) {
    clock += 1;
    vi.advanceTimersByTime(1);
  }
}

function setup(): void {
  vi.useFakeTimers();
  clock = 0;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('PauseCounter', () => {
  it("'up' çalışırken her saniye bir artar ve onTick tam saniyede çağrılır", () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({ direction: 'up', onTick, now });
    counter.resume();
    advance(999);
    expect(onTick).not.toHaveBeenCalled();
    advance(1);
    expect(onTick).toHaveBeenCalledExactlyOnceWith(1);
    advance(2000);
    expect(onTick.mock.calls.map(([seconds]) => seconds)).toEqual([1, 2, 3]);
    expect(counter.getSeconds()).toBe(3);
  });

  it('duraklatma kesirli saniyeyi dondurur: devam edince kalan kısım sayılır, tam saniye yenmez', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({ direction: 'up', onTick, now });
    counter.resume();
    advance(900);
    counter.pause();
    advance(60_000); // duraklatılmışken saat akar; sayaç ilerlemez
    expect(counter.getSeconds()).toBe(0);
    expect(onTick).not.toHaveBeenCalled();

    counter.resume();
    advance(99);
    expect(onTick).not.toHaveBeenCalled();
    advance(1); // 900 + 100 = 1000 ms
    expect(onTick).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('tekrarlı duraklat/devam eder döngüsü zamanı sızdırmaz (eski setInterval her seferinde bir saniye yerdi)', () => {
    setup();
    const counter = new PauseCounter({ direction: 'up', now });
    counter.resume();
    for (let cycle = 0; cycle < 10; cycle += 1) {
      advance(500);
      counter.pause();
      counter.resume();
    }
    // 10 × 500 ms = 5 sn çalıştı.
    expect(counter.getSeconds()).toBe(5);
  });

  it('geç tetiklenen zamanlayıcı (arka plan kısması) geçen süre kadar ilerler, ara saniyeler tek çağrıda atlanır', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({ direction: 'up', onTick, now });
    counter.resume();
    clock += 5300; // zamanlayıcı hiç tetiklenmeden 5,3 sn geçti
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledExactlyOnceWith(5);
    expect(counter.getSeconds()).toBe(5);
  });

  it('erken tetiklenen zamanlayıcı sahte saniye üretmez, yeniden kurulur', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({ direction: 'up', onTick, now });
    counter.resume();
    clock += 999.4; // zamanlayıcı 1000 ms'de tetiklenir ama saat henüz sınıra varmadı
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();
    clock += 1;
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("'down' 0'a ulaşınca bir kez tamamlanır ve kendiliğinden durur", () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const onComplete = vi.fn();
    const counter = new PauseCounter({
      direction: 'down',
      startSeconds: 3,
      onTick,
      onComplete,
      now,
    });
    counter.resume();
    advance(3000);
    expect(onTick.mock.calls.map(([seconds]) => seconds)).toEqual([2, 1, 0]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(counter.isRunning()).toBe(false);
    advance(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("'down' başlangıç saniyesi 0 ise ilk saniye sınırında tamamlanır", () => {
    setup();
    const onComplete = vi.fn();
    const counter = new PauseCounter({ direction: 'down', onComplete, now });
    counter.resume();
    advance(999);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(counter.getSeconds()).toBe(0);
  });

  it("'down' negatif/kesirli başlangıcı tamsayıya ve 0'a kenetler", () => {
    expect(new PauseCounter({ direction: 'down', startSeconds: -4 }).getSeconds()).toBe(0);
    expect(new PauseCounter({ direction: 'down', startSeconds: 2.9 }).getSeconds()).toBe(2);
  });

  it('tamamlanmış sayaç sürdürülürse sıradaki saniyede onComplete yeniden çağrılır ve yine durur (eski sözleşme)', () => {
    setup();
    const onComplete = vi.fn();
    const counter = new PauseCounter({ direction: 'down', startSeconds: 1, onComplete, now });
    counter.resume();
    advance(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    counter.resume();
    advance(1000);
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(counter.isRunning()).toBe(false);
  });

  it('resume/pause tekrarında iki katmanlı zamanlayıcı kurmaz', () => {
    setup();
    const counter = new PauseCounter({ direction: 'up', now });
    counter.resume();
    counter.resume();
    expect(vi.getTimerCount()).toBe(1);
    counter.pause();
    counter.pause();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('onTick içinde duraklatan sahip zamanlayıcıyı yeniden kurdurmaz', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({
      direction: 'up',
      onTick: (seconds) => {
        onTick(seconds);
        counter.pause();
      },
      now,
    });
    counter.resume();
    advance(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    advance(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('dispose zamanlayıcıyı bırakır ve sonraki resume işe yaramaz', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const counter = new PauseCounter({ direction: 'up', onTick, now });
    counter.resume();
    counter.dispose();
    expect(vi.getTimerCount()).toBe(0);
    counter.resume();
    advance(5000);
    expect(onTick).not.toHaveBeenCalled();
  });
});

describe('PauseResumeButton + sayaç tarifi', () => {
  it('düğme sunum, sayaç tarif: counter verilmezse hiçbir zamanlayıcı kurulmaz', () => {
    setup();
    const button = new PauseResumeButton();
    expect(vi.getTimerCount()).toBe(0);
    expect(button.getSeconds()).toBe(0);
    expect(button.element.querySelector('.vol-pause-resume-button__counter')).toBeNull();
    button.destroy();
  });

  it('düğmeyle duraklatma kesirli saniyeyi dondurur ve sayaç metni güncellenir', () => {
    setup();
    const onTick = vi.fn<(seconds: number) => void>();
    const button = new PauseResumeButton({ counter: { direction: 'up', onTick } });
    document.body.append(button.element);
    const text = (): string =>
      button.element.querySelector('.vol-pause-resume-button__counter')!.textContent ?? '';
    expect(text()).toBe('0:00');

    vi.advanceTimersByTime(900);
    button.element.click(); // duraklat
    expect(button.getIsRunning()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(button.getSeconds()).toBe(0);

    button.element.click(); // devam
    vi.advanceTimersByTime(99);
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledExactlyOnceWith(1);
    expect(text()).toBe('0:01');
    button.destroy();
  });

  it("'down' tamamlanınca düğme duraklatılmış görünür ve onComplete bir kez çağrılır", () => {
    setup();
    const onComplete = vi.fn();
    const button = new PauseResumeButton({
      counter: { direction: 'down', startSeconds: 2, onComplete },
    });
    vi.advanceTimersByTime(2000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button.getIsRunning()).toBe(false);
    expect(button.element.getAttribute('aria-label')).toBe('Devam Et');
    expect(vi.getTimerCount()).toBe(0);
    button.destroy();
  });

  it('syncRunning sayacı sessizce durdurur ve sürdürür (onToggle yok)', () => {
    setup();
    const onToggle = vi.fn();
    const button = new PauseResumeButton({ onToggle, counter: { direction: 'up' } });
    vi.advanceTimersByTime(2000);
    button.syncRunning(false);
    vi.advanceTimersByTime(5000);
    expect(button.getSeconds()).toBe(2);
    button.syncRunning(true);
    vi.advanceTimersByTime(1000);
    expect(button.getSeconds()).toBe(3);
    expect(onToggle).not.toHaveBeenCalled();
    button.destroy();
  });
});
