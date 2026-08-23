import { describe, it, expect, vi } from 'vitest';
import { Input } from '../../src/ui/primitives/Input';
import { TextArea } from '../../src/ui/primitives/TextArea';
import { NumberStepper } from '../../src/ui/primitives/NumberStepper';
import { Slider } from '../../src/ui/primitives/Slider';
import { RangeSlider } from '../../src/ui/primitives/RangeSlider';
import { Checkbox } from '../../src/ui/primitives/Checkbox';
import { RadioGroup } from '../../src/ui/primitives/RadioGroup';
import { SegmentedControl } from '../../src/ui/primitives/SegmentedControl';

describe('Input kontrolleri - programatik setter sözleşmesi', () => {
  it('Input.setValue sessizdir', () => {
    const onInput = vi.fn();
    const input = new Input({ onInput });
    input.setValue('yeni değer');
    expect(onInput).not.toHaveBeenCalled();
    input.destroy();
  });

  it('TextArea.setValue sessizdir', () => {
    const onInput = vi.fn();
    const area = new TextArea({ onInput, maxLength: 100 });
    area.setValue('yeni metin');
    expect(onInput).not.toHaveBeenCalled();
    area.destroy();
  });

  it('NumberStepper.setValue sessizdir', () => {
    const onChange = vi.fn();
    const stepper = new NumberStepper({ onChange, value: 5 });
    stepper.setValue(12);
    expect(onChange).not.toHaveBeenCalled();
    stepper.destroy();
  });

  it('Slider.setValue değeri sınırlandırır ve onChange TETİKLEMEZ', () => {
    const onChange = vi.fn();
    const slider = new Slider({ onChange, min: 0, max: 100, value: 50 });

    slider.setValue(150);

    expect(slider.getValue()).toBe(100);
    // Programatik atama sessizdir: onChange -> state -> setValue -> onChange
    // geri besleme döngüsünü baştan imkansız kılar.
    expect(onChange).not.toHaveBeenCalled();
    slider.destroy();
  });

  it('Slider.setValueAndNotify hem değeri ayarlar hem onChange tetikler', () => {
    const onChange = vi.fn();
    const slider = new Slider({ onChange, min: 0, max: 100, value: 50 });

    slider.setValueAndNotify(150);

    expect(slider.getValue()).toBe(100);
    expect(onChange).toHaveBeenCalledWith(100);
    slider.destroy();
  });

  it('RangeSlider.setValue sessizdir ve step=0 çökmez', () => {
    const onChange = vi.fn();
    const slider = new RangeSlider({
      onChange,
      min: 0,
      max: 100,
      step: 0,
      value: { min: 10, max: 90 },
    });
    slider.setValue({ min: 20, max: 80 });
    expect(onChange).not.toHaveBeenCalled();

    // step=0 varsayılan 1'e çekilir, NaN/Infinity üretmemeli
    const value = slider.getValue();
    expect(Number.isFinite(value.min)).toBe(true);
    expect(Number.isFinite(value.max)).toBe(true);
    slider.destroy();
  });

  it('Checkbox.setChecked sessizdir', () => {
    const onChange = vi.fn();
    const checkbox = new Checkbox({ onChange, checked: false });
    checkbox.setChecked(true);
    expect(onChange).not.toHaveBeenCalled();
    checkbox.destroy();
  });

  it('RadioGroup.setValue sessizdir', () => {
    const onChange = vi.fn();
    const group = new RadioGroup({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
      onChange,
    });
    group.setValue('b');
    expect(onChange).not.toHaveBeenCalled();
    group.destroy();
  });

  it('SegmentedControl.setValue sessizdir', () => {
    const onChange = vi.fn();
    const control = new SegmentedControl({
      options: [
        { value: 'easy', label: 'Kolay' },
        { value: 'hard', label: 'Zor' },
      ],
      value: 'easy',
      onChange,
    });
    control.setValue('hard');
    expect(onChange).not.toHaveBeenCalled();
    control.destroy();
  });
});

/**
 * RangeSlider pointer sürükleme testleri: jsdom `getBoundingClientRect()`i
 * gerçekten hesaplamaz (her zaman 0 döner) — track genişliğini simüle etmek
 * için `mockTrackRect` ile track elementinin rect'i sabit bir dikdörtgene
 * (`{left:0, width:200}`) mocklanır, `clientX` bu genişliğe göre bir oran
 * ifade eder (ör. clientX=100 → track'in tam ortası).
 */
describe('RangeSlider - pointer sürükleme ve çarpışma', () => {
  function mockTrackRect(track: HTMLElement, width = 200): void {
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: width,
      top: 0,
      bottom: 16,
      width,
      height: 16,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  }

  function pointerDownOnHandle(handle: HTMLElement, clientX: number): void {
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX,
        clientY: 8,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function pointerMove(track: HTMLElement, clientX: number): void {
    track.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX,
        clientY: 8,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it('min tutamacı sürüklenince değer track genişliğine göre doğru hesaplanır', () => {
    const onChange = vi.fn();
    const slider = new RangeSlider({ min: 0, max: 100, value: { min: 0, max: 100 }, onChange });
    const track = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    const minHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--min',
    )!;
    mockTrackRect(track);

    // Track'in %25'i (clientX=50/200) -> değer 25
    pointerDownOnHandle(minHandle, 0);
    pointerMove(track, 50);

    expect(slider.getValue().min).toBe(25);
    slider.destroy();
  });

  it('min tutamacı max değerini GEÇEMEZ (itmez) — kendi sınırında durur', () => {
    const onChange = vi.fn();
    const slider = new RangeSlider({ min: 0, max: 100, value: { min: 0, max: 40 }, onChange });
    const track = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    const minHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--min',
    )!;
    mockTrackRect(track);

    // min tutamacını track'in %90'ına (değer 90) sürüklemeye çalış — max=40'ı geçemez
    pointerDownOnHandle(minHandle, 0);
    pointerMove(track, 180);

    const value = slider.getValue();
    expect(value.min).toBe(40);
    expect(value.max).toBe(40); // max İTİLMEDİ, min kendi sınırında (max'ta) durdu
    slider.destroy();
  });

  it('max tutamacı min değerinin ALTINA İNEMEZ (itmez) — kendi sınırında durur', () => {
    const slider = new RangeSlider({ min: 0, max: 100, value: { min: 60, max: 100 } });
    const track = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    const maxHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--max',
    )!;
    mockTrackRect(track);

    // max tutamacını track'in %10'una (değer 10) sürüklemeye çalış — min=60'ın altına inemez
    pointerDownOnHandle(maxHandle, 180);
    pointerMove(track, 20);

    const value = slider.getValue();
    expect(value.max).toBe(60);
    expect(value.min).toBe(60); // min İTİLMEDİ, max kendi sınırında (min'de) durdu
    slider.destroy();
  });

  it('iki tutamaç eşit değerde (ör. Lv.1-Lv.1) kilitlenmeden durabilir ve tekrar ayrılabilir', () => {
    const slider = new RangeSlider({ min: 0, max: 100, value: { min: 50, max: 50 } });
    expect(slider.getValue()).toEqual({ min: 50, max: 50 });

    const track = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    const maxHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--max',
    )!;
    mockTrackRect(track);

    // max'ı tekrar yukarı sürükle — min'de "kilitli" kalmamalı
    pointerDownOnHandle(maxHandle, 100);
    pointerMove(track, 160);

    const value = slider.getValue();
    expect(value.max).toBe(80);
    expect(value.min).toBe(50);
    slider.destroy();
  });

  it('setValue ile min>max verilirse çarpışma kuralına göre otomatik sıralanır (itme değil, sıralama)', () => {
    const slider = new RangeSlider({ min: 0, max: 100 });
    slider.setValue({ min: 80, max: 20 });
    expect(slider.getValue()).toEqual({ min: 20, max: 80 });
    slider.destroy();
  });

  it("tutamaç konumu DOM'a HİÇ bağlanmadan (constructor sonrası, appendChild öncesi) bile taşma-önleme calc() ifadesini üretir", () => {
    // KRİTİK regresyon testi: önceki bir tasarım track.getBoundingClientRect()
    // ile "taşma payı" hesaplıyordu — bu, yalnızca element GERÇEKTEN DOM'a
    // appendChild edildikten SONRA doğru sonuç veriyordu. constructor'ın
    // kendi render() çağrısı element mount edilmeden ÖNCE çalıştığından
    // rect.width her zaman 0 dönüp taşma-önlemeyi etkisiz kılıyordu — yani
    // component'i oluşturup hiç DOM'a eklemeden (ya da henüz layout almadan)
    // ilk kez görüntülediğinizde tutamaçlar YİNE taşıyordu. Bu test elementi
    // BİLEREK document'a hiç eklemez; yeni implementasyon DOM'dan hiçbir
    // ölçüm almadığı (render() saf matematik + calc() string'i üretir) için
    // bu senaryoda da doğru sonuç vermelidir.
    const slider = new RangeSlider({ min: 0, max: 100, value: { min: 0, max: 100 } });
    const minHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--min',
    )!;
    const maxHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--max',
    )!;

    // Tarayıcı/jsdom style.left'e yazılan calc() ifadesini kendi normalize
    // edilmiş formuna sadeleştirebildiği için (ör. "X * (100% - 18px) / 100"
    // -> "X * (100% - 18px)") ham string'i birebir karşılaştırmak kırılgan
    // olurdu — bunun yerine ifadenin 9px SABİT terimi içerdiğini (taşma
    // önleme payı) ve 18px handle genişliğini referans aldığını doğrularız.
    // Handle genişliği 18px -> yarı genişlik 9px. value=min (X=0) iken
    // handle'ın merkezi track'in sol kenarından TAM OLARAK 9px içeride
    // olmalı (0px'te OLMAMALI, aksi halde translate(-50%) ile sol kenardan
    // taşar) — calc() ifadesindeki sabit terim bunu garanti eder.
    expect(minHandle.style.left).toContain('calc(9px');
    expect(minHandle.style.left).toContain('18px');
    // value=max (X=100) iken handle'ın merkezi sağ kenardan aynı miktarda
    // içeride olmalı — aynı calc() formülü, farklı bir X ile.
    expect(maxHandle.style.left).toContain('calc(9px');
    expect(maxHandle.style.left).toContain('18px');
    expect(maxHandle.style.left).not.toBe(minHandle.style.left);

    slider.destroy();
  });

  it("ok tuşlarıyla klavye hareketi de çarpışma kuralına uyar (min max'ı geçemez)", () => {
    const slider = new RangeSlider({ min: 0, max: 100, step: 10, value: { min: 40, max: 50 } });
    const minHandle = slider.element.querySelector<HTMLDivElement>(
      '.vol-range-slider__handle--min',
    )!;

    // min'i 40 -> 50 -> 60 (max'ı geçmeye çalış) yönünde ilerlet
    minHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(slider.getValue().min).toBe(50);

    minHandle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    const value = slider.getValue();
    expect(value.min).toBe(50); // max'ı (50) geçemedi
    expect(value.max).toBe(50); // max itilmedi
    slider.destroy();
  });

  it('destroy track pointer listenerlarını temizler', () => {
    const slider = new RangeSlider();
    const track = slider.element.querySelector<HTMLDivElement>('.vol-range-slider__track')!;
    const removeListener = vi.spyOn(track, 'removeEventListener');

    slider.destroy();

    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});
